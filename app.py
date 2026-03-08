"""
历史杂志抓取网站 - 从 Internet Archive 抓取并展示历史杂志
"""
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse

app = FastAPI(title="历史杂志馆", version="1.0.0")

# 静态资源目录：基于 app.py 所在目录，避免因启动目录不同导致 404
_STATIC_DIR = Path(__file__).resolve().parent

HTTP_CLIENT = httpx.AsyncClient(timeout=30.0, follow_redirects=True)

IA_SEARCH_URL = "https://archive.org/advancedsearch.php"
IA_IMG_BASE = "https://archive.org/services/img/"
IA_DETAILS_BASE = "https://archive.org/details/"


def _normalize_magazine_entry(doc: dict[str, Any]) -> dict[str, Any]:
    """将 Internet Archive 文档转为前端使用的格式"""
    identifier = doc.get("identifier") or ""
    title = doc.get("title")
    if isinstance(title, list):
        title = title[0] if title else "无标题"
    title = title or "无标题"
    creator = doc.get("creator")
    if isinstance(creator, list):
        creator = creator[0] if creator else "未知"
    creator = creator or "未知"
    date = doc.get("date")
    if isinstance(date, list):
        date = date[0] if date else ""
    date = date or ""
    description = doc.get("description")
    if isinstance(description, list):
        description = description[0] if description else ""
    description = (description or "")[:200]
    subject = doc.get("subject")
    if isinstance(subject, list):
        subject = ", ".join(str(s) for s in subject[:5]) if subject else ""
    subject = subject or ""

    cover = f"{IA_IMG_BASE}{identifier}" if identifier else ""
    details_url = f"{IA_DETAILS_BASE}{identifier}" if identifier else ""

    return {
        "id": identifier,
        "title": title,
        "creator": creator,
        "date": date,
        "description": description,
        "subject": subject,
        "thumbnail": cover,
        "webpage_url": details_url,
    }


async def _search_magazines(query: str, limit: int) -> list[dict[str, Any]]:
    """从 Internet Archive 搜索历史杂志"""
    # 搜索 periodicals 集合，并加入用户关键词
    search_query = f"collection:(periodicals OR magazine_rack) {query}"
    params = {
        "q": search_query,
        "output": "json",
        "rows": limit,
        "fl": "identifier,title,creator,date,description,subject",
        "sort": "date desc",
    }
    try:
        resp = await HTTP_CLIENT.get(IA_SEARCH_URL, params=params)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise RuntimeError(f"Internet Archive 请求失败: {exc}") from exc

    docs = data.get("response", {}).get("docs", [])
    if not docs:
        # 若 periodicals 无结果，尝试 broader texts 搜索
        fallback_params = {
            "q": f"mediatype:texts {query}",
            "output": "json",
            "rows": limit,
            "fl": "identifier,title,creator,date,description,subject",
            "sort": "date desc",
        }
        resp = await HTTP_CLIENT.get(IA_SEARCH_URL, params=fallback_params)
        resp.raise_for_status()
        data = resp.json()
        docs = data.get("response", {}).get("docs", [])

    return [_normalize_magazine_entry(d) for d in docs if d.get("identifier")]


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
    """获取单本杂志的详情（可选，用于详情页）"""
    url = f"https://archive.org/metadata/{identifier}"
    try:
        resp = await HTTP_CLIENT.get(url)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"获取杂志详情失败: {exc}") from exc

    metadata = data.get("metadata", {})
    title = metadata.get("title", "无标题")
    creator = metadata.get("creator", "未知")
    date = metadata.get("date", "")
    description = metadata.get("description", "")
    if isinstance(description, list):
        description = description[0] if description else ""
    cover = f"{IA_IMG_BASE}{identifier}"
    details_url = f"{IA_DETAILS_BASE}{identifier}"

    return JSONResponse({
        "id": identifier,
        "title": title,
        "creator": creator,
        "date": date,
        "description": description,
        "thumbnail": cover,
        "webpage_url": details_url,
    })


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(_STATIC_DIR / "index.html")


@app.get("/styles.css", include_in_schema=False)
async def styles() -> FileResponse:
    return FileResponse(_STATIC_DIR / "styles.css")


@app.get("/script.js", include_in_schema=False)
async def script() -> FileResponse:
    return FileResponse(_STATIC_DIR / "script.js")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await HTTP_CLIENT.aclose()
