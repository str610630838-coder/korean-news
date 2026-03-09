# History Hub（静态版）

一个**抓取历史杂志元数据 + 静态展示**的网站。

## 现在的架构

- `scripts/fetch_magazines.py`：从 Internet Archive 抓取历史杂志元数据
- `data/magazines.json`：抓取结果（静态 JSON）
- `index.html + script.js + styles.css`：纯静态前端展示

> 站点本身不做后端请求，部署到 GitHub Pages / Netlify / Vercel 静态托管即可。

## 快速开始

```bash
pip install -r requirements.txt
python scripts/fetch_magazines.py
```

然后本地打开 `index.html`，或用任意静态服务器：

```bash
python -m http.server 8080
```

访问 `http://127.0.0.1:8080`。

## 部署建议

- GitHub Pages：把仓库推送到 `main` 后开启 Pages
- 可加 GitHub Actions 定时执行抓取脚本并提交更新的 `data/magazines.json`

## 目录

```text
.
├─ data/
│  └─ magazines.json
├─ scripts/
│  └─ fetch_magazines.py
├─ index.html
├─ script.js
├─ styles.css
└─ requirements.txt
```
