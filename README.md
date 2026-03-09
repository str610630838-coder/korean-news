# 历史文献馆（History Hub）

从 Project Gutenberg（古腾堡计划）搜索与展示历史书籍资料，探索免 PDF 的纯净公版宝库。

- 前端：搜索页 + 卡片列表（同域调用）
- 后端：FastAPI + Gutendex API，提供搜索与详情查询
- 数据来源：Project Gutenberg 公版书籍

## 功能

- 关键词搜索书籍文献（`/api/search`）
- 获取单本文献详情（`/api/magazine/{id}`）
- 快捷搜索按钮（Magazine / History / Science）
- 简洁的中文前端界面（搜索、卡片列表、在线阅读跳转）
- 站内阅读器（对网站内书籍进行站内正文阅读，DOM 直渲染以兼容沉浸式翻译插件）

## 项目结构

```text
.
├── app.py            # FastAPI 主程序
├── requirements.txt
├── index.html        # 前端页面
├── script.js         # 前端逻辑
├── styles.css        # 前端样式
└── Dockerfile        # 容器化部署
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
- `GET /api/search?q=关键词&limit=18` 搜索文献
- `GET /api/magazine/{id}` 获取单本文献详情

## 一键容器启动（可选）

```bash
docker build -t history-hub .
docker run -p 8000:8000 history-hub
```
