/* Warframe DB — Client-side app */
(function () {
  "use strict";

  // ── Shared data cache ──────────────────────────
  const dataCache = {};

  async function loadData(filename) {
    if (!dataCache[filename]) {
      const res = await fetch(`data/${filename}`);
      if (!res.ok) throw new Error(`Failed to load ${filename}`);
      dataCache[filename] = await res.json();
    }
    return dataCache[filename];
  }

  function getTabData(name) {
    if (name === 'mods') return dataCache['mods.json'] || null;
    return dataCache[name + '.json'] || null;
  }

  // Expose globally for components.js and tab files
  window.loadData = loadData;
  window.getTabData = getTabData;

  // ── Tab Manager ────────────────────────────────
  const tabRegistry = {}; // name -> { loader, renderGrid }
  let activeTab = 'mods';
  const tabLoadState = {}; // name -> 'loading' | 'loaded' | 'error'

  function registerTab(name, config) {
    tabRegistry[name] = config;
  }

  function getActiveTab() { return activeTab; }

  async function switchTab(name, filter) {
    if (name === activeTab && !filter) return;

    // Update active state in header nav
    document.querySelectorAll('.tab-btn, .bottom-nav-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === name);
    });

    // Hide all tab panes, show the target
    document.querySelectorAll('.tab-pane').forEach(pane => {
      pane.hidden = true;
      pane.classList.remove('active');
    });
    const pane = document.getElementById('tab-' + name);
    if (pane) {
      pane.hidden = false;
      pane.classList.add('active');
    }

    activeTab = name;
    history.replaceState(null, '', '#' + name);

    if (name === 'mods') {
      // Existing mods tab
      if (filter && filter.field === 'compatName') {
        // Apply search filter
        const searchInput = document.getElementById('search');
        if (searchInput) {
          searchInput.value = filter.value;
          modsFilters.searchTerms.clear();
          modsFilters.searchTerms.add(filter.value.toLowerCase());
          applyModsFilters();
        }
      }
      return;
    }

    const reg = tabRegistry[name];
    if (!reg) return;

    // Already loaded
    if (tabLoadState[name] === 'loaded') {
      if (filter) applyTabFilter(name, filter);
      return;
    }

    if (tabLoadState[name] === 'loading') return;
    tabLoadState[name] = 'loading';

    // Build the tab pane layout
    if (pane) {
      pane.innerHTML = `
        <aside class="tab-sidebar" id="sidebar-${name}"></aside>
        <div class="tab-content-area" id="content-${name}"></div>`;
    }

    try {
      const data = await reg.loader();
      tabLoadState[name] = 'loaded';

      const sidebarEl = document.getElementById('sidebar-' + name);
      const contentEl = document.getElementById('content-' + name);
      if (sidebarEl && contentEl) {
        reg.renderGrid(data, contentEl, sidebarEl);
      }
      if (filter) applyTabFilter(name, filter);
    } catch (e) {
      tabLoadState[name] = 'error';
      if (pane) pane.innerHTML = `<p class="text-muted" style="padding:2rem;">Failed to load ${name} data. Data will be available after the first pipeline run.</p>`;
      console.error(e);
    }
  }

  function applyTabFilter(name, filter) {
    // Tab search input IDs: weapon-search, wf-search, arcane-search, relic-search
    const idMap = { weapons: 'weapon-search', warframes: 'wf-search', arcanes: 'arcane-search', relics: 'relic-search' };
    const searchEl = document.getElementById(idMap[name] || (name + '-search'));
    if (searchEl && filter.value) {
      searchEl.value = filter.value;
      searchEl.dispatchEvent(new Event('input'));
    }
  }

  // Expose globally for tab files
  window.registerTab = registerTab;
  window.getActiveTab = getActiveTab;
  window.switchTab = switchTab;

  // ── Modal Nav Stack ────────────────────────────
  let modalNavStack = [];

  function openModal(item, category) {
    modalNavStack = [{ item, category }];
    _renderModal(item, category);
    modalOverlay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function pushModalNav(item, category) {
    modalNavStack.push({ item, category });
    _renderModal(item, category);
  }

  function popModalNav() {
    if (modalNavStack.length <= 1) { closeModal(); return; }
    modalNavStack.pop();
    const { item, category } = modalNavStack[modalNavStack.length - 1];
    _renderModal(item, category);
  }

  function closeModal() {
    modalOverlay.hidden = true;
    document.body.style.overflow = '';
    modalNavStack = [];
    hideTooltip();
  }

  function _renderModal(item, category) {
    modalContent.innerHTML = renderModalContent(item, category);
    _updateBreadcrumb();

    if (category === 'weapon' || category === 'warframe') {
      mountRelatedMods(item, category);
    }
  }

  function _updateBreadcrumb() {
    const bc = document.getElementById('modal-breadcrumb');
    if (!bc) return;
    if (modalNavStack.length <= 1) {
      bc.hidden = true;
      return;
    }
    bc.hidden = false;
    let html = '<button class="breadcrumb-back" onclick="popModalNav()">←</button><span class="breadcrumb-trail">';
    for (let i = 0; i < modalNavStack.length - 1; i++) {
      const entry = modalNavStack[i];
      html += `<button class="breadcrumb-crumb" data-depth="${i}">${escapeAttr(entry.item.name || '')}</button>
               <span class="breadcrumb-sep">/</span>`;
    }
    const current = modalNavStack[modalNavStack.length - 1];
    html += `<span class="breadcrumb-current">${esc(current.item.name || '')}</span>`;
    html += '</span>';
    bc.innerHTML = html;

    bc.querySelectorAll('.breadcrumb-crumb').forEach(btn => {
      btn.addEventListener('click', () => {
        const depth = parseInt(btn.dataset.depth, 10);
        modalNavStack = modalNavStack.slice(0, depth + 1);
        const { item, category } = modalNavStack[modalNavStack.length - 1];
        _renderModal(item, category);
      });
    });
  }

  function renderModalContent(item, category) {
    switch (category) {
      case 'mod':      return renderModModal(item);
      case 'weapon':   return window._renderWeaponModal ? window._renderWeaponModal(item) : '<p>Loading...</p>';
      case 'warframe': return window._renderWarframeModal ? window._renderWarframeModal(item) : '<p>Loading...</p>';
      case 'arcane':   return window._renderArcaneModal ? window._renderArcaneModal(item) : '<p>Loading...</p>';
      case 'relic':    return window._renderRelicModal ? window._renderRelicModal(item) : '<p>Loading...</p>';
      default:         return '<p>Loading...</p>';
    }
  }

  // Expose globally
  window.openModal = openModal;
  window.pushModalNav = pushModalNav;
  window.popModalNav = popModalNav;
  window.closeModal = closeModal;

  // ── State ──────────────────────────────────────
  let allMods = [];
  let filtered = [];
  let displayed = 0;
  const PAGE_SIZE = 60;
  let autocompleteCandidates = [];
  let autocompleteActiveIndex = -1;

  const modsFilters = {
    searchTerms: new Set(),
    types: new Set(),
    compats: new Set(),
    stats: new Set(),
    rarities: new Set(),
    dropSearch: "",
    planets: new Set(),
    modProps: new Set(),
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
  const autocompleteList = $("#autocomplete-list");

  // ── Init ───────────────────────────────────────
  async function init() {
    // Set up tab navigation
    document.querySelectorAll('.tab-btn, .bottom-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Restore tab from URL hash
    const hash = location.hash.replace('#', '');
    if (hash && ['mods','warframes','weapons','arcanes','relics'].includes(hash)) {
      if (hash !== 'mods') {
        await switchTab(hash);
      }
    }

    try {
      const [modsRes, metaRes] = await Promise.all([
        fetch("data/mods.json"),
        fetch("data/meta.json").catch(() => null),
      ]);
      allMods = await modsRes.json();
      dataCache['mods.json'] = allMods;

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
      noResults.textContent = "No mod data yet. Data will appear after the first nightly update.";
      noResults.hidden = false;
      return;
    }

    buildFilterOptions();
    buildAutocompleteList();
    bindEvents();
    applyModsFilters();
  }

  // ── Autocomplete ───────────────────────────────
  function buildAutocompleteList() {
    const names = allMods.map((m) => m.name);
    const stats = [...new Set(allMods.flatMap((m) => (m.statTypes || []).map(cleanText)))];
    autocompleteCandidates = [...new Set([...names, ...stats])].sort((a, b) => a.localeCompare(b));
  }

  function showAutocomplete(query) {
    if (!query || query.length < 2) { hideAutocomplete(); return; }
    const q = query.toLowerCase();
    const matches = autocompleteCandidates.filter((c) => c.toLowerCase().includes(q)).slice(0, 8);
    if (matches.length === 0) { hideAutocomplete(); return; }

    autocompleteActiveIndex = -1;
    autocompleteList.innerHTML = "";
    for (const match of matches) {
      const li = document.createElement("li");
      li.textContent = match;
      li.addEventListener("mousedown", (e) => { e.preventDefault(); selectAutocomplete(match); });
      autocompleteList.appendChild(li);
    }
    autocompleteList.hidden = false;
  }

  function hideAutocomplete() {
    autocompleteList.hidden = true;
    autocompleteList.innerHTML = "";
    autocompleteActiveIndex = -1;
  }

  function selectAutocomplete(text) {
    modsFilters.searchTerms.add(text.toLowerCase());
    searchInput.value = "";
    hideAutocomplete();
    applyModsFilters();
  }

  function moveAutocomplete(dir) {
    const items = autocompleteList.querySelectorAll("li");
    if (!items.length) return;
    items[autocompleteActiveIndex]?.classList.remove("active");
    autocompleteActiveIndex = Math.max(0, Math.min(items.length - 1, autocompleteActiveIndex + dir));
    items[autocompleteActiveIndex].classList.add("active");
  }

  // ── Build filter checkboxes ────────────────────
  function buildFilterOptions() {
    const typeCounts = countBy(allMods, (m) => m.type);
    const compatCounts = countBy(allMods.filter((m) => m.compatName), (m) => formatCompat(m.compatName));
    const rarityCounts = countBy(allMods, (m) => m.rarity);

    const statCounts = {};
    for (const mod of allMods) {
      for (const s of mod.statTypes || []) {
        const cleaned = cleanText(s);
        if (cleaned) statCounts[cleaned] = (statCounts[cleaned] || 0) + 1;
      }
    }

    // Planet counts: collect unique planets from mod drops
    const planetCounts = {};
    for (const mod of allMods) {
      const seen = new Set();
      for (const drop of (mod.drops || [])) {
        if (drop.planet && !seen.has(drop.planet)) {
          seen.add(drop.planet);
          planetCounts[drop.planet] = (planetCounts[drop.planet] || 0) + 1;
        }
      }
    }

    renderCheckboxes("filter-type", sortEntries(typeCounts), modsFilters.types);
    renderCheckboxes("filter-compat", sortEntries(compatCounts), modsFilters.compats);
    renderCheckboxes("filter-rarity", rarityCounts, modsFilters.rarities);
    renderCheckboxes("filter-stat", sortEntries(statCounts), modsFilters.stats);

    // Planet filter — only render the section if any planets are present
    const planetContainer = document.getElementById("filter-planet");
    if (planetContainer && Object.keys(planetCounts).length > 0) {
      renderCheckboxes("filter-planet", sortEntries(planetCounts), modsFilters.planets);
    } else if (document.getElementById("group-planet")) {
      document.getElementById("group-planet").style.display = "none";
    }
  }

  function countBy(arr, fn) {
    const m = {};
    for (const item of arr) {
      const k = fn(item);
      if (k) m[k] = (m[k] || 0) + 1;
    }
    return m;
  }

  function sortEntries(obj) {
    const sorted = {};
    const keys = Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
    for (const k of keys) sorted[k] = obj[k];
    return sorted;
  }

  function formatCompat(c) {
    if (!c) return "";
    return c.charAt(0) + c.slice(1).toLowerCase();
  }

  function renderCheckboxes(containerId, counts, filterSet) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "";
    for (const [value, count] of Object.entries(counts)) {
      const lbl = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = value;
      cb.addEventListener("change", () => {
        if (cb.checked) filterSet.add(value);
        else filterSet.delete(value);

        if (containerId === "filter-rarity") {
          const quickBtn = document.querySelector(`.quick-filter-btn[data-rarity="${value}"]`);
          if (quickBtn) {
            if (cb.checked) quickBtn.classList.add("active");
            else quickBtn.classList.remove("active");
          }
        }
        applyModsFilters();
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
      showAutocomplete(searchInput.value.trim());
    }, 200));

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") {
        if (!autocompleteList.hidden) { e.preventDefault(); moveAutocomplete(1); }
      } else if (e.key === "ArrowUp") {
        if (!autocompleteList.hidden) { e.preventDefault(); moveAutocomplete(-1); }
      } else if (e.key === "Enter") {
        e.preventDefault();
        const active = autocompleteList.querySelector("li.active");
        if (active) {
          selectAutocomplete(active.textContent);
        } else {
          const val = searchInput.value.trim();
          if (val) {
            modsFilters.searchTerms.add(val.toLowerCase());
            searchInput.value = "";
            hideAutocomplete();
            applyModsFilters();
          }
        }
      } else if (e.key === "Escape") {
        hideAutocomplete();
      }
    });

    searchInput.addEventListener("blur", () => setTimeout(() => hideAutocomplete(), 150));

    dropSearchInput.addEventListener("input", debounce(() => {
      modsFilters.dropSearch = dropSearchInput.value.trim().toLowerCase();
      applyModsFilters();
    }, 200));

    sortSelect.addEventListener("change", () => {
      sortKey = sortSelect.value;
      applyModsFilters();
    });

    loadMore.addEventListener("click", renderMore);

    document.querySelectorAll(".filter-group-header").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = btn.closest(".filter-group");
        const isCollapsed = group.classList.toggle("collapsed");
        btn.setAttribute("aria-expanded", String(!isCollapsed));
      });
    });

    sidebarToggle.addEventListener("click", () => sidebar.classList.toggle("open"));

    document.querySelectorAll(".quick-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rarity = btn.dataset.rarity;
        const isActive = btn.classList.toggle("active");
        if (isActive) modsFilters.rarities.add(rarity);
        else modsFilters.rarities.delete(rarity);

        const checkbox = document.querySelector(`#filter-rarity input[value="${rarity}"]`);
        if (checkbox) checkbox.checked = isActive;
        applyModsFilters();
      });
    });

    const statSearchInput = $("#stat-search");
    if (statSearchInput) {
      statSearchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll("#filter-stat .checkbox-list label").forEach((label) => {
          label.style.display = label.textContent.toLowerCase().includes(query) ? "flex" : "none";
        });
      });
    }

    document.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.preset;
        modsFilters.searchTerms.clear();
        modsFilters.types.clear();
        modsFilters.compats.clear();
        modsFilters.stats.clear();
        modsFilters.rarities.clear();
        modsFilters.planets.clear();
        modsFilters.modProps.clear();
        searchInput.value = "";
        sidebar.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
        document.querySelectorAll(".quick-filter-btn").forEach((qb) => { qb.classList.remove("active"); });
        document.querySelectorAll(".mod-prop-btn").forEach((qb) => { qb.classList.remove("active"); });

        if (preset === "primed") {
          modsFilters.searchTerms.add("primed");
          searchInput.value = "Primed";
          modsFilters.rarities.add("Legendary");
          const cb = document.querySelector('#filter-rarity input[value="Legendary"]');
          if (cb) cb.checked = true;
          const btn2 = document.querySelector('.quick-filter-btn[data-rarity="Legendary"]');
          if (btn2) btn2.classList.add("active");
        } else if (preset === "corrupted") {
          modsFilters.searchTerms.add("corrupted");
          searchInput.value = "Corrupted";
        } else if (preset === "nightmare") {
          modsFilters.searchTerms.add("nightmare");
          searchInput.value = "Nightmare";
        } else if (preset === "acolyte") {
          modsFilters.rarities.add("Rare");
          modsFilters.rarities.add("Legendary");
          ['Rare','Legendary'].forEach(r => {
            const cb = document.querySelector(`#filter-rarity input[value="${r}"]`);
            if (cb) cb.checked = true;
            const qb = document.querySelector(`.quick-filter-btn[data-rarity="${r}"]`);
            if (qb) qb.classList.add("active");
          });
        }
        applyModsFilters();
      });
    });

    document.querySelectorAll(".mod-prop-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const prop = btn.dataset.prop;
        const isActive = btn.classList.toggle("active");
        if (isActive) modsFilters.modProps.add(prop);
        else modsFilters.modProps.delete(prop);
        applyModsFilters();
      });
    });

    document.querySelectorAll(".density-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".density-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        grid.classList.remove("compact", "spacious");
        if (btn.dataset.density === "compact") grid.classList.add("compact");
        else if (btn.dataset.density === "spacious") grid.classList.add("spacious");
      });
    });

    clearBtn.addEventListener("click", () => {
      modsFilters.searchTerms.clear();
      modsFilters.types.clear();
      modsFilters.compats.clear();
      modsFilters.stats.clear();
      modsFilters.rarities.clear();
      modsFilters.dropSearch = "";
      modsFilters.planets.clear();
      modsFilters.modProps.clear();
      searchInput.value = "";
      dropSearchInput.value = "";
      hideAutocomplete();
      sidebar.querySelectorAll('input[type="checkbox"]').forEach((cb) => { cb.checked = false; });
      document.querySelectorAll(".quick-filter-btn").forEach((btn) => { btn.classList.remove("active"); });
      document.querySelectorAll(".mod-prop-btn").forEach((btn) => { btn.classList.remove("active"); });
      const statSearchInput2 = $("#stat-search");
      if (statSearchInput2) {
        statSearchInput2.value = "";
        document.querySelectorAll("#filter-stat .checkbox-list label").forEach((label) => { label.style.display = "flex"; });
      }
      sortSelect.value = "name-asc";
      sortKey = "name-asc";
      applyModsFilters();
    });

    modalClose.addEventListener("click", closeModal);
    modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

    // Delegated modal content click handler
    modalContent.addEventListener('click', async e => {
      const navLink = e.target.closest('[data-nav-item]');
      if (navLink) {
        const name = navLink.dataset.navItem;
        const category = navLink.dataset.navCategory;
        let found = null;

        if (category === 'mod') {
          const mods = getTabData('mods') || allMods;
          found = mods.find(m => m.name === name);
          if (found) pushModalNav(found, 'mod');
          return;
        }

        if (category === 'weapon') {
          let weapons = getTabData('weapons');
          if (!weapons) weapons = await loadData('weapons.json');
          found = (weapons || []).find(w => w.name === name);
          if (found) pushModalNav(found, 'weapon');
        } else if (category === 'warframe') {
          let warframes = getTabData('warframes');
          if (!warframes) warframes = await loadData('warframes.json');
          found = (warframes || []).find(w => w.name === name);
          if (found) pushModalNav(found, 'warframe');
        }
        return;
      }

      const filterLink = e.target.closest('[data-filter-tab]');
      if (filterLink) {
        closeModal();
        switchTab(filterLink.dataset.filterTab, {
          field: filterLink.dataset.filterField,
          value: filterLink.dataset.filterValue,
        });
      }
    });

    // Tooltip on modal content (desktop only)
    if (window.matchMedia('(hover: hover)').matches) {
      modalContent.addEventListener('mouseover', e => {
        const chip = e.target.closest('.cross-link-item');
        if (!chip) return;
        const name = chip.dataset.navItem;
        const category = chip.dataset.navCategory;
        const tabName = category === 'weapon' ? 'weapons' : 'warframes';
        const data = getTabData(tabName) || [];
        const item = data.find(i => i.name === name);
        if (item) showTooltip(chip, item, category);
      });
      modalContent.addEventListener('mouseleave', hideTooltip);
    }
  }

  // ── Mods filtering ─────────────────────────────
  function applyModsFilters() {
    filtered = allMods.filter((mod) => {
      for (const q of modsFilters.searchTerms) {
        const inName = mod.name.toLowerCase().includes(q);
        const inDesc = (mod.description || "").toLowerCase().includes(q);
        const inStats = (mod.statTypes || []).some((s) => cleanText(s).toLowerCase().includes(q));
        const inCompat = (mod.compatName || "").toLowerCase().includes(q);
        if (!inName && !inDesc && !inStats && !inCompat) return false;
      }

      if (modsFilters.types.size > 0 && !modsFilters.types.has(mod.type)) return false;

      if (modsFilters.compats.size > 0) {
        if (!modsFilters.compats.has(formatCompat(mod.compatName))) return false;
      }

      if (modsFilters.rarities.size > 0 && !modsFilters.rarities.has(mod.rarity)) return false;

      if (modsFilters.stats.size > 0) {
        const modStats = (mod.statTypes || []).map(cleanText);
        if (!modStats.some((s) => modsFilters.stats.has(s))) return false;
      }

      if (modsFilters.dropSearch) {
        const drops = mod.drops || [];
        if (!drops.some((d) => d.location.toLowerCase().includes(modsFilters.dropSearch))) return false;
      }

      if (modsFilters.planets.size > 0) {
        const drops = mod.drops || [];
        if (!drops.some((d) => d.planet && modsFilters.planets.has(d.planet))) return false;
      }

      if (modsFilters.modProps.size > 0) {
        if (modsFilters.modProps.has("augment") && !mod.isAugment) return false;
        if (modsFilters.modProps.has("exilus") && !mod.isExilus) return false;
        if (modsFilters.modProps.has("utility") && !mod.isUtility) return false;
        if (modsFilters.modProps.has("tradable") && !mod.tradable) return false;
      }

      return true;
    });

    sortMods();
    displayed = 0;
    grid.innerHTML = "";
    updateFilterGroupCounts();
    renderActiveChips();
    renderMore();
  }

  function updateFilterGroupCounts() {
    const entries = [
      { id: "count-type", set: modsFilters.types },
      { id: "count-compat", set: modsFilters.compats },
      { id: "count-stat", set: modsFilters.stats },
      { id: "count-rarity", set: modsFilters.rarities },
      { id: "count-planet", set: modsFilters.planets },
    ];
    for (const { id, set } of entries) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.textContent = set.size;
      el.hidden = set.size === 0;
    }
  }

  function renderActiveChips() {
    const container = document.getElementById("active-chips");
    if (!container) return;
    container.innerHTML = "";

    const addChip = (label, onRemove, type) => {
      const chip = document.createElement("div");
      chip.className = "filter-chip" + (type ? ` chip-${type}` : "");
      const text = document.createElement("span");
      text.textContent = label;
      const btn = document.createElement("button");
      btn.className = "chip-remove";
      btn.setAttribute("aria-label", "Remove filter");
      btn.textContent = "×";
      btn.addEventListener("click", onRemove);
      chip.append(text, btn);
      container.appendChild(chip);
    };

    const uncheckIn = (containerId, value) => {
      document.querySelectorAll(`#${containerId} input[type=checkbox]`).forEach((cb) => {
        if (cb.value === value) cb.checked = false;
      });
    };

    for (const term of modsFilters.searchTerms) {
      addChip(`🔍 ${term}`, () => { modsFilters.searchTerms.delete(term); applyModsFilters(); }, "search");
    }

    for (const v of modsFilters.types) {
      addChip(v, () => { modsFilters.types.delete(v); uncheckIn("filter-type", v); applyModsFilters(); });
    }
    for (const v of modsFilters.compats) {
      addChip(v, () => { modsFilters.compats.delete(v); uncheckIn("filter-compat", v); applyModsFilters(); });
    }
    for (const v of modsFilters.stats) {
      addChip(v, () => { modsFilters.stats.delete(v); uncheckIn("filter-stat", v); applyModsFilters(); });
    }
    for (const v of modsFilters.rarities) {
      addChip(v, () => {
        modsFilters.rarities.delete(v);
        uncheckIn("filter-rarity", v);
        const quickBtn = document.querySelector(`.quick-filter-btn[data-rarity="${v}"]`);
        if (quickBtn) quickBtn.classList.remove("active");
        applyModsFilters();
      });
    }
    for (const v of modsFilters.planets) {
      addChip(v, () => {
        modsFilters.planets.delete(v);
        uncheckIn("filter-planet", v);
        applyModsFilters();
      }, "planet");
    }
    for (const v of modsFilters.modProps) {
      const label = v.charAt(0).toUpperCase() + v.slice(1);
      addChip(label, () => {
        modsFilters.modProps.delete(v);
        const propBtn = document.querySelector(`.mod-prop-btn[data-prop="${v}"]`);
        if (propBtn) propBtn.classList.remove("active");
        applyModsFilters();
      }, "prop");
    }
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

  // ── Mods rendering ─────────────────────────────
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
    card.className = `mod-card rarity-${(mod.rarity || "common").toLowerCase()}`;
    card.addEventListener("click", () => openModal(mod, 'mod'));

    const rarityClass = (mod.rarity || "common").toLowerCase();
    const thumbSrc = itemImageUrl(mod);
    const maxStats = getMaxStats(mod);

    card.innerHTML = `
      <div class="mod-card-header">
        ${thumbSrc
          ? `<img class="mod-card-thumb" src="${escapeAttr(thumbSrc)}" alt="" loading="lazy">`
          : `<div class="mod-card-thumb"></div>`}
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

  // ── Mod Modal ──────────────────────────────────
  function renderModModal(mod) {
    const rarityClass = (mod.rarity || "common").toLowerCase();
    const wikiUrl = `https://warframe.fandom.com/wiki/${encodeURIComponent(cleanText(mod.name).replace(/ /g, "_"))}`;
    const modImage = itemImageUrl(mod);

    let html = `
      <div class="modal-header">
        ${modImage ? `<img src="${escapeAttr(modImage)}" alt="${escapeAttr(cleanText(mod.name))}" class="modal-mod-image">` : ""}
        <div class="modal-header-text">
          <h2>${esc(mod.name)}</h2>
          <p class="modal-type">${esc(mod.type)}${mod.compatName ? " - " + renderCompatChip(mod.compatName) : ""}</p>
        </div>
      </div>
    `;

    if (mod.description) {
      html += `<div class="modal-section"><h3>Description</h3><p>${esc(mod.description)}</p></div>`;
    }

    html += `<div class="modal-section mod-card-badges" style="flex-wrap:wrap;">
      <span class="badge badge-${rarityClass}">${esc(mod.rarity)}</span>
      ${mod.polarity ? `<span class="badge badge-polarity">${esc(mod.polarity)}</span>` : ""}
      <span class="badge badge-drain">${mod.baseDrain} drain</span>
      <span class="badge badge-drain">Max rank: ${mod.fusionLimit}</span>
      ${mod.tradable ? '<span class="badge badge-polarity">Tradable</span>' : ""}
      <a href="${wikiUrl}" target="_blank" rel="noopener noreferrer" class="badge badge-polarity" style="text-decoration:none;">📖 Wiki</a>
    </div>`;

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

    if (mod.drops && mod.drops.length > 0) {
      html += `<div class="modal-section"><h3>Drop Sources</h3>${renderDropTable(mod.drops)}</div>`;
    }

    return html;
  }

  // ── Compat Chip ─────────────────────────────────
  function renderCompatChip(compatName) {
    if (!compatName) return '';
    const upper = compatName.toUpperCase();
    if (upper === 'ANY' || upper === 'UNIQUE' || upper === 'MOD') {
      return esc(formatCompat(compatName));
    }

    // Try to resolve from cached data (synchronous fast path)
    const weapons = getTabData('weapons') || [];
    const warframes = getTabData('warframes') || [];

    const weapon = weapons.find(w => w.name.toUpperCase() === upper);
    if (weapon) {
      return `<button class="cross-link cross-link-item"
        data-nav-item="${escapeAttr(weapon.name)}"
        data-nav-category="weapon">${esc(formatCompat(compatName))} ↗</button>`;
    }

    const warframe = warframes.find(w => w.name.toUpperCase() === upper);
    if (warframe) {
      return `<button class="cross-link cross-link-item"
        data-nav-item="${escapeAttr(warframe.name)}"
        data-nav-category="warframe">${esc(formatCompat(compatName))} ↗</button>`;
    }

    // Data not yet cached — emit a pending placeholder and resolve async
    // Use a unique ID so we can patch it after load
    const placeholderId = 'compat-chip-' + Math.random().toString(36).slice(2);
    _resolveCompatChipAsync(compatName, upper, placeholderId);
    // Return generic chip for now; will be upgraded if resolved
    return `<span id="${placeholderId}"><button class="cross-link cross-link-filter"
      data-filter-tab="weapons"
      data-filter-field="type"
      data-filter-value="${escapeAttr(compatName)}">${esc(formatCompat(compatName))} →</button></span>`;
  }

  async function _resolveCompatChipAsync(compatName, upper, placeholderId) {
    try {
      const [weapons, warframes] = await Promise.all([
        loadData('weapons.json').catch(() => []),
        loadData('warframes.json').catch(() => []),
      ]);

      const weapon = weapons.find(w => w.name.toUpperCase() === upper);
      const warframe = !weapon && warframes.find(w => w.name.toUpperCase() === upper);
      const found = weapon || warframe;
      const category = weapon ? 'weapon' : 'warframe';

      if (!found) return; // no match — leave generic chip as-is

      const el = document.getElementById(placeholderId);
      if (!el) return; // modal already closed

      el.outerHTML = `<button class="cross-link cross-link-item"
        data-nav-item="${escapeAttr(found.name)}"
        data-nav-category="${category}">${esc(formatCompat(compatName))} ↗</button>`;
    } catch (_) { /* ignore */ }
  }

  // ── Helpers ────────────────────────────────────
  function cleanText(s) {
    if (!s) return s;
    return s.replace(/<[^>]+>/g, "");
  }

  function esc(s) {
    if (!s) return "";
    const cleaned = cleanText(s);
    const d = document.createElement("div");
    d.textContent = cleaned;
    return d.innerHTML;
  }

  function escapeAttr(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  // ── Boot ───────────────────────────────────────
  init();
})();
