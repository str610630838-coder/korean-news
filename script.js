const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const quickButtons = document.querySelectorAll(".quick-btn");
const statusText = document.getElementById("statusText");
const resultCount = document.getElementById("resultCount");
const videoGrid = document.getElementById("videoGrid");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("errorBox");
const playerPanel = document.getElementById("playerPanel");
const playerTitle = document.getElementById("playerTitle");
const playerMeta = document.getElementById("playerMeta");
const videoPlayer = document.getElementById("videoPlayer");
const closePlayerBtn = document.getElementById("closePlayerBtn");

let lastItems = [];

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
    videoGrid.innerHTML = '<div class="error">没有搜索到结果，请换个关键词试试。</div>';
    resultCount.textContent = "0";
}

function renderCards(items) {
    if (!items.length) {
        renderEmpty();
        return;
    }

    videoGrid.innerHTML = items.map((item) => {
        const title = escapeHtml(item.title || "无标题");
        const uploader = escapeHtml(item.uploader || "未知频道");
        const duration = escapeHtml(item.duration || "未知");
        const thumb = escapeHtml(item.thumbnail || "");
        const link = escapeHtml(item.webpage_url || "#");
        const videoId = escapeHtml(item.id || "");
        return `
            <article class="video-card">
                <img class="video-thumb" src="${thumb}" alt="${title}" loading="lazy">
                <div class="video-content">
                    <h3 class="video-title">${title}</h3>
                    <p class="video-meta">${uploader} · 时长 ${duration}</p>
                    <div class="video-actions">
                        <button class="play-btn" data-id="${videoId}" type="button">站内播放</button>
                        <a class="jump-link" href="${link}" target="_blank" rel="noopener noreferrer">原站链接</a>
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
        const resp = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=18`);
        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }
        const data = await resp.json();
        lastItems = Array.isArray(data.items) ? data.items : [];
        renderCards(lastItems);
        statusText.textContent = `搜索完成：${query}`;
    } catch (err) {
        console.error(err);
        showError(`搜索失败：${err.message || "未知错误"}`);
    } finally {
        setLoading(false);
    }
}

async function playVideo(videoId) {
    if (!videoId) return;
    hideError();
    setLoading(true);
    try {
        const infoResp = await fetch(`/api/video/${encodeURIComponent(videoId)}`);
        if (!infoResp.ok) {
            throw new Error(`HTTP ${infoResp.status}`);
        }
        const info = await infoResp.json();
        const streamUrl = `/api/stream/${encodeURIComponent(videoId)}?format_id=${encodeURIComponent(info.default_format_id || "")}`;
        videoPlayer.src = streamUrl;
        videoPlayer.load();
        playerTitle.textContent = info.title || "播放器";
        playerMeta.textContent = `${info.uploader || "未知频道"} · 时长 ${info.duration || "未知"}`;
        playerPanel.classList.remove("hidden");
        videoPlayer.scrollIntoView({ behavior: "smooth", block: "center" });
        statusText.textContent = `正在播放：${info.title || videoId}`;
    } catch (err) {
        console.error(err);
        showError(`播放失败：${err.message || "未知错误"}`);
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

videoGrid.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.classList.contains("play-btn")) {
        const videoId = target.dataset.id;
        await playVideo(videoId);
    }
});

closePlayerBtn.addEventListener("click", () => {
    videoPlayer.pause();
    videoPlayer.removeAttribute("src");
    videoPlayer.load();
    playerPanel.classList.add("hidden");
    playerMeta.textContent = "";
});

fetchSearch("热门音乐");
