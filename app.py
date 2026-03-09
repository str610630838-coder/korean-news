"""
历史杂志抓取网站 - 从 Internet Archive 抓取并展示历史杂志
"""
from contextlib import asynccontextmanager
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
    HTTP_CLIENT = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
    yield
    await HTTP_CLIENT.aclose()


app = FastAPI(title="历史杂志馆", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _normalize_magazine_entry(doc: dict[str, Any]) -> dict[str, Any]:
    """将 古腾堡 (Gutendex) 返回的书籍转为前端使用的统一格式"""
    identifier = str(doc.get("id", ""))
    title = doc.get("title", "无标题")
    
    authors = doc.get("authors", [])
    creator = authors[0].get("name", "未知") if authors else "未知"
    
    # 尽可能将古腾堡标签转成字符串展示（古腾堡的 subjects 通常很长，取前三个）
    subjects = doc.get("subjects", [])
    subject = ", ".join(s.split("--")[-1].strip() for s in subjects[:3]) if subjects else ""
    
    description = f"下载量: {doc.get('download_count', 0)} | 语言: {', '.join(doc.get('languages', []))}"
    
    formats = doc.get("formats", {})
    # 尽可能拿高质量封面
    cover = formats.get("image/jpeg", "")
    
    # 核心目标：拒绝 PDF。取纯 HTML 在线阅读链接，没有则退化拿 txt
    webpage_url = formats.get("text/html", "") or formats.get("text/plain; charset=utf-8", "")
    if not webpage_url:
        webpage_url = f"https://www.gutenberg.org/ebooks/{identifier}"
    
    # 古腾堡 API 不返回具体发布日期，我们只能借用下载次数或者留空
    date = ""

    return {
        "id": identifier,
        "title": title,
        "creator": creator,
        "date": date,
        "description": description,
        "subject": subject,
        "thumbnail": cover,
        "webpage_url": webpage_url,
    }


async def _search_magazines(query: str, limit: int) -> list[dict[str, Any]]:
    """从 Project Gutenberg 搜索历史刊物及文献"""
    params = {
        "search": query,
    }
    try:
        resp = await HTTP_CLIENT.get(GUTENDEX_API_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise RuntimeError(f"Gutendex API 请求失败: {exc}") from exc

    results = data.get("results", [])
    # 截取所需数量的结果
    docs = results[:limit]

    return [_normalize_magazine_entry(d) for d in docs if d.get("id")]


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
        
    doc = results[0]
    return JSONResponse(_normalize_magazine_entry(doc))


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
    # 返回空的 favicon 避免浏览器 404
    return Response(content=b"", media_type="image/x-icon", status_code=204)
