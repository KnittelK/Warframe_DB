/* Warframe Mod Browser — Client-side app */
(function () {
  "use strict";
 
  // ── State ──────────────────────────────────────
  let allMods = [];
  let filtered = [];
  let displayed = 0;
  const PAGE_SIZE = 60;
 
  // Active filters
  const filters = {
    search: "",
    types: new Set(),
    compats: new Set(),
    stats: new Set(),
    rarities: new Set(),
    dropSearch: "",
  };
 
  let sortKey = "name-asc";
 
  // ── DOM refs ───────────────────────────────────
  const $ = (s) => document.querySelector(s);
  const grid = $("#mod-grid");
  const loading = $("#loading");
  const noResults = $("#no-results");
  const loadMore = $("#load-more");
  const resultCount = $("#result-count");
  const metaInfo = $("#meta-info");
  const searchInput = $("#search");
  const dropSearchInput = $("#drop-search");
  const sortSelect = $("#sort-select");
  const sidebarToggle = $("#sidebar-toggle");
  const sidebar = $("#sidebar");
  const clearBtn = $("#clear-filters");
  const modalOverlay = $("#modal-overlay");
  const modalContent = $("#modal-content");
  const modalClose = $("#modal-close");
 
  // ── Init ───────────────────────────────────────
  async function init() {
    try {
      const [modsRes, metaRes] = await Promise.all([
        fetch("data/mods.json"),
        fetch("data/meta.json").catch(() => null),
      ]);
      allMods = await modsRes.json();
 
      if (metaRes && metaRes.ok) {
        const meta = await metaRes.json();
        if (meta.lastUpdated) {
          const d = new Date(meta.lastUpdated);
          metaInfo.textContent = `${meta.modCount} mods | Updated ${d.toLocaleDateString()}`;
        }
      }
    } catch (e) {
      loading.textContent = "Failed to load mod data.";
      console.error(e);
      return;
    }
 
    loading.hidden = true;
 
    if (allMods.length === 0) {
      noResults.textContent =
        "No mod data yet. Data will appear after the first nightly update.";
      noResults.hidden = false;
      return;
    }
 
    buildFilterOptions();
    bindEvents();
    applyFilters();
  }
 
  // ── Build filter checkboxes from data ──────────
  function buildFilterOptions() {
    const typeCounts = countBy(allMods, (m) => m.type);
    const compatCounts = countBy(
      allMods.filter((m) => m.compatName),
      (m) => formatCompat(m.compatName)
    );
    const rarityCounts = countBy(allMods, (m) => m.rarity);
 
    // Collect all stat types
    const statCounts = {};
    for (const mod of allMods) {
      for (const s of mod.statTypes || []) {
        statCounts[s] = (statCounts[s] || 0) + 1;
      }
    }
 
    renderCheckboxes("filter-type", typeCounts, filters.types);
    renderCheckboxes("filter-compat", compatCounts, filters.compats);
    renderCheckboxes("filter-rarity", rarityCounts, filters.rarities);
    renderCheckboxes(
      "filter-stat",
      sortEntries(statCounts),
      filters.stats
    );
  }
 
  function countBy(arr, fn) {
    const m = {};
    for (const item of arr) {
      const k = fn(item);
      if (k) m[k] = (m[k] || 0) + 1;
    }
    return sortEntries(m);
  }
 
  function sortEntries(obj) {
    const sorted = {};
    for (const k of Object.keys(obj).sort()) sorted[k] = obj[k];
    return sorted;
  }
 
  function formatCompat(c) {
    if (!c) return "";
    return c.charAt(0) + c.slice(1).toLowerCase();
  }
 
  function renderCheckboxes(containerId, counts, filterSet) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    for (const [value, count] of Object.entries(counts)) {
      const lbl = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = value;
      cb.addEventListener("change", () => {
        if (cb.checked) filterSet.add(value);
        else filterSet.delete(value);
        applyFilters();
      });
      const span = document.createElement("span");
      span.textContent = value;
      const cnt = document.createElement("span");
      cnt.className = "count";
      cnt.textContent = count;
      lbl.append(cb, span, cnt);
      container.appendChild(lbl);
    }
  }
 
  // ── Events ─────────────────────────────────────
  function bindEvents() {
    searchInput.addEventListener("input", debounce(() => {
      filters.search = searchInput.value.trim().toLowerCase();
      applyFilters();
    }, 200));
 
    dropSearchInput.addEventListener("input", debounce(() => {
      filters.dropSearch = dropSearchInput.value.trim().toLowerCase();
      applyFilters();
    }, 200));
 
    sortSelect.addEventListener("change", () => {
      sortKey = sortSelect.value;
      applyFilters();
    });
 
    loadMore.addEventListener("click", renderMore);
 
    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });
 
    clearBtn.addEventListener("click", () => {
      filters.search = "";
      filters.dropSearch = "";
      filters.types.clear();
      filters.compats.clear();
      filters.stats.clear();
      filters.rarities.clear();
      searchInput.value = "";
      dropSearchInput.value = "";
      sidebar.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
      });
      sortSelect.value = "name-asc";
      sortKey = "name-asc";
      applyFilters();
    });
 
    modalClose.addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }
 
  // ── Filtering ──────────────────────────────────
  function applyFilters() {
    filtered = allMods.filter((mod) => {
      if (filters.search && !mod.name.toLowerCase().includes(filters.search)) {
        return false;
      }
 
      if (filters.types.size > 0 && !filters.types.has(mod.type)) {
        return false;
      }
 
      if (filters.compats.size > 0) {
        const fc = formatCompat(mod.compatName);
        if (!filters.compats.has(fc)) return false;
      }
 
      if (filters.rarities.size > 0 && !filters.rarities.has(mod.rarity)) {
        return false;
      }
 
      if (filters.stats.size > 0) {
        const modStats = mod.statTypes || [];
        if (!modStats.some((s) => filters.stats.has(s))) return false;
      }
 
      if (filters.dropSearch) {
        const drops = mod.drops || [];
        if (
          !drops.some((d) =>
            d.location.toLowerCase().includes(filters.dropSearch)
          )
        ) {
          return false;
        }
      }
 
      return true;
    });
 
    sortMods();
    displayed = 0;
    grid.innerHTML = "";
    renderMore();
  }
 
  function sortMods() {
    const [key, dir] = sortKey.split("-");
    const mult = dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (key === "name") return mult * a.name.localeCompare(b.name);
      if (key === "drain") return mult * ((a.baseDrain || 0) - (b.baseDrain || 0));
      return 0;
    });
  }
 
  // ── Rendering ──────────────────────────────────
  function renderMore() {
    const end = Math.min(displayed + PAGE_SIZE, filtered.length);
    const fragment = document.createDocumentFragment();
 
    for (let i = displayed; i < end; i++) {
      fragment.appendChild(createCard(filtered[i]));
    }
 
    grid.appendChild(fragment);
    displayed = end;
 
    resultCount.textContent = `${filtered.length} mod${filtered.length !== 1 ? "s" : ""} found`;
    noResults.hidden = filtered.length > 0;
    loadMore.hidden = displayed >= filtered.length;
  }
 
  function createCard(mod) {
    const card = document.createElement("article");
    card.className = "mod-card";
    card.addEventListener("click", () => openModal(mod));
 
    const rarityClass = (mod.rarity || "common").toLowerCase();
    const thumbSrc = mod.wikiaThumbnail || "";
    const maxStats = getMaxStats(mod);
 
    card.innerHTML = `
      <div class="mod-card-header">
        ${
          thumbSrc
            ? `<img class="mod-card-thumb" src="${escapeAttr(thumbSrc)}" alt="" loading="lazy">`
            : `<div class="mod-card-thumb"></div>`
        }
        <div class="mod-card-title">
          <div class="mod-card-name">${esc(mod.name)}</div>
          <div class="mod-card-type">${esc(mod.type)}${mod.compatName ? " - " + esc(formatCompat(mod.compatName)) : ""}</div>
        </div>
      </div>
      <div class="mod-card-badges">
        <span class="badge badge-${rarityClass}">${esc(mod.rarity)}</span>
        ${mod.polarity ? `<span class="badge badge-polarity">${esc(mod.polarity)}</span>` : ""}
        <span class="badge badge-drain">${mod.baseDrain} drain</span>
      </div>
      ${maxStats ? `<div class="mod-card-stats">${esc(maxStats)}</div>` : ""}
    `;
 
    return card;
  }
 
  function getMaxStats(mod) {
    const ls = mod.levelStats;
    if (!Array.isArray(ls) || ls.length === 0) return "";
    const last = ls[ls.length - 1];
    const stats = last.stats || last;
    if (!Array.isArray(stats)) return "";
    return stats.slice(0, 2).join(", ");
  }
 
  // ── Modal ──────────────────────────────────────
  function openModal(mod) {
    const rarityClass = (mod.rarity || "common").toLowerCase();
    let html = `
      <h2>${esc(mod.name)}</h2>
      <p class="modal-type">${esc(mod.type)}${mod.compatName ? " - " + esc(formatCompat(mod.compatName)) : ""}</p>
    `;
 
    if (mod.description) {
      html += `<div class="modal-section"><h3>Description</h3><p>${esc(mod.description)}</p></div>`;
    }
 
    // Info badges
    html += `<div class="modal-section mod-card-badges" style="flex-wrap:wrap;">
      <span class="badge badge-${rarityClass}">${esc(mod.rarity)}</span>
      ${mod.polarity ? `<span class="badge badge-polarity">${esc(mod.polarity)}</span>` : ""}
      <span class="badge badge-drain">${mod.baseDrain} drain</span>
      <span class="badge badge-drain">Max rank: ${mod.fusionLimit}</span>
      ${mod.tradable ? '<span class="badge badge-polarity">Tradable</span>' : ""}
    </div>`;
 
    // Stats table
    if (Array.isArray(mod.levelStats) && mod.levelStats.length > 0) {
      html += `<div class="modal-section"><h3>Stats by Rank</h3><table class="stat-table"><thead><tr><th>Rank</th><th>Effects</th></tr></thead><tbody>`;
      mod.levelStats.forEach((level, i) => {
        const stats = level.stats || level;
        if (Array.isArray(stats)) {
          html += `<tr><td>${i}</td><td>${stats.map(esc).join("<br>")}</td></tr>`;
        }
      });
      html += `</tbody></table></div>`;
    }
 
    // Drops
    if (mod.drops && mod.drops.length > 0) {
      html += `<div class="modal-section"><h3>Drop Sources</h3><ul class="drop-list">`;
      const topDrops = mod.drops.slice(0, 20);
      for (const d of topDrops) {
        const pct = (d.chance * 100).toFixed(2);
        html += `<li><span>${esc(d.location)}</span><span class="drop-chance">${pct}%</span></li>`;
      }
      if (mod.drops.length > 20) {
        html += `<li><span style="color:var(--text-muted)">...and ${mod.drops.length - 20} more</span><span></span></li>`;
      }
      html += `</ul></div>`;
    }
 
    modalContent.innerHTML = html;
    modalOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }
 
  function closeModal() {
    modalOverlay.hidden = true;
    document.body.style.overflow = "";
  }
 
  // ── Helpers ────────────────────────────────────
  function esc(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }
 
  function escapeAttr(s) {
    return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
 
  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }
 
  // ── Boot ───────────────────────────────────────
  init();
})();