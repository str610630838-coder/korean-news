import asyncio
import os
import time
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from yt_dlp import YoutubeDL


app = FastAPI(title="YouTube Mirror", version="1.0.0")

HTTP_CLIENT = httpx.AsyncClient(timeout=60.0, follow_redirects=True)
STREAM_CACHE_TTL_SECONDS = 2 * 60
stream_cache: dict[str, dict[str, Any]] = {}
NODE_RUNTIME_PATH = os.getenv("YTDLP_NODE_PATH", "/usr/local/lighthouse/softwares/nodejs/node/bin/node")
POT_PROVIDER_BASE_URL = os.getenv("YTDLP_POT_PROVIDER_URL", "http://127.0.0.1:4416")
YTDLP_COOKIE_FILE = os.getenv("YTDLP_COOKIE_FILE", "").strip()


def _video_ydl_opts() -> dict[str, Any]:
    opts: dict[str, Any] = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        # Required by many videos to decode signed formats correctly
        "js_runtimes": {"node": {"path": NODE_RUNTIME_PATH}},
        "remote_components": ["ejs:github"],
        "extractor_args": {
            "youtube": {
                "fetch_pot": ["always"],
                "player_client": ["mweb"],
            },
            "youtubepot-bgutilhttp": {
                "base_url": [POT_PROVIDER_BASE_URL],
            },
        },
    }
    if YTDLP_COOKIE_FILE:
        opts["cookiefile"] = YTDLP_COOKIE_FILE
    return opts


def _friendly_extract_error(exc: Exception) -> str:
    message = str(exc)
    lower = message.lower()
    if "not a bot" in lower or "sign in to confirm" in lower or "login_required" in lower:
        return "该视频触发 YouTube 风控，当前无法直连解析。请换一个视频，或在服务器配置 YTDLP_COOKIE_FILE。"
    return message


def _pick_thumbnail(entry: dict[str, Any]) -> str:
    thumbs = entry.get("thumbnails") or []
    if thumbs:
        thumbs = sorted(
            [item for item in thumbs if item.get("url")],
            key=lambda item: (item.get("width") or 0) * (item.get("height") or 0),
            reverse=True,
        )
        if thumbs:
            return thumbs[0]["url"]
    thumb = entry.get("thumbnail")
    if thumb:
        return str(thumb)
    video_id = entry.get("id")
    if video_id:
        return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    return ""


def _format_duration(seconds: Any) -> str:
    if not isinstance(seconds, int):
        return "未知"
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h:d}:{m:02d}:{s:02d}"
    return f"{m:d}:{s:02d}"


def _normalize_search_entry(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": entry.get("id"),
        "title": entry.get("title") or "无标题",
        "uploader": entry.get("uploader") or entry.get("channel") or "未知频道",
        "duration": _format_duration(entry.get("duration")),
        "view_count": entry.get("view_count"),
        "thumbnail": _pick_thumbnail(entry),
        "webpage_url": entry.get("url")
        if str(entry.get("url", "")).startswith("http")
        else f"https://www.youtube.com/watch?v={entry.get('id')}",
        "published": entry.get("upload_date"),
    }


def _search_videos_sync(query: str, limit: int) -> list[dict[str, Any]]:
    opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "extract_flat": "in_playlist",
    }
    with YoutubeDL(opts) as ydl:
        data = ydl.extract_info(f"ytsearch{limit}:{query}", download=False) or {}
    entries = data.get("entries") or []
    return [_normalize_search_entry(item) for item in entries if item.get("id")]


def _sort_key_for_format(fmt: dict[str, Any]) -> tuple[int, int, float, int]:
    ext = 1 if fmt.get("ext") == "mp4" else 0
    return (
        fmt.get("height") or 0,
        fmt.get("width") or 0,
        float(fmt.get("tbr") or 0),
        ext,
    )


def _pick_stream_format(formats: list[dict[str, Any]], format_id: str | None) -> dict[str, Any]:
    playable = [
        item
        for item in formats
        if item.get("url") and item.get("vcodec") != "none" and item.get("acodec") != "none"
    ]
    if format_id:
        for item in playable:
            if str(item.get("format_id")) == format_id:
                return item
    if not playable:
        raise ValueError("没有可用的音视频合流格式")
    return sorted(playable, key=_sort_key_for_format, reverse=True)[0]


def _video_info_sync(video_id: str) -> dict[str, Any]:
    opts = _video_ydl_opts()
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False) or {}

    formats = info.get("formats") or []
    selected = _pick_stream_format(formats, None)
    return {
        "id": video_id,
        "title": info.get("title") or "无标题",
        "description": info.get("description") or "",
        "uploader": info.get("uploader") or info.get("channel") or "未知频道",
        "duration": _format_duration(info.get("duration")),
        "view_count": info.get("view_count"),
        "thumbnail": _pick_thumbnail(info),
        "default_format_id": selected.get("format_id"),
        "playable_formats": [
            {
                "format_id": item.get("format_id"),
                "ext": item.get("ext"),
                "height": item.get("height"),
                "fps": item.get("fps"),
                "vcodec": item.get("vcodec"),
                "acodec": item.get("acodec"),
            }
            for item in sorted(
                [
                    item
                    for item in formats
                    if item.get("url")
                    and item.get("vcodec") != "none"
                    and item.get("acodec") != "none"
                ],
                key=_sort_key_for_format,
                reverse=True,
            )
        ],
    }


def _resolve_stream_sync(video_id: str, format_id: str | None) -> dict[str, Any]:
    opts = _video_ydl_opts()
    with YoutubeDL(opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False) or {}
    selected = _pick_stream_format(info.get("formats") or [], format_id)
    return {
        "url": selected.get("url"),
        "http_headers": selected.get("http_headers") or {},
    }


async def resolve_stream(video_id: str, format_id: str | None) -> dict[str, Any]:
    key = f"{video_id}:{format_id or ''}"
    now = time.time()
    cached = stream_cache.get(key)
    if cached and now - cached["ts"] <= STREAM_CACHE_TTL_SECONDS:
        return cached

    resolved = await asyncio.to_thread(_resolve_stream_sync, video_id, format_id)
    if not resolved.get("url"):
        raise HTTPException(status_code=502, detail="未能解析视频流地址")

    payload = {"url": resolved["url"], "http_headers": resolved["http_headers"], "ts": now}
    stream_cache[key] = payload
    return payload


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/search")
async def search_videos(
    q: str = Query(..., min_length=1, max_length=100),
    limit: int = Query(18, ge=1, le=36),
) -> JSONResponse:
    try:
        items = await asyncio.to_thread(_search_videos_sync, q, limit)
        return JSONResponse({"query": q, "count": len(items), "items": items})
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"搜索失败：{exc}") from exc


@app.get("/api/video/{video_id}")
async def video_info(video_id: str) -> JSONResponse:
    try:
        info = await asyncio.to_thread(_video_info_sync, video_id)
        return JSONResponse(info)
    except Exception as exc:
        return JSONResponse(
            {
                "id": video_id,
                "blocked": True,
                "reason": _friendly_extract_error(exc),
            }
        )


@app.get("/api/stream/{video_id}")
async def stream_video(video_id: str, request: Request, format_id: str | None = None) -> StreamingResponse:
    try:
        resolved = await resolve_stream(video_id, format_id)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"解析播放地址失败：{_friendly_extract_error(exc)}") from exc
    headers: dict[str, str] = {}
    if request.headers.get("range"):
        headers["Range"] = request.headers["range"]

    for key in ("User-Agent", "Referer", "Origin"):
        value = resolved["http_headers"].get(key)
        if value:
            headers[key] = value

    req = HTTP_CLIENT.build_request("GET", resolved["url"], headers=headers)
    upstream = await HTTP_CLIENT.send(req, stream=True)
    if upstream.status_code in (401, 403, 410):
        # Signed video URLs may expire quickly; refresh once before failing.
        await upstream.aclose()
        stream_cache.pop(f"{video_id}:{format_id or ''}", None)
        refreshed = await resolve_stream(video_id, format_id)
        req = HTTP_CLIENT.build_request("GET", refreshed["url"], headers=headers)
        upstream = await HTTP_CLIENT.send(req, stream=True)
    if upstream.status_code >= 400:
        body = (await upstream.aread())[:200]
        await upstream.aclose()
        raise HTTPException(status_code=502, detail=f"上游视频流错误：{upstream.status_code} {body!r}")

    proxy_headers: dict[str, str] = {}
    for key in (
        "Content-Type",
        "Content-Length",
        "Content-Range",
        "Accept-Ranges",
        "Cache-Control",
        "ETag",
        "Last-Modified",
    ):
        value = upstream.headers.get(key)
        if value:
            proxy_headers[key] = value

    async def iterator():
        try:
            async for chunk in upstream.aiter_bytes():
                yield chunk
        finally:
            await upstream.aclose()

    return StreamingResponse(iterator(), status_code=upstream.status_code, headers=proxy_headers)


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse("index.html")


@app.get("/styles.css", include_in_schema=False)
async def styles() -> FileResponse:
    return FileResponse("styles.css")


@app.get("/script.js", include_in_schema=False)
async def script() -> FileResponse:
    return FileResponse("script.js")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    await HTTP_CLIENT.aclose()
