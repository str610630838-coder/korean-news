# 历史杂志馆（History Hub）

从 Internet Archive 抓取与展示历史杂志，浏览百年期刊文献。

## 功能

- 关键词搜索历史杂志（`/api/search`）
- 杂志详情（`/api/magazine/{id}`）
- 简洁中文前端：搜索、卡片列表、在线阅读跳转 Internet Archive

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
- `GET /api/search?q=关键词&limit=18` 搜索杂志
- `GET /api/magazine/{identifier}` 杂志详情

## GitHub Pages 说明

本仓库包含 `.github/workflows/deploy-pages.yml`，推送后会自动发布静态前端到 Pages。

- 项目页地址通常为：`https://<username>.github.io/<repo>/`
- GitHub Pages 仅托管静态文件，无后端。前端已内置 **CORS 直连回退**：未配置后端时，自动调用 Internet Archive 的 `cors.archive.org` 接口，搜索功能可正常使用。
- 若自建后端，可在网址后追加 `?api=https://你的后端域名` 以使用自有 API。

## 数据来源

数据来源于 [Internet Archive](https://archive.org)，仅供学习与研究，请遵守版权法规。
