"""
历史杂志抓取网站 - 从 Project Gutenberg 抓取并展示历史书籍
"""
from contextlib import asynccontextmanager
from html import unescape
from html.parser import HTMLParser
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

GUTENDEX_API_URL = "https://gutendex.com/books/"

HTTP_CLIENT: httpx.AsyncClient


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


class _VisibleTextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._parts: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_depth += 1
            return
        if self._skip_depth > 0:
            return
        if tag in {"p", "div", "section", "article", "br", "li", "h1", "h2", "h3", "h4"}:
            self._parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_depth = max(0, self._skip_depth - 1)
            return
        if self._skip_depth > 0:
            return
        if tag in {"p", "div", "section", "article", "li"}:
            self._parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth > 0:
            return
        if data.strip():
            self._parts.append(data.strip())
            self._parts.append(" ")

    def get_text(self) -> str:
        raw = unescape("".join(self._parts))
        lines = [" ".join(line.split()) for line in raw.splitlines()]
        text = "\n".join(line for line in lines if line)
        return text.strip()


async def _fetch_magazine_doc(identifier: str) -> dict[str, Any]:
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
    return results[0]


def _pick_read_source(formats: dict[str, Any], identifier: str) -> tuple[str, str]:
    candidates = (
        "text/plain; charset=utf-8",
        "text/plain",
        "text/html; charset=utf-8",
        "text/html",
    )
    for key in candidates:
        value = formats.get(key)
        if isinstance(value, str) and value:
            return value, key
    return f"https://www.gutenberg.org/files/{identifier}/{identifier}-0.txt", "text/plain"


def _normalize_read_text(raw_text: str, source_format: str) -> str:
    if "html" in source_format:
        parser = _VisibleTextExtractor()
        parser.feed(raw_text)
        parser.close()
        text = parser.get_text()
    else:
        text = raw_text
    return text.replace("\r\n", "\n").strip()


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
    doc = await _fetch_magazine_doc(identifier)
    return JSONResponse(_normalize_magazine_entry(doc))


@app.get("/api/magazine/{identifier}/read")
async def magazine_read(identifier: str) -> JSONResponse:
    """获取站内阅读正文（纯文本）"""
    doc = await _fetch_magazine_doc(identifier)
    formats = doc.get("formats", {})
    source_url, source_format = _pick_read_source(formats, identifier)
    try:
        resp = await HTTP_CLIENT.get(source_url)
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"正文获取失败: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"正文获取失败: {exc}") from exc

    raw_text = resp.text or ""
    content = _normalize_read_text(raw_text, source_format)
    if not content:
        raise HTTPException(status_code=404, detail="该书籍暂无可显示正文")

    normalized = _normalize_magazine_entry(doc)
    return JSONResponse(
        {
            "id": normalized["id"],
            "title": normalized["title"],
            "creator": normalized["creator"],
            "source_url": normalized["webpage_url"],
            "content": content,
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
