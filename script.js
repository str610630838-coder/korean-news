const grid = document.getElementById('grid');
const q = document.getElementById('q');
const stats = document.getElementById('stats');
const tpl = document.getElementById('cardTpl');
const reloadBtn = document.getElementById('reloadBtn');

let allItems = [];

async function loadData() {
  try {
    const res = await fetch('./data/magazines.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    allItems = data.items || [];
    render();
  } catch (err) {
    stats.textContent = `加载失败：${err.message}。请先运行抓取脚本生成 data/magazines.json`;
  }
}

function normalize(v) {
  return String(v ?? '').toLowerCase();
}

function render() {
  const keyword = normalize(q.value).trim();
  const filtered = allItems.filter((item) => {
    if (!keyword) return true;
    const joined = [
      item.title,
      item.year,
      item.identifier,
      ...(item.subject || [])
    ].map(normalize).join(' ');
    return joined.includes(keyword);
  });

  stats.textContent = `共 ${allItems.length} 条，当前显示 ${filtered.length} 条`;
  grid.innerHTML = '';

  filtered.forEach((item) => {
    const node = tpl.content.firstElementChild.cloneNode(true);
    node.querySelector('.title').textContent = item.title || 'Untitled';
    node.querySelector('.meta').textContent = `年份：${item.year || '未知'} · ID：${item.identifier}`;
    node.querySelector('.desc').textContent = item.description || '暂无简介';
    const tags = node.querySelector('.tags');
    (item.subject || []).slice(0, 5).forEach((tag) => {
      const el = document.createElement('span');
      el.className = 'tag';
      el.textContent = tag;
      tags.appendChild(el);
    });
    const link = node.querySelector('.link');
    link.href = item.url;
    grid.appendChild(node);
  });
}

q.addEventListener('input', render);
reloadBtn.addEventListener('click', () => {
  alert('静态站不直接联网抓取。\n请在项目目录运行：\npython scripts/fetch_magazines.py\n然后刷新页面。');
});

loadData();