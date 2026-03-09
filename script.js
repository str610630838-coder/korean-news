/**
 * 历史杂志馆 - 前端脚本
 * 新架构：纯后端模式
 * 数据源：Project Gutenberg (Gutendex)
 */
const apiBase = "";

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const quickButtons = document.querySelectorAll(".quick-btn");
const statusText = document.getElementById("statusText");
const resultCount = document.getElementById("resultCount");
const magazineGrid = document.getElementById("magazineGrid");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("errorBox");

function buildApiUrl(path) {
  return `${apiBase}${path}`;
}

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

function renderEmpty() {
  magazineGrid.innerHTML = '<p class="magazine-empty">没有搜索到杂志，请换个关键词试试。</p>';
  resultCount.textContent = "0";
}

function formatDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "日期未知";
  const parts = String(dateStr).split("-")[0].split(" ");
  return parts[0] || dateStr;
}

/** 后端已经统一了格式，前端只需原样透传 */
function normalizeMagazineEntry(doc) {
  return doc;
}

const PLACEHOLDER_SVG =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='293'%3E%3Crect fill='%231a1d24' width='220' height='293'/%3E%3Ctext fill='%239aa3b8' x='110' y='150' text-anchor='middle' font-size='14'%3E无封面%3C/text%3E%3C/svg%3E";

function renderCards(items) {
  if (!items.length) {
    renderEmpty();
    return;
  }
  magazineGrid.innerHTML = items
    .map((item) => {
      const title = escapeHtml(item.title || "无标题");
      const creator = escapeHtml(item.creator || "未知");
      const thumb = escapeHtml(item.thumbnail || "");
      const link = escapeHtml(item.webpage_url || "#");
      const desc = escapeHtml(item.description || "");
      const subject = escapeHtml((item.subject || "").slice(0, 80));
      return `
    <article class="magazine-card">
      <a href="${link}" target="_blank" rel="noopener noreferrer">
        <img class="magazine-cover" src="${thumb || PLACEHOLDER_SVG}" alt="${title} 封面" loading="lazy" onerror="this.src='${PLACEHOLDER_SVG}'">
      </a>
      <div class="magazine-content">
        <h3 class="magazine-title">${title}</h3>
        <p class="magazine-meta">${creator}</p>
        <p class="magazine-meta">${desc}</p>
        ${subject ? `<p class="magazine-subject">${subject}</p>` : ""}
        <div class="magazine-actions">
          <a class="view-btn" href="${link}" target="_blank" rel="noopener noreferrer">在线阅读</a>
        </div>
      </div>
    </article>`;
    })
    .join("");
  resultCount.textContent = String(items.length);
}

async function fetchSearch(query) {
  setLoading(true);
  hideError();
  statusText.textContent = `正在搜索：${query}`;
  try {
    const resp = await fetch(
      buildApiUrl(`/api/search?q=${encodeURIComponent(query)}&limit=18`)
    );
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const items = Array.isArray(data.items) ? data.items : [];

    renderCards(items);
    statusText.textContent = `搜索完成：${query}（共 ${items.length} 条）`;
  } catch (err) {
    console.error(err);
    showError(`搜索失败：${err.message || "网络错误，请稍后重试"}`);
    renderEmpty();
    statusText.textContent = "搜索失败";
  } finally {
    setLoading(false);
  }
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = searchInput.value.trim();
  if (!query) return;
  await fetchSearch(query);
});

quickButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const query = button.dataset.query || "";
    if (!query) return;
    searchInput.value = query;
    await fetchSearch(query);
  });
});

// 页面加载时按需搜索
hideError();
fetchSearch("Magazine");
