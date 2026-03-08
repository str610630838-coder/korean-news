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

## 播放 502（YouTube 风控）说明

YouTube 对机房 IP 会触发反爬校验，常见报错为 `Sign in to confirm you're not a bot`。  
本项目已内置：

- `PO Token` 支持（`bgutil-ytdlp-pot-provider`）
- JS challenge 组件（`remote_components: ejs:github`）

如果仍遇到个别视频 502，可在服务端配置：

```bash
export YTDLP_COOKIE_FILE=/path/to/youtube-cookies.txt
```

然后重启服务。不同视频风控强度不同，出现“个别不可播”属于上游限制现象。

## 部署建议

推荐部署到支持 Python 长连接流式响应的平台（如云服务器 / 容器平台）：

- 使用 Nginx/Caddy 做反向代理
- 打开 HTTPS（必须）
- 为 `/api/stream/*` 设置更高超时时间
- 视并发配置带宽与缓存策略

## GitHub Pages 说明（已修复）

本仓库已包含 `.github/workflows/deploy-pages.yml`，推送后会自动发布静态前端到 Pages。

- 项目页地址通常为：`https://<username>.github.io/<repo>/`
- 本项目中即：`https://str610630838-coder.github.io/youtube/`

注意：GitHub Pages 只能托管静态文件，不能运行 FastAPI 后端。  
因此在 Pages 上访问时，需要指定后端地址：

`https://str610630838-coder.github.io/youtube/?api=https://你的后端域名`

## 一键容器启动（可选）

```bash
docker build -t youtube-mirror .
docker run -p 8000:8000 youtube-mirror
```
