# YouTube 镜像站（FastAPI）

这是一个可直接部署的 YouTube 镜像站示例：

- 前端：搜索页 + 播放器页（同域调用）
- 后端：FastAPI + `yt-dlp`，提供搜索、详情、视频流代理
- 目标：客户端只访问你自己的域名，不直接请求 YouTube 页面

> 说明：本项目仅用于学习与技术演示，请遵守当地法律法规、平台服务条款与版权要求。

## 功能

- 关键词搜索视频（`/api/search`）
- 读取视频详情与可播放格式（`/api/video/{id}`）
- 服务端代理视频流（`/api/stream/{id}`，支持 Range）
- 简洁的中文前端界面（搜索、卡片列表、站内播放）

## 项目结构

```text
.
├── app.py            # FastAPI 主程序
├── requirements.txt
├── index.html        # 前端页面
├── script.js         # 前端逻辑
└── styles.css        # 前端样式
```

## 本地运行

1) 安装依赖

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

2) 启动服务

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

3) 浏览器打开

`http://127.0.0.1:8000`

## API 简要

- `GET /api/health` 健康检查
- `GET /api/search?q=关键词&limit=18`
- `GET /api/video/{video_id}`
- `GET /api/stream/{video_id}?format_id=18`

## 部署建议

推荐部署到支持 Python 长连接流式响应的平台（如云服务器 / 容器平台）：

- 使用 Nginx/Caddy 做反向代理
- 打开 HTTPS（必须）
- 为 `/api/stream/*` 设置更高超时时间
- 视并发配置带宽与缓存策略

## 一键容器启动（可选）

```bash
docker build -t youtube-mirror .
docker run -p 8000:8000 youtube-mirror
```
