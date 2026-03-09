/**
 * 历史杂志馆 - 前端脚本
 * 功能：搜索 · 书架记忆阅读进度 · 按章节加载阅读
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

const readerModal      = document.getElementById("readerModal");
const closeReaderBtn   = document.getElementById("closeReader");
const toggleSidebarBtn = document.getElementById("toggleSidebar");
const readerTitle      = document.getElementById("readerTitle");
const readerChapterInfo= document.getElementById("readerChapterInfo");
const chapterSidebar   = document.getElementById("chapterSidebar");
const chapterList      = document.getElementById("chapterList");
const progressFill     = document.getElementById("progressFill");
const readerContent    = document.getElementById("readerContent");
const chapterLoading   = document.getElementById("chapterLoading");
const chapterTitle     = document.getElementById("chapterTitle");
const chapterText      = document.getElementById("chapterText");
const prevChapterBtn   = document.getElementById("prevChapter");
const nextChapterBtn   = document.getElementById("nextChapter");
const chapterIndicator = document.getElementById("chapterIndicator");

// ─── 运行时状态 ────────────────────────────────────────────────────────────
/** 搜索结果缓存，用于书架操作时回填数据 @type {Record<string, Object>} */
let currentItems = {};

const readerState = {
  bookId: null,
  bookTitle: null,
  webpageUrl: null,
  chapters: [],
  currentChapter: 0,
};

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

function isOnShelf(bookId) {
  return !!loadShelf()[bookId];
}

function addToShelf(item) {
  const shelf = loadShelf();
  if (!shelf[item.id]) {
    shelf[item.id] = {
      ...item,
      addedAt: new Date().toISOString(),
      currentChapter: 0,
      totalChapters: null,
      lastRead: null,
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

function saveReadingProgress(bookId, chapterNum, totalChapters) {
  const shelf = loadShelf();
  if (shelf[bookId]) {
    shelf[bookId].currentChapter = chapterNum;
    shelf[bookId].totalChapters  = totalChapters;
    shelf[bookId].lastRead       = new Date().toISOString();
    saveShelf(shelf);
  }
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
    const onShelf    = !!shelf[item.id];
    const progress   = shelf[item.id];
    const progressPct = (progress?.totalChapters && progress.totalChapters > 1)
      ? Math.round((progress.currentChapter / (progress.totalChapters - 1)) * 100)
      : null;

    const title   = escapeHtml(item.title || "无标题");
    const creator = escapeHtml(item.creator || "未知");
    const thumb   = escapeHtml(item.thumbnail || "");
    const desc    = escapeHtml(item.description || "");
    const subject = escapeHtml((item.subject || "").slice(0, 80));

    const progressHtml = progressPct !== null
      ? `<div class="mini-progress" title="阅读进度 ${progressPct}%">
           <div class="mini-progress-fill" style="width:${progressPct}%"></div>
         </div>`
      : "";

    const shelfBtnHtml = onShelf
      ? `<button class="shelf-btn shelf-btn--remove" data-id="${item.id}">📌 已收藏</button>`
      : `<button class="shelf-btn" data-id="${item.id}">＋ 书架</button>`;

    return `
<article class="magazine-card">
  <a href="#" class="card-cover-link" data-id="${item.id}" data-title="${escapeHtml(item.title)}">
    <img class="magazine-cover" src="${thumb || PLACEHOLDER_SVG}" alt="${title} 封面" loading="lazy"
         onerror="this.src='${PLACEHOLDER_SVG}'">
    ${progressHtml}
  </a>
  <div class="magazine-content">
    <h3 class="magazine-title">${title}</h3>
    <p class="magazine-meta">${creator}</p>
    <p class="magazine-meta">${desc}</p>
    ${subject ? `<p class="magazine-subject">${subject}</p>` : ""}
    <div class="magazine-actions">
      <button class="view-btn" data-id="${item.id}" data-title="${escapeHtml(item.title)}"
              data-url="${escapeHtml(item.webpage_url)}">📖 阅读</button>
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
    .sort((a, b) => (b.lastRead || b.addedAt).localeCompare(a.lastRead || a.addedAt))
    .map(item => {
      const progressPct = (item.totalChapters && item.totalChapters > 1)
        ? Math.round((item.currentChapter / (item.totalChapters - 1)) * 100)
        : 0;
      const progressLabel = item.totalChapters
        ? `第 ${item.currentChapter + 1} 章 / 共 ${item.totalChapters} 章`
        : "尚未开始阅读";
      const dateLabel = item.lastRead
        ? `上次阅读：${new Date(item.lastRead).toLocaleDateString()}`
        : `添加于：${new Date(item.addedAt).toLocaleDateString()}`;
      const readLabel = item.lastRead ? "▶ 继续阅读" : "📖 开始阅读";

      const title   = escapeHtml(item.title || "无标题");
      const creator = escapeHtml(item.creator || "未知");
      const thumb   = escapeHtml(item.thumbnail || "");

      return `
<article class="magazine-card">
  <a href="#" class="card-cover-link" data-id="${item.id}" data-title="${escapeHtml(item.title)}"
     data-url="${escapeHtml(item.webpage_url || "")}">
    <img class="magazine-cover" src="${thumb || PLACEHOLDER_SVG}" alt="${title} 封面" loading="lazy"
         onerror="this.src='${PLACEHOLDER_SVG}'">
    <div class="shelf-progress-overlay">
      <div class="shelf-progress-bar">
        <div class="shelf-progress-fill" style="width:${progressPct}%"></div>
      </div>
      <span class="shelf-progress-text">${progressLabel}</span>
    </div>
  </a>
  <div class="magazine-content">
    <h3 class="magazine-title">${title}</h3>
    <p class="magazine-meta">${creator}</p>
    <p class="magazine-meta shelf-date-label">${dateLabel}</p>
    <div class="magazine-actions">
      <button class="view-btn" data-id="${item.id}" data-title="${escapeHtml(item.title)}"
              data-url="${escapeHtml(item.webpage_url || "")}">${readLabel}</button>
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

// ─── 阅读器 ────────────────────────────────────────────────────────────────
async function openReader(bookId, bookTitle, webpageUrl) {
  readerTitle.textContent    = bookTitle;
  readerChapterInfo.textContent = "";
  chapterTitle.textContent   = "";
  chapterText.textContent    = "";
  chapterList.innerHTML      = '<li class="chapter-loading">正在加载章节目录…</li>';
  chapterLoading.classList.remove("hidden");
  prevChapterBtn.disabled    = true;
  nextChapterBtn.disabled    = true;
  progressFill.style.width   = "0%";
  chapterIndicator.textContent = "— / —";

  readerState.bookId      = bookId;
  readerState.bookTitle   = bookTitle;
  readerState.webpageUrl  = webpageUrl;
  readerState.chapters    = [];

  readerModal.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // 恢复书架中保存的进度
  const shelf         = loadShelf();
  const savedChapter  = shelf[bookId]?.currentChapter ?? 0;

  try {
    const resp = await fetch(`/api/book/${bookId}/chapters`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    readerState.chapters = data.chapters;
    renderChapterList(data.chapters, savedChapter);

    // 同步更新书架总章节数
    if (shelf[bookId]) {
      saveReadingProgress(bookId, savedChapter, data.total);
    }

    await loadChapter(bookId, savedChapter);
  } catch (err) {
    chapterLoading.classList.add("hidden");
    chapterText.textContent = `加载失败：${err.message}`;

    if (webpageUrl) {
      const link = document.createElement("a");
      link.href   = webpageUrl;
      link.target = "_blank";
      link.rel    = "noopener noreferrer";
      link.textContent = "→ 在 Project Gutenberg 网站阅读";
      link.style.cssText = "display:block;margin-top:1rem;color:var(--brand-hover);";
      chapterText.after(link);
    }
  }
}

function renderChapterList(chapters, activeIndex) {
  chapterList.innerHTML = chapters.map((ch, i) => `
    <li class="chapter-item ${i === activeIndex ? "active" : ""}" data-index="${i}">
      ${escapeHtml(ch.title)}
    </li>`).join("");
}

async function loadChapter(bookId, chapterNum) {
  chapterLoading.classList.remove("hidden");
  chapterTitle.textContent = "";
  chapterText.textContent  = "";
  readerContent.scrollTop  = 0;

  try {
    const resp = await fetch(`/api/book/${bookId}/chapter/${chapterNum}`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    chapterTitle.textContent = data.title;
    chapterText.textContent  = data.content;
    readerState.currentChapter = chapterNum;

    prevChapterBtn.disabled   = !data.has_prev;
    nextChapterBtn.disabled   = !data.has_next;
    chapterIndicator.textContent = `${chapterNum + 1} / ${data.total}`;
    readerChapterInfo.textContent = `${chapterNum + 1} / ${data.total}`;

    // 顶部进度条
    const pct = data.total > 1 ? (chapterNum / (data.total - 1)) * 100 : 100;
    progressFill.style.width = `${pct}%`;

    // 侧栏高亮
    document.querySelectorAll(".chapter-item").forEach((el, i) => {
      el.classList.toggle("active", i === chapterNum);
    });
    chapterList.querySelector(".chapter-item.active")
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });

    // 保存进度（仅书架中的书）
    saveReadingProgress(bookId, chapterNum, data.total);

  } catch (err) {
    chapterText.textContent = `加载章节失败：${err.message}`;
  } finally {
    chapterLoading.classList.add("hidden");
  }
}

function closeReader() {
  readerModal.classList.add("hidden");
  document.body.style.overflow = "";
  // 刷新卡片进度显示
  renderCards(Object.values(currentItems));
  if (!document.getElementById("tab-bookshelf").classList.contains("active")) return;
  renderShelf();
}

// ─── 事件委托（统一处理卡片内按钮） ────────────────────────────────────────
document.addEventListener("click", e => {
  // 封面点击 → 打开阅读器
  const coverLink = e.target.closest(".card-cover-link[data-id]");
  if (coverLink) {
    e.preventDefault();
    openReader(coverLink.dataset.id, coverLink.dataset.title || coverLink.dataset.id, coverLink.dataset.url);
    return;
  }

  // "阅读" 按钮
  const viewBtn = e.target.closest(".view-btn[data-id]");
  if (viewBtn) {
    e.preventDefault();
    openReader(viewBtn.dataset.id, viewBtn.dataset.title || viewBtn.dataset.id, viewBtn.dataset.url);
    return;
  }

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

  // 章节列表项点击
  const chapterItem = e.target.closest(".chapter-item[data-index]");
  if (chapterItem) {
    const idx = parseInt(chapterItem.dataset.index, 10);
    loadChapter(readerState.bookId, idx);
    if (window.innerWidth < 768) {
      chapterSidebar.classList.remove("open");
    }
    return;
  }
});

// 标签页
tabBtns.forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

// 阅读器控制
closeReaderBtn.addEventListener("click", closeReader);

toggleSidebarBtn.addEventListener("click", () => {
  chapterSidebar.classList.toggle("open");
});

prevChapterBtn.addEventListener("click", () => {
  if (readerState.currentChapter > 0) {
    loadChapter(readerState.bookId, readerState.currentChapter - 1);
  }
});

nextChapterBtn.addEventListener("click", () => {
  if (readerState.currentChapter < readerState.chapters.length - 1) {
    loadChapter(readerState.bookId, readerState.currentChapter + 1);
  }
});

// 键盘快捷键
document.addEventListener("keydown", e => {
  if (readerModal.classList.contains("hidden")) return;
  if (e.key === "Escape")      closeReader();
  if (e.key === "ArrowLeft")   prevChapterBtn.click();
  if (e.key === "ArrowRight")  nextChapterBtn.click();
});

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
