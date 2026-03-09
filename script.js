/**
 * 历史杂志馆 - 前端脚本
 * 支持两种模式：
 * 1. 有 api 参数时：请求自建后端
 * 2. 无后端时：直连 Internet Archive API（原生支持 CORS，GitHub Pages 开箱即用）
 *
 * 修复：cors.archive.org 代理已失效，改用 archive.org 官方 API 直接请求
 */
const IA_SEARCH_URL = "https://archive.org/advancedsearch.php";
const IA_IMG_BASE = "https://archive.org/services/img/";
const IA_DETAILS_BASE = "https://archive.org/details/";

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const quickButtons = document.querySelectorAll(".quick-btn");
const statusText = document.getElementById("statusText");
const resultCount = document.getElementById("resultCount");
const magazineGrid = document.getElementById("magazineGrid");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("errorBox");

let lastItems = [];
const apiBase = getApiBase();

function getApiBase() {
  const queryApi = new URLSearchParams(window.location.search).get("api");
  if (queryApi) {
    const normalized = queryApi.replace(/\/+$/, "");
    window.localStorage.setItem("magazine_api_base", normalized);
    return normalized;
  }
  const stored = window.localStorage.getItem("magazine_api_base");
  if (stored) {
    return stored.replace(/\/+$/, "");
  }
  return "";
}

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

/** 将 Internet Archive 返回的文档转为前端格式 */
function normalizeMagazineEntry(doc) {
  const identifier = doc.identifier || "";
  let title = doc.title;
  if (Array.isArray(title)) title = title[0] || "无标题";
  title = title || "无标题";
  let creator = doc.creator;
  if (Array.isArray(creator)) creator = creator[0] || "未知";
  creator = creator || "未知";
  let date = doc.date;
  if (Array.isArray(date)) date = date[0] || "";
  date = date || "";
  let description = doc.description;
  if (Array.isArray(description)) description = description[0] || "";
  description = (description || "").slice(0, 200);
  let subject = doc.subject;
  if (Array.isArray(subject)) subject = subject.slice(0, 5).join(", ");
  subject = subject || "";
  return {
    id: identifier,
    title,
    creator,
    date,
    description,
    subject,
    thumbnail: identifier ? `${IA_IMG_BASE}${identifier}` : "",
    webpage_url: identifier ? `${IA_DETAILS_BASE}${identifier}/mode/2up` : "",
  };
}

/**
 * 直连 Internet Archive 官方 API 搜索
 * archive.org/advancedsearch.php 原生支持 CORS，无需代理
 */
async function searchViaArchiveDirect(query, limit = 18) {
  // 主搜索：periodicals 集合，加入过滤条件确保有真实的按页扫描数据（排除纯PDF文件和原生数字PDF上传）
  const searchQuery = `collection:(periodicals OR magazine_rack) ${query} AND (format:Scandata OR format:"Single Page Processed JP2 ZIP") AND imagecount:[1 TO *]`;
  const params = new URLSearchParams({
    q: searchQuery,
    output: "json",
    rows: String(limit),
    fl: "identifier,title,creator,date,description,subject",
    sort: "date desc",
  });
  const url = `${IA_SEARCH_URL}?${params}`;
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  const docs = data?.response?.docs || [];
  if (docs.length > 0) {
    return docs.filter((d) => d.identifier).map(normalizeMagazineEntry);
  }

  // 备用：broad texts 搜索，同样严格过滤以排除纯PDF
  const fallbackQuery = `mediatype:texts ${query} AND (format:Scandata OR format:"Single Page Processed JP2 ZIP") AND imagecount:[1 TO *]`;
  const fallbackParams = new URLSearchParams({
    q: fallbackQuery,
    output: "json",
    rows: String(limit),
    fl: "identifier,title,creator,date,description,subject",
    sort: "date desc",
  });
  const fallbackUrl = `${IA_SEARCH_URL}?${fallbackParams}`;
  const fallbackResp = await fetch(fallbackUrl, { cache: "no-store" });
  if (!fallbackResp.ok) throw new Error(`HTTP ${fallbackResp.status}`);
  const fallbackData = await fallbackResp.json();
  const fallbackDocs = fallbackData?.response?.docs || [];
  return fallbackDocs.filter((d) => d.identifier).map(normalizeMagazineEntry);
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
      const date = escapeHtml(formatDate(item.date));
      const thumb = escapeHtml(item.thumbnail || "");
      const link = escapeHtml(item.webpage_url || "#");
      const subject = escapeHtml((item.subject || "").slice(0, 80));
      return `
    <article class="magazine-card">
      <a href="${link}" target="_blank" rel="noopener noreferrer">
        <img class="magazine-cover" src="${thumb || PLACEHOLDER_SVG}" alt="${title} 封面" loading="lazy" onerror="this.src='${PLACEHOLDER_SVG}'">
      </a>
      <div class="magazine-content">
        <h3 class="magazine-title">${title}</h3>
        <p class="magazine-meta">${creator} · ${date}</p>
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
    let items;
    if (apiBase) {
      const resp = await fetch(
        buildApiUrl(`/api/search?q=${encodeURIComponent(query)}&limit=18`)
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      items = Array.isArray(data.items) ? data.items : [];
    } else {
      items = await searchViaArchiveDirect(query, 18);
    }
    lastItems = items;
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

// 页面加载时直接搜索 Life Magazine，无需配置任何 API
hideError();
fetchSearch("Life Magazine");
