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
const IA_CORS_URL = "https://cors.archive.org/advancedsearch.php";
const IA_IMG_BASE = "https://archive.org/services/img/";
const IA_DETAILS_BASE = "https://archive.org/details/";

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
        webpage_url: identifier ? `${IA_DETAILS_BASE}${identifier}` : "",
    };
}

async function searchViaCors(query, limit) {
    const searchQuery1 = `collection:(periodicals OR magazine_rack) ${query}`;
    const params1 = {
        q: searchQuery1,
        output: "json",
        rows: limit,
        fl: "identifier,title,creator,date,description,subject",
        sort: "date desc",
    };
    const url1 = `${IA_CORS_URL}?${new URLSearchParams(params1)}`;
    const resp1 = await fetch(url1);
    if (!resp1.ok) throw new Error(`HTTP ${resp1.status}`);
    const data1 = await resp1.json();
    let docs = (data1.response || {}).docs || [];

    if (docs.length === 0) {
        const params2 = {
            q: `mediatype:texts ${query}`,
            output: "json",
            rows: limit,
            fl: "identifier,title,creator,date,description,subject",
            sort: "date desc",
        };
        const url2 = `${IA_CORS_URL}?${new URLSearchParams(params2)}`;
        const resp2 = await fetch(url2);
        if (!resp2.ok) throw new Error(`HTTP ${resp2.status}`);
        const data2 = await resp2.json();
        docs = (data2.response || {}).docs || [];
    }

    return docs.filter((d) => d.identifier).map(normalizeMagazineEntry);
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
    magazineGrid.innerHTML = '<div class="error">没有搜索到杂志，请换个关键词试试。</div>';
    resultCount.textContent = "0";
}

function formatDate(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return "日期未知";
    const parts = dateStr.split("-")[0].split(" ");
    return parts[0] || dateStr;
}

function renderCards(items) {
    if (!items.length) {
        renderEmpty();
        return;
    }

    magazineGrid.innerHTML = items.map((item) => {
        const title = escapeHtml(item.title || "无标题");
        const creator = escapeHtml(item.creator || "未知");
        const date = escapeHtml(formatDate(item.date));
        const thumb = escapeHtml(item.thumbnail || "");
        const link = escapeHtml(item.webpage_url || "#");
        const magazineId = escapeHtml(item.id || "");
        const subject = escapeHtml((item.subject || "").slice(0, 80));
        return `
            <article class="magazine-card">
                <img class="magazine-cover" src="${thumb}" alt="${title}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22260%22%3E%3Crect fill=%22%23333%22 width=%22200%22 height=%22260%22/%3E%3Ctext fill=%22%23999%22 x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22%3E暂无封面%3C/text%3E%3C/svg%3E'">
                <div class="magazine-content">
                    <h3 class="magazine-title">${title}</h3>
                    <p class="magazine-meta">${creator} · ${date}</p>
                    ${subject ? `<p class="magazine-subject">${subject}</p>` : ""}
                    <div class="magazine-actions">
                        <a class="view-btn" href="${link}" target="_blank" rel="noopener noreferrer">在线阅读</a>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    resultCount.textContent = String(items.length);
}

async function fetchSearch(query) {
    setLoading(true);
    hideError();
    statusText.textContent = `正在搜索：${query}`;
    try {
        let items;
        if (apiBase) {
            const resp = await fetch(buildApiUrl(`/api/search?q=${encodeURIComponent(query)}&limit=18`));
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            items = Array.isArray(data.items) ? data.items : [];
        } else {
            items = await searchViaCors(query, 18);
        }
        lastItems = items;
        renderCards(lastItems);
        statusText.textContent = `搜索完成：${query}`;
    } catch (err) {
        console.error(err);
        showError(`搜索失败：${err.message || "未知错误"}`);
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

fetchSearch("Life Magazine");
