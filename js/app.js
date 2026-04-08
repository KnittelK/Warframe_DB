/**
 * Warframe DB - Main Application Script
 * Loads data from local JSON files and renders category views.
 */

/**
 * Safely strip all HTML tags from a string using the browser's own parser
 * so that no tag-based injection (including nested patterns) survives.
 * @param {string} str
 * @returns {string}
 */
function stripHtml(str) {
  if (!str) return '';
  return new DOMParser().parseFromString(str, 'text/html').body.textContent || '';
}

const CATEGORIES = [
  { id: 'warframes', label: 'Warframes', icon: '🛡️', file: 'data/warframes.json' },
  { id: 'primary',   label: 'Primary',   icon: '🔫', file: 'data/primary.json' },
  { id: 'secondary', label: 'Secondary', icon: '🔧', file: 'data/secondary.json' },
  { id: 'melee',     label: 'Melee',     icon: '⚔️',  file: 'data/melee.json' },
  { id: 'mods',      label: 'Mods',      icon: '🔮', file: 'data/mods.json' },
];

const PAGE_SIZE = 48;

let state = {
  category: 'warframes',
  items: [],
  filtered: [],
  page: 1,
  search: '',
  sort: 'name',
  filter: '',
  loading: false,
  dataLastUpdated: null,
};

/* ───────────────────────── Fetch + Cache ───────────────────────── */

const _cache = {};

async function fetchCategory(id) {
  if (_cache[id]) return _cache[id];
  const cat = CATEGORIES.find(c => c.id === id);
  if (!cat) return [];
  const res = await fetch(cat.file);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const items = Array.isArray(json.items) ? json.items : json;
  _cache[id] = items;
  return items;
}

async function fetchMeta() {
  try {
    const res = await fetch('data/meta.json');
    if (!res.ok) return;
    const json = await res.json();
    state.dataLastUpdated = json.updated_at || null;
    const el = document.getElementById('updated-at');
    if (el && json.updated_at) {
      el.textContent = `Data last updated: ${new Date(json.updated_at).toLocaleString('en-US', { timeZone: 'UTC' })} UTC`;
    }
  } catch (_) { /* silent */ }
}

/* ───────────────────────── Filter / Sort ───────────────────────── */

/**
 * Returns true when an item matches the active category filter value.
 * Extracted to keep applyFilter() readable.
 */
function matchesFilter(item, category, filterValue) {
  if (category === 'warframes') {
    return (item.type || '').toLowerCase() === filterValue;
  }
  if (category === 'primary' || category === 'secondary') {
    return (item.trigger || '').toLowerCase() === filterValue;
  }
  if (category === 'melee') {
    return (item.type || '').toLowerCase().includes(filterValue);
  }
  if (category === 'mods') {
    return (item.polarity || '').toLowerCase() === filterValue;
  }
  return true;
}

function applyFilter() {
  let items = state.items.slice();

  if (state.search) {
    const q = state.search.toLowerCase();
    items = items.filter(it =>
      (it.name || '').toLowerCase().includes(q) ||
      (it.description || '').toLowerCase().includes(q)
    );
  }

  if (state.filter) {
    items = items.filter(it => matchesFilter(it, state.category, state.filter));
  }

  items.sort((a, b) => {
    if (state.sort === 'name') return (a.name || '').localeCompare(b.name || '');
    if (state.sort === 'mastery') return (b.masteryReq || 0) - (a.masteryReq || 0);
    if (state.sort === 'dmg') return (b.totalDamage || b.damage || 0) - (a.totalDamage || a.damage || 0);
    return 0;
  });

  state.filtered = items;
  state.page = 1;
}

function currentPage() {
  const start = (state.page - 1) * PAGE_SIZE;
  return state.filtered.slice(start, start + PAGE_SIZE);
}

/* ───────────────────────── Rendering ───────────────────────── */

function categoryIcon(item) {
  if (item.wikiaThumbnail || item.wikiaUrl) {
    return `<img class="card-icon" src="${item.wikiaThumbnail || ''}" alt="${item.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
            <div class="card-icon-placeholder" style="display:none">${getCategoryEmoji()}</div>`;
  }
  return `<div class="card-icon-placeholder">${getCategoryEmoji()}</div>`;
}

function getCategoryEmoji() {
  const map = { warframes: '🛡️', primary: '🔫', secondary: '🔧', melee: '⚔️', mods: '🔮' };
  return map[state.category] || '📦';
}

function renderBadges(item) {
  const badges = [];
  if (item.masteryReq) badges.push(`<span class="badge badge-info">MR ${item.masteryReq}</span>`);
  if (item.rarity) {
    const cls = { Common: 'badge-default', Uncommon: 'badge-success', Rare: 'badge-accent', Legendary: 'badge-warning' }[item.rarity] || 'badge-default';
    badges.push(`<span class="badge ${cls}">${item.rarity}</span>`);
  }
  if (item.type && state.category !== 'warframes') badges.push(`<span class="badge badge-default">${item.type}</span>`);
  if (item.trigger) badges.push(`<span class="badge badge-default">${item.trigger}</span>`);
  if (item.polarity) badges.push(`<span class="badge badge-default">${item.polarity}</span>`);
  return badges.slice(0, 3).join('');
}

function renderStats(item) {
  const stats = [];
  if (item.health) stats.push({ label: 'Health', value: item.health });
  if (item.shield) stats.push({ label: 'Shield', value: item.shield });
  if (item.armor) stats.push({ label: 'Armor', value: item.armor });
  if (item.energy) stats.push({ label: 'Energy', value: item.energy });
  if (item.damage) stats.push({ label: 'Damage', value: typeof item.damage === 'object' ? Object.values(item.damage).reduce((a, b) => a + b, 0).toFixed(1) : item.damage });
  if (item.accuracy) stats.push({ label: 'Accuracy', value: item.accuracy });
  if (item.fireRate) stats.push({ label: 'Fire Rate', value: item.fireRate });
  if (item.magazineSize) stats.push({ label: 'Magazine', value: item.magazineSize });
  if (stats.length === 0) return '';
  return `<div class="stats-grid">${stats.slice(0, 4).map(s => `<div class="stat-item"><span class="label">${s.label}</span><span class="value">${s.value}</span></div>`).join('')}</div>`;
}

function renderCard(item) {
  const desc = item.description ? `<p class="card-description">${stripHtml(item.description)}</p>` : '';
  return `
    <div class="card" onclick="openModal(${JSON.stringify(item.name).replace(/'/g, "&#39;")})">
      <div class="card-header">
        ${categoryIcon(item)}
        <div class="card-title-area">
          <div class="card-name">${item.name || 'Unknown'}</div>
          <div class="card-subtitle">${item.type || item.category || ''}</div>
        </div>
      </div>
      <div class="card-body">
        ${desc}
        ${renderStats(item)}
        <div class="card-meta">${renderBadges(item)}</div>
      </div>
    </div>`;
}

function renderGrid() {
  const container = document.getElementById('grid');
  const items = currentPage();
  if (items.length === 0) {
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="emoji">🔍</div>
      <h3>No results found</h3>
      <p>Try adjusting your search or filters.</p>
    </div>`;
  } else {
    container.innerHTML = items.map(renderCard).join('');
  }
}

function renderStats() {
  const el = document.getElementById('count-label');
  if (el) el.textContent = `${state.filtered.length} items`;
}

function renderPagination() {
  const total = Math.ceil(state.filtered.length / PAGE_SIZE);
  const container = document.getElementById('pagination');
  if (total <= 1) { container.innerHTML = ''; return; }

  let html = `<button onclick="goPage(${state.page - 1})" ${state.page === 1 ? 'disabled' : ''}>‹ Prev</button>`;
  const pages = pagesToShow(state.page, total);
  pages.forEach(p => {
    if (p === '…') {
      html += `<span class="page-info">…</span>`;
    } else {
      html += `<button class="${p === state.page ? 'active' : ''}" onclick="goPage(${p})">${p}</button>`;
    }
  });
  html += `<button onclick="goPage(${state.page + 1})" ${state.page === total ? 'disabled' : ''}>Next ›</button>`;
  container.innerHTML = html;
}

function pagesToShow(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

function goPage(p) {
  const total = Math.ceil(state.filtered.length / PAGE_SIZE);
  state.page = Math.max(1, Math.min(total, p));
  renderGrid();
  renderPagination();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ───────────────────────── Filter Controls ───────────────────────── */

function buildFilterOptions() {
  const sel = document.getElementById('filter-select');
  if (!sel) return;
  const optMap = {
    warframes: [{ value: '', label: 'All Types' }, { value: 'warframe prime', label: 'Prime' }],
    primary: [{ value: '', label: 'All Triggers' }, { value: 'auto', label: 'Auto' }, { value: 'semi', label: 'Semi-Auto' }, { value: 'burst', label: 'Burst' }, { value: 'charge', label: 'Charge' }],
    secondary: [{ value: '', label: 'All Triggers' }, { value: 'auto', label: 'Auto' }, { value: 'semi', label: 'Semi-Auto' }],
    melee: [{ value: '', label: 'All Types' }],
    mods: [{ value: '', label: 'All Polarities' }, { value: 'madurai', label: 'Madurai' }, { value: 'vazarin', label: 'Vazarin' }, { value: 'naramon', label: 'Naramon' }, { value: 'unairu', label: 'Unairu' }, { value: 'zenurik', label: 'Zenurik' }],
  };
  const opts = optMap[state.category] || [{ value: '', label: 'All' }];
  sel.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  sel.value = '';
  state.filter = '';
}

function buildSortOptions() {
  const sel = document.getElementById('sort-select');
  if (!sel) return;
  const isWeapon = ['primary', 'secondary', 'melee'].includes(state.category);
  sel.innerHTML = `<option value="name">Name A–Z</option>
    <option value="mastery">Mastery Rank</option>
    ${isWeapon ? '<option value="dmg">Damage</option>' : ''}`;
  sel.value = 'name';
  state.sort = 'name';
}

/* ───────────────────────── Category Switch ───────────────────────── */

async function switchCategory(id) {
  if (state.loading) return;
  state.category = id;
  state.search = '';
  state.filter = '';
  state.sort = 'name';
  state.page = 1;

  document.querySelectorAll('nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === id);
  });

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';

  buildFilterOptions();
  buildSortOptions();

  const grid = document.getElementById('grid');
  grid.innerHTML = `<div class="loading" style="grid-column:1/-1"><div class="spinner"></div><span>Loading ${id}…</span></div>`;
  document.getElementById('pagination').innerHTML = '';

  try {
    state.loading = true;
    state.items = await fetchCategory(id);
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="emoji">⚠️</div>
      <h3>Could not load data</h3>
      <p>${err.message}</p>
    </div>`;
    state.items = [];
    state.filtered = [];
    state.loading = false;
    document.getElementById('count-label').textContent = '0 items';
    return;
  }

  state.loading = false;
  applyFilter();
  renderGrid();
  renderPagination();
  document.getElementById('count-label').textContent = `${state.filtered.length} items`;
}

/* ───────────────────────── Modal ───────────────────────── */

function openModal(name) {
  const item = state.items.find(i => i.name === name);
  if (!item) return;

  const modal = document.getElementById('modal-overlay');
  const icon = item.wikiaThumbnail
    ? `<img class="card-icon" src="${item.wikiaThumbnail}" alt="${item.name}" onerror="this.style.display='none'">`
    : `<div class="card-icon-placeholder" style="font-size:2rem">${getCategoryEmoji()}</div>`;

  // Build detail sections
  const primaryStats = [];
  const fields = ['health', 'shield', 'armor', 'energy', 'sprint', 'damage', 'accuracy', 'fireRate', 'criticalChance', 'criticalMultiplier', 'statusChance', 'magazineSize', 'reloadTime', 'noise', 'range', 'comboDuration', 'blockingAngle'];
  fields.forEach(f => {
    if (item[f] != null) {
      let val = item[f];
      if (typeof val === 'object') val = JSON.stringify(val);
      primaryStats.push({ label: f.replace(/([A-Z])/g, ' $1').trim(), value: val });
    }
  });

  const abilitiesHtml = item.abilities
    ? `<div class="modal-section"><h4>Abilities</h4><div class="detail-grid">${item.abilities.map(a => `<div class="detail-item"><div class="label">${stripHtml(a.name || '')}</div><div class="value" style="font-size:0.75rem;font-weight:400">${stripHtml(a.description || '').slice(0, 80)}…</div></div>`).join('')}</div></div>`
    : '';

  const dmgHtml = item.damage && typeof item.damage === 'object'
    ? `<div class="modal-section"><h4>Damage Breakdown</h4><div class="detail-grid">${Object.entries(item.damage).map(([t, v]) => `<div class="detail-item"><div class="label">${t}</div><div class="value">${v}</div></div>`).join('')}</div></div>`
    : '';

  modal.querySelector('.modal-title').textContent = item.name;
  modal.querySelector('.modal-subtitle').textContent = item.type || item.category || '';
  modal.querySelector('.modal-header .icon-slot').innerHTML = icon;
  modal.querySelector('.modal-body').innerHTML = `
    ${item.description ? `<div class="modal-section"><h4>Description</h4><p style="font-size:0.875rem;color:var(--text-secondary)">${stripHtml(item.description)}</p></div>` : ''}
    ${primaryStats.length ? `<div class="modal-section"><h4>Stats</h4><div class="detail-grid">${primaryStats.map(s => `<div class="detail-item"><div class="label">${s.label}</div><div class="value">${s.value}</div></div>`).join('')}</div></div>` : ''}
    ${dmgHtml}
    ${abilitiesHtml}
    ${item.wikiaThumbnail ? `<div class="modal-section"><h4>Wiki</h4><a href="${item.wikiaUrl || '#'}" target="_blank" rel="noopener" style="color:var(--accent)">View on Warframe Wiki ↗</a></div>` : ''}
  `;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ───────────────────────── Init ───────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  // Nav buttons
  document.querySelectorAll('nav button[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => switchCategory(btn.dataset.cat));
  });

  // Search
  const searchInput = document.getElementById('search-input');
  let debounce;
  searchInput.addEventListener('input', e => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.search = e.target.value;
      applyFilter();
      renderGrid();
      renderPagination();
      document.getElementById('count-label').textContent = `${state.filtered.length} items`;
    }, 250);
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', e => {
    state.sort = e.target.value;
    applyFilter();
    renderGrid();
    renderPagination();
  });

  // Filter
  document.getElementById('filter-select').addEventListener('change', e => {
    state.filter = e.target.value;
    applyFilter();
    renderGrid();
    renderPagination();
    document.getElementById('count-label').textContent = `${state.filtered.length} items`;
  });

  // Modal close
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('modal-close-btn').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

  // Load meta + initial category
  fetchMeta();
  buildFilterOptions();
  buildSortOptions();
  switchCategory('warframes');
});
