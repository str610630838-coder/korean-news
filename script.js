/**
 * 历史杂志馆 - 前端脚本
 * 功能：搜索 · 书架记忆 · 跳转至 Project Gutenberg 原页（原生支持沉浸式翻译等浏览器插件）
 */

// ─── 常量 ──────────────────────────────────────────────────────────────────
const GUTENDEX_BASE = "https://gutendex.com/books";
const SHELF_KEY = "history-hub-bookshelf";

// ─── DOM 引用 ───────────────────────────────────────────────────────────────
const searchForm       = document.getElementById("searchForm");
const searchInput      = document.getElementById("searchInput");
const searchBtn        = document.getElementById("searchBtn");
const quickButtons     = document.querySelectorAll(".quick-btn");
const statusText       = document.getElementById("statusText");
const resultCount      = document.getElementById("resultCount");
const magazineGrid     = document.getElementById("magazineGrid");
const loading          = document.getElementById("loading");
const errorBox         = document.getElementById("errorBox");

const tabBtns          = document.querySelectorAll(".tab-btn");
const tabContents      = document.querySelectorAll(".tab-content");
const shelfCount       = document.getElementById("shelfCount");
const shelfGrid        = document.getElementById("shelfGrid");
const shelfStatus      = document.getElementById("shelfStatus");

// ─── 运行时状态 ────────────────────────────────────────────────────────────
/** 搜索结果缓存，用于书架操作时回填数据 @type {Record<string, Object>} */
let currentItems = {};

// ─── 书架管理（localStorage） ──────────────────────────────────────────────
function loadShelf() {
  try {
    return JSON.parse(localStorage.getItem(SHELF_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveShelf(shelf) {
  localStorage.setItem(SHELF_KEY, JSON.stringify(shelf));
}

function addToShelf(item) {
  const shelf = loadShelf();
  if (!shelf[item.id]) {
    shelf[item.id] = {
      ...item,
      addedAt: new Date().toISOString(),
    };
    saveShelf(shelf);
  }
  updateShelfBadge();
  renderCards(Object.values(currentItems));
}

function removeFromShelf(bookId) {
  const shelf = loadShelf();
  delete shelf[bookId];
  saveShelf(shelf);
  updateShelfBadge();
  renderShelf();
  renderCards(Object.values(currentItems));
}

function updateShelfBadge() {
  const count = Object.keys(loadShelf()).length;
  shelfCount.textContent = String(count);
  shelfCount.style.display = count > 0 ? "inline-flex" : "none";
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function setLoading(visible) {
  loading.classList.toggle("hidden", !visible);
  searchBtn.disabled = visible;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}

function hideError() {
  errorBox.classList.add("hidden");
  errorBox.textContent = "";
}

const PLACEHOLDER_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='293'%3E%3Crect fill='%231a1d24' width='220' height='293'/%3E%3Ctext fill='%239aa3b8' x='110' y='150' text-anchor='middle' font-size='14'%3E无封面%3C/text%3E%3C/svg%3E";

function normalizeMagazineEntry(doc) {
  const identifier = String(doc.id || "");
  const authors    = doc.authors || [];
  const creator    = authors.length ? (authors[0].name || "未知") : "未知";
  const subjects   = doc.subjects || [];
  const subject    = subjects.slice(0, 3).map(s => s.split("--").pop().trim()).join(", ");
  const description = `下载量: ${doc.download_count || 0} | 语言: ${(doc.languages || []).join(", ")}`;
  const formats    = doc.formats || {};
  const cover      = formats["image/jpeg"] || "";
  const webpage_url =
    formats["text/html"] ||
    formats["text/plain; charset=utf-8"] ||
    `https://www.gutenberg.org/ebooks/${identifier}`;
  return { id: identifier, title: doc.title || "无标题", creator, description, subject, thumbnail: cover, webpage_url };
}

// ─── 渲染：搜索结果卡片 ────────────────────────────────────────────────────
function renderCards(items) {
  if (!items.length) {
    magazineGrid.innerHTML = '<p class="magazine-empty">没有搜索到书籍，请换个关键词试试。</p>';
    resultCount.textContent = "0";
    return;
  }

  const shelf = loadShelf();

  magazineGrid.innerHTML = items.map(item => {
    const onShelf = !!shelf[item.id];
    const title   = escapeHtml(item.title || "无标题");
    const creator = escapeHtml(item.creator || "未知");
    const thumb   = escapeHtml(item.thumbnail || "");
    const desc    = escapeHtml(item.description || "");
    const subject = escapeHtml((item.subject || "").slice(0, 80));
    const url     = escapeHtml(item.webpage_url || "");

    const shelfBtnHtml = onShelf
      ? `<button class="shelf-btn shelf-btn--remove" data-id="${item.id}">📌 已收藏</button>`
      : `<button class="shelf-btn" data-id="${item.id}">＋ 书架</button>`;

    return `
<article class="magazine-card">
  <a href="${url}" class="card-cover-link" target="_blank" rel="noopener noreferrer">
    <img class="magazine-cover" src="${thumb || PLACEHOLDER_SVG}" alt="${title} 封面" loading="lazy"
         onerror="this.src='${PLACEHOLDER_SVG}'">
  </a>
  <div class="magazine-content">
    <h3 class="magazine-title">${title}</h3>
    <p class="magazine-meta">${creator}</p>
    <p class="magazine-meta">${desc}</p>
    ${subject ? `<p class="magazine-subject">${subject}</p>` : ""}
    <div class="magazine-actions">
      <a class="view-btn" href="${url}" target="_blank" rel="noopener noreferrer">📖 阅读</a>
      ${shelfBtnHtml}
    </div>
  </div>
</article>`;
  }).join("");

  resultCount.textContent = String(items.length);
}

// ─── 渲染：书架 ────────────────────────────────────────────────────────────
function renderShelf() {
  const shelf = loadShelf();
  const items = Object.values(shelf);

  if (!items.length) {
    shelfGrid.innerHTML = '<p class="magazine-empty">书架是空的，从搜索结果中添加书籍吧。</p>';
    shelfStatus.textContent = "";
    return;
  }

  shelfStatus.textContent = `共 ${items.length} 本`;

  shelfGrid.innerHTML = items
    .sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""))
    .map(item => {
      const dateLabel = `添加于：${new Date(item.addedAt).toLocaleDateString()}`;
      const title   = escapeHtml(item.title || "无标题");
      const creator = escapeHtml(item.creator || "未知");
      const thumb   = escapeHtml(item.thumbnail || "");
      const url     = escapeHtml(item.webpage_url || "");

      return `
<article class="magazine-card">
  <a href="${url}" class="card-cover-link" target="_blank" rel="noopener noreferrer">
    <img class="magazine-cover" src="${thumb || PLACEHOLDER_SVG}" alt="${title} 封面" loading="lazy"
         onerror="this.src='${PLACEHOLDER_SVG}'">
  </a>
  <div class="magazine-content">
    <h3 class="magazine-title">${title}</h3>
    <p class="magazine-meta">${creator}</p>
    <p class="magazine-meta shelf-date-label">${dateLabel}</p>
    <div class="magazine-actions">
      <a class="view-btn" href="${url}" target="_blank" rel="noopener noreferrer">📖 阅读</a>
      <button class="shelf-btn shelf-btn--remove" data-id="${item.id}">移除</button>
    </div>
  </div>
</article>`;
    }).join("");
}

// ─── 标签页切换 ────────────────────────────────────────────────────────────
function switchTab(tabName) {
  tabBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tabName));
  tabContents.forEach(el => el.classList.toggle("active", el.id === `tab-${tabName}`));
  if (tabName === "bookshelf") renderShelf();
}

// ─── 事件委托（统一处理卡片内按钮） ────────────────────────────────────────
document.addEventListener("click", e => {
  // "加入书架" 按钮
  const shelfBtn = e.target.closest(".shelf-btn:not(.shelf-btn--remove)");
  if (shelfBtn) {
    const item = currentItems[shelfBtn.dataset.id];
    if (item) addToShelf(item);
    return;
  }

  // "移除书架" 按钮
  const removeBtn = e.target.closest(".shelf-btn--remove");
  if (removeBtn) {
    removeFromShelf(removeBtn.dataset.id);
    return;
  }
});

// 标签页
tabBtns.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

// ─── 搜索 ──────────────────────────────────────────────────────────────────
async function fetchSearch(query) {
  setLoading(true);
  hideError();
  statusText.textContent = `正在搜索：${query}`;
  try {
    const url  = `${GUTENDEX_BASE}/?search=${encodeURIComponent(query)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data    = await resp.json();
    const results = Array.isArray(data.results) ? data.results : [];
    const items   = results.slice(0, 18).filter(d => d.id).map(normalizeMagazineEntry);

    items.forEach(item => { currentItems[item.id] = item; });
    renderCards(items);
    statusText.textContent = `搜索完成：${query}（共 ${items.length} 条）`;
  } catch (err) {
    console.error(err);
    showError(`搜索失败：${err.message || "网络错误，请稍后重试"}`);
    magazineGrid.innerHTML = '<p class="magazine-empty">没有搜索到书籍，请换个关键词试试。</p>';
    resultCount.textContent = "0";
    statusText.textContent = "搜索失败";
  } finally {
    setLoading(false);
  }
}

searchForm.addEventListener("submit", async e => {
  e.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  await fetchSearch(query);
});

quickButtons.forEach(btn => {
  btn.addEventListener("click", async () => {
    const query = btn.dataset.query || "";
    if (!query) return;
    searchInput.value = query;
    await fetchSearch(query);
  });
});

// ─── 初始化 ────────────────────────────────────────────────────────────────
updateShelfBadge();
hideError();
fetchSearch("Magazine");
