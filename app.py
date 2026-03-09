"""
历史杂志抓取网站 - 从 Project Gutenberg 抓取并展示历史书籍
"""
import re
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

GUTENDEX_API_URL = "https://gutendex.com/books/"

HTTP_CLIENT: httpx.AsyncClient

# In-memory chapter cache: {book_id: [{"title": str, "content": str}]}
_CHAPTER_CACHE: dict[str, list[dict[str, str]]] = {}

# Matches common chapter/part/book headings in Project Gutenberg plain-text files
CHAPTER_RE = re.compile(
    r"(?m)^[ \t]{0,4}"
    r"((?:CHAPTER|PART|BOOK|SECTION|VOLUME|ACT)"
    r"[ \t]+(?:[IVXLCDM]{1,10}|\d{1,4}(?:st|nd|rd|th)?"
    r"|(?:THE\s+)?[A-Z][A-Z ]{0,40}?))"
    r"[ \t]*(?:\.|:|—|--)?[ \t]*$",
    re.MULTILINE,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global HTTP_CLIENT
    HTTP_CLIENT = httpx.AsyncClient(timeout=60.0, follow_redirects=True)
    yield
    await HTTP_CLIENT.aclose()


app = FastAPI(title="历史杂志馆", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _normalize_magazine_entry(doc: dict[str, Any]) -> dict[str, Any]:
    """将 Gutendex 返回的书籍转为前端使用的统一格式"""
    identifier = str(doc.get("id", ""))
    title = doc.get("title", "无标题")

    authors = doc.get("authors", [])
    creator = authors[0].get("name", "未知") if authors else "未知"

    subjects = doc.get("subjects", [])
    subject = ", ".join(s.split("--")[-1].strip() for s in subjects[:3]) if subjects else ""

    description = f"下载量: {doc.get('download_count', 0)} | 语言: {', '.join(doc.get('languages', []))}"

    formats = doc.get("formats", {})
    cover = formats.get("image/jpeg", "")

    webpage_url = formats.get("text/html", "") or formats.get("text/plain; charset=utf-8", "")
    if not webpage_url:
        webpage_url = f"https://www.gutenberg.org/ebooks/{identifier}"

    return {
        "id": identifier,
        "title": title,
        "creator": creator,
        "date": "",
        "description": description,
        "subject": subject,
        "thumbnail": cover,
        "webpage_url": webpage_url,
    }


async def _search_magazines(query: str, limit: int) -> list[dict[str, Any]]:
    """从 Project Gutenberg 搜索历史刊物及文献"""
    params = {"search": query}
    try:
        resp = await HTTP_CLIENT.get(GUTENDEX_API_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise RuntimeError(f"Gutendex API 请求失败: {exc}") from exc

    results = data.get("results", [])
    docs = results[:limit]
    return [_normalize_magazine_entry(d) for d in docs if d.get("id")]


async def _fetch_book_text(identifier: str) -> str:
    """从 Gutenberg 获取书籍纯文本内容"""
    url = f"{GUTENDEX_API_URL}?ids={identifier}"
    resp = await HTTP_CLIENT.get(url)
    resp.raise_for_status()
    data = resp.json()

    results = data.get("results", [])
    if not results:
        raise ValueError(f"书籍不存在: {identifier}")

    formats = results[0].get("formats", {})
    text_url = (
        formats.get("text/plain; charset=utf-8")
        or formats.get("text/plain; charset=us-ascii")
        or formats.get("text/plain")
    )
    if not text_url:
        raise ValueError("该书籍无纯文本版本，无法按章节加载")

    text_resp = await HTTP_CLIENT.get(text_url)
    text_resp.raise_for_status()

    try:
        return text_resp.content.decode("utf-8")
    except UnicodeDecodeError:
        return text_resp.content.decode("latin-1", errors="replace")


def _split_chapters(text: str) -> list[dict[str, str]]:
    """将纯文本按章节分割，无章节标题时按段落分页"""
    # 去除 Project Gutenberg 标准页眉
    for marker in (
        "*** START OF THE PROJECT GUTENBERG",
        "*** START OF THIS PROJECT GUTENBERG",
        "*END*THE SMALL PRINT",
    ):
        idx = text.find(marker)
        if idx != -1:
            newline = text.find("\n", idx)
            if newline != -1:
                text = text[newline + 1 :]
            break

    # 去除标准页脚
    for marker in (
        "*** END OF THE PROJECT GUTENBERG",
        "*** END OF THIS PROJECT GUTENBERG",
        "End of the Project Gutenberg",
        "End of Project Gutenberg",
    ):
        idx = text.find(marker)
        if idx != -1:
            text = text[:idx]
            break

    matches = list(CHAPTER_RE.finditer(text))

    if len(matches) < 2:
        # 无章节标题 — 按段落分页，每页约 3000 字符
        paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
        if not paragraphs:
            return [{"title": "全文", "content": text[:30000]}]

        pages: list[str] = []
        current_page: list[str] = []
        current_len = 0
        page_size = 3000

        for para in paragraphs:
            if current_len + len(para) > page_size and current_page:
                pages.append("\n\n".join(current_page))
                current_page = [para]
                current_len = len(para)
            else:
                current_page.append(para)
                current_len += len(para)

        if current_page:
            pages.append("\n\n".join(current_page))

        return [{"title": f"第 {i + 1} 页", "content": p} for i, p in enumerate(pages)]

    chapters = []
    for i, match in enumerate(matches):
        title = match.group(1).strip()
        start = match.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        content = text[start:end].strip()
        if len(content) > 30000:
            content = content[:30000] + "\n\n…（章节内容过长，已截取前部分）"
        chapters.append({"title": title, "content": content})

    return chapters


# ─── 现有 API ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/search")
async def search_magazines(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(18, ge=1, le=36),
) -> JSONResponse:
    try:
        items = await _search_magazines(q, limit)
        return JSONResponse({"query": q, "count": len(items), "items": items})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/magazine/{identifier}")
async def magazine_info(identifier: str) -> JSONResponse:
    """获取单本古腾堡文档详情"""
    url = f"{GUTENDEX_API_URL}?ids={identifier}"
    try:
        resp = await HTTP_CLIENT.get(url)
        resp.raise_for_status()
        data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"获取详情失败: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"获取详情失败: {exc}") from exc

    results = data.get("results", [])
    if not results:
        raise HTTPException(status_code=404, detail=f"文档不存在: {identifier}")

    return JSONResponse(_normalize_magazine_entry(results[0]))


# ─── 章节 API ─────────────────────────────────────────────────────────────────

@app.get("/api/book/{identifier}/chapters")
async def book_chapters(identifier: str) -> JSONResponse:
    """获取书籍章节目录（结果缓存于内存）"""
    if identifier not in _CHAPTER_CACHE:
        try:
            text = await _fetch_book_text(identifier)
            _CHAPTER_CACHE[identifier] = _split_chapters(text)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"获取书籍内容失败: {exc}") from exc

    chapters = _CHAPTER_CACHE[identifier]
    return JSONResponse(
        {
            "id": identifier,
            "total": len(chapters),
            "chapters": [{"index": i, "title": c["title"]} for i, c in enumerate(chapters)],
        }
    )


@app.get("/api/book/{identifier}/chapter/{chapter_num}")
async def book_chapter_content(identifier: str, chapter_num: int) -> JSONResponse:
    """获取特定章节内容"""
    if identifier not in _CHAPTER_CACHE:
        try:
            text = await _fetch_book_text(identifier)
            _CHAPTER_CACHE[identifier] = _split_chapters(text)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"获取书籍内容失败: {exc}") from exc

    chapters = _CHAPTER_CACHE[identifier]
    if chapter_num < 0 or chapter_num >= len(chapters):
        raise HTTPException(status_code=404, detail=f"章节不存在: {chapter_num}")

    chapter = chapters[chapter_num]
    return JSONResponse(
        {
            "id": identifier,
            "chapter_num": chapter_num,
            "title": chapter["title"],
            "content": chapter["content"],
            "total": len(chapters),
            "has_prev": chapter_num > 0,
            "has_next": chapter_num < len(chapters) - 1,
        }
    )


# ─── 静态文件 ─────────────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse("index.html")


@app.get("/index.html", include_in_schema=False)
async def index_html() -> FileResponse:
    return FileResponse("index.html")


@app.get("/styles.css", include_in_schema=False)
async def styles() -> FileResponse:
    return FileResponse("styles.css")


@app.get("/script.js", include_in_schema=False)
async def script() -> FileResponse:
    return FileResponse("script.js")


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    return Response(content=b"", media_type="image/x-icon", status_code=204)
