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
let currentQuery = "";
const apiBase = getApiBase();

function getApiBase() {
    const queryApi = new URLSearchParams(window.location.search).get("api");
    if (queryApi) {
        const normalized = queryApi.replace(/\/+$/, "");
        window.localStorage.setItem("youtube_api_base", normalized);
        return normalized;
    }

    const stored = window.localStorage.getItem("youtube_api_base");
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

async function fetchJson(url) {
    const resp = await fetch(url);
    let data = null;
    try {
        data = await resp.json();
    } catch (_) {
        data = null;
    }
    if (!resp.ok) {
        throw new Error(data?.detail || `HTTP ${resp.status}`);
    }
    return data;
}

async function fetchSearch(query) {
    setLoading(true);
    hideError();
    currentQuery = query;
    statusText.textContent = `正在搜索：${query}`;
    try {
        const data = await fetchJson(buildApiUrl(`/api/search?q=${encodeURIComponent(query)}&limit=18`));
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

async function playVideo(videoId, attempted = new Set()) {
    if (!videoId) return;
    attempted.add(videoId);
    hideError();
    setLoading(true);
    try {
        const info = await fetchJson(buildApiUrl(`/api/video/${encodeURIComponent(videoId)}`));
        if (info.blocked) {
            statusText.textContent = "当前视频受限，正在自动尝试其他结果...";
            const fallback = await findPlayableAlternative(videoId, attempted);
            if (fallback) {
                showError(`当前视频受限，已自动切换到可播放视频：${fallback.title}`);
                await playVideo(fallback.id, attempted);
                return;
            }
            showError(`播放受限：${info.reason || "该视频当前不可播放，请换一个视频。"} `);
            return;
        }
        const streamUrl = buildApiUrl(`/api/stream/${encodeURIComponent(videoId)}?format_id=${encodeURIComponent(info.default_format_id || "")}`);
        videoPlayer.src = streamUrl;
        videoPlayer.load();
        playerTitle.textContent = info.title || "播放器";
        playerMeta.textContent = `${info.uploader || "未知频道"} · 时长 ${info.duration || "未知"}`;
        playerPanel.classList.remove("hidden");
        videoPlayer.scrollIntoView({ behavior: "smooth", block: "center" });
        statusText.textContent = `正在播放：${info.title || videoId}`;
    } catch (err) {
        console.error(err);
        const message = String(err.message || "未知错误");
        if (message.includes("风控") || message.toLowerCase().includes("not a bot")) {
            showError(`播放失败：${message}`);
        } else {
            showError(`播放失败：${message}`);
        }
    } finally {
        setLoading(false);
    }
}

async function findPlayableAlternative(blockedVideoId, attempted = new Set()) {
    const blockedIndex = lastItems.findIndex((item) => item.id === blockedVideoId);
    const rotated = blockedIndex >= 0
        ? [...lastItems.slice(blockedIndex + 1), ...lastItems.slice(0, blockedIndex)]
        : [...lastItems];

    const candidates = rotated.slice(0, 8);
    for (const item of candidates) {
        if (!item?.id || item.id === blockedVideoId) continue;
        if (attempted.has(item.id)) continue;
        try {
            const info = await fetchJson(buildApiUrl(`/api/video/${encodeURIComponent(item.id)}`));
            if (!info.blocked) {
                return { id: item.id, title: info.title || item.title || item.id };
            }
        } catch (_) {
            // ignore and try next candidate
        }
    }
    return null;
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

const runningOnGithubPages = window.location.hostname.endsWith("github.io");
if (runningOnGithubPages && !apiBase) {
    statusText.textContent = "当前是 GitHub Pages 静态站，请先配置后端 API。";
    showError("请在网址后追加 ?api=https://你的后端域名 ，例如：.../youtube/?api=https://your-backend.example.com");
} else {
    fetchSearch("编程教程");
}
