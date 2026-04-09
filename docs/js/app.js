/* Warframe Mod Browser — Client-side app */
(function () {
  "use strict";

  // ── State ──────────────────────────────────────
  let allMods = [];
  let filtered = [];
  let displayed = 0;
  const PAGE_SIZE = 60;
  let autocompleteCandidates = [];
  let autocompleteActiveIndex = -1;

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
  const autocompleteList = $("#autocomplete-list");

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
    buildAutocompleteList();
    bindEvents();
    applyFilters();
  }

  // ── Autocomplete ───────────────────────────────
  function buildAutocompleteList() {
    const names = allMods.map((m) => m.name);
    const stats = [...new Set(allMods.flatMap((m) => m.statTypes || []))];
    autocompleteCandidates = [...new Set([...names, ...stats])].sort((a, b) =>
      a.localeCompare(b),
    );
  }

  function showAutocomplete(query) {
    if (!query || query.length < 2) {
      hideAutocomplete();
      return;
    }
    const q = query.toLowerCase();
    const matches = autocompleteCandidates
      .filter((c) => c.toLowerCase().includes(q))
      .slice(0, 8);
    if (matches.length === 0) {
      hideAutocomplete();
      return;
    }

    autocompleteActiveIndex = -1;
    autocompleteList.innerHTML = "";
    for (const match of matches) {
      const li = document.createElement("li");
      li.textContent = match;
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        selectAutocomplete(match);
      });
      autocompleteList.appendChild(li);
    }
    autocompleteList.hidden = false;
  }

  function hideAutocomplete() {
    autocompleteList.hidden = true;
    autocompleteList.innerHTML = "";
    autocompleteActiveIndex = -1;
  }

  function selectAutocomplete(value) {
    searchInput.value = value;
    filters.search = value.toLowerCase();
    applyFilters();
    hideAutocomplete();
  }

  function moveAutocomplete(dir) {
    const items = autocompleteList.querySelectorAll("li");
    if (!items.length) return;
    items[autocompleteActiveIndex]?.classList.remove("active");
    autocompleteActiveIndex = Math.max(
      0,
      Math.min(items.length - 1, autocompleteActiveIndex + dir),
    );
    items[autocompleteActiveIndex].classList.add("active");
  }

  // ── Build filter checkboxes from data ──────────
  function buildFilterOptions() {
    const typeCounts = countBy(allMods, (m) => m.type);
    const compatCounts = countBy(
      allMods.filter((m) => m.compatName),
      (m) => formatCompat(m.compatName),
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
    renderCheckboxes("filter-stat", sortEntries(statCounts), filters.stats);
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

        // Sync quick filter buttons for rarity
        if (containerId === "filter-rarity") {
          const quickBtn = document.querySelector(
            `.quick-filter-btn[data-rarity="${value}"]`,
          );
          if (quickBtn) {
            if (cb.checked) quickBtn.classList.add("active");
            else quickBtn.classList.remove("active");
          }
        }

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
    searchInput.addEventListener(
      "input",
      debounce(() => {
        const val = searchInput.value.trim();
        filters.search = val.toLowerCase();
        applyFilters();
        showAutocomplete(val);
      }, 200),
    );

    searchInput.addEventListener("keydown", (e) => {
      if (autocompleteList.hidden) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveAutocomplete(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveAutocomplete(-1);
      } else if (e.key === "Enter") {
        const active = autocompleteList.querySelector("li.active");
        if (active) {
          e.preventDefault();
          selectAutocomplete(active.textContent);
        }
      } else if (e.key === "Escape") {
        hideAutocomplete();
      }
    });

    searchInput.addEventListener("blur", () => hideAutocomplete());

    dropSearchInput.addEventListener(
      "input",
      debounce(() => {
        filters.dropSearch = dropSearchInput.value.trim().toLowerCase();
        applyFilters();
      }, 200),
    );

    sortSelect.addEventListener("change", () => {
      sortKey = sortSelect.value;
      applyFilters();
    });

    loadMore.addEventListener("click", renderMore);

    document.querySelectorAll(".filter-group-header").forEach((btn) => {
      btn.addEventListener("click", () => {
        const group = btn.closest(".filter-group");
        const isCollapsed = group.classList.toggle("collapsed");
        btn.setAttribute("aria-expanded", String(!isCollapsed));
      });
    });

    sidebarToggle.addEventListener("click", () => {
      sidebar.classList.toggle("open");
    });

    // Quick rarity filter buttons
    document.querySelectorAll(".quick-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rarity = btn.dataset.rarity;
        const isActive = btn.classList.toggle("active");

        if (isActive) {
          filters.rarities.add(rarity);
        } else {
          filters.rarities.delete(rarity);
        }

        // Sync with advanced rarity checkboxes
        const checkbox = document.querySelector(
          `#filter-rarity input[value="${rarity}"]`,
        );
        if (checkbox) checkbox.checked = isActive;

        applyFilters();
      });
    });

    // Stat search filtering
    const statSearchInput = $("#stat-search");
    if (statSearchInput) {
      statSearchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase();
        const checkboxes = document.querySelectorAll(
          "#filter-stat .checkbox-list label",
        );

        checkboxes.forEach((label) => {
          const text = label.textContent.toLowerCase();
          label.style.display = text.includes(query) ? "flex" : "none";
        });
      });
    }

    // Filter presets
    document.querySelectorAll(".preset-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const preset = btn.dataset.preset;

        // Clear existing filters first
        filters.search = "";
        filters.types.clear();
        filters.compats.clear();
        filters.stats.clear();
        filters.rarities.clear();
        searchInput.value = "";

        // Clear all checkboxes and quick buttons
        sidebar.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          cb.checked = false;
        });
        document.querySelectorAll(".quick-filter-btn").forEach((qb) => {
          qb.classList.remove("active");
        });

        // Apply preset
        if (preset === "primed") {
          searchInput.value = "Primed";
          filters.search = "primed";
          filters.rarities.add("Legendary");
          const legendaryCheckbox = document.querySelector(
            '#filter-rarity input[value="Legendary"]',
          );
          if (legendaryCheckbox) legendaryCheckbox.checked = true;
          const legendaryBtn = document.querySelector(
            '.quick-filter-btn[data-rarity="Legendary"]',
          );
          if (legendaryBtn) legendaryBtn.classList.add("active");
        } else if (preset === "corrupted") {
          searchInput.value = "Corrupted";
          filters.search = "corrupted";
        } else if (preset === "nightmare") {
          searchInput.value = "Nightmare";
          filters.search = "nightmare";
        } else if (preset === "acolyte") {
          // Acolyte mods are typically legendary and have specific names
          filters.rarities.add("Rare");
          filters.rarities.add("Legendary");
          const rareCheckbox = document.querySelector(
            '#filter-rarity input[value="Rare"]',
          );
          const legendaryCheckbox = document.querySelector(
            '#filter-rarity input[value="Legendary"]',
          );
          if (rareCheckbox) rareCheckbox.checked = true;
          if (legendaryCheckbox) legendaryCheckbox.checked = true;
          const rareBtn = document.querySelector(
            '.quick-filter-btn[data-rarity="Rare"]',
          );
          const legendaryBtn = document.querySelector(
            '.quick-filter-btn[data-rarity="Legendary"]',
          );
          if (rareBtn) rareBtn.classList.add("active");
          if (legendaryBtn) legendaryBtn.classList.add("active");

          // Common acolyte mod names
          const acolyteTerms = [
            "Argon Scope",
            "Maiming Strike",
            "Blood Rush",
            "Weeping Wounds",
            "Catalyzer Link",
            "Hydraulic",
          ];
          searchInput.value = acolyteTerms[0];
          filters.search = acolyteTerms[0].toLowerCase();
        }

        applyFilters();
      });
    });

    // Grid density toggle
    document.querySelectorAll(".density-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const density = btn.dataset.density;

        // Update active state
        document.querySelectorAll(".density-btn").forEach((b) => {
          b.classList.remove("active");
        });
        btn.classList.add("active");

        // Update grid class
        grid.classList.remove("compact", "spacious");
        if (density === "compact") {
          grid.classList.add("compact");
        } else if (density === "spacious") {
          grid.classList.add("spacious");
        }
        // "normal" has no extra class
      });
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
      hideAutocomplete();
      sidebar.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
        cb.checked = false;
      });
      // Clear quick filter buttons
      document.querySelectorAll(".quick-filter-btn").forEach((btn) => {
        btn.classList.remove("active");
      });
      // Clear stat search
      const statSearchInput = $("#stat-search");
      if (statSearchInput) {
        statSearchInput.value = "";
        document
          .querySelectorAll("#filter-stat .checkbox-list label")
          .forEach((label) => {
            label.style.display = "flex";
          });
      }
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
      if (filters.search) {
        const q = filters.search;
        const inName = mod.name.toLowerCase().includes(q);
        const inDesc = (mod.description || "").toLowerCase().includes(q);
        const inStats = (mod.statTypes || []).some((s) =>
          s.toLowerCase().includes(q),
        );
        if (!inName && !inDesc && !inStats) return false;
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
            d.location.toLowerCase().includes(filters.dropSearch),
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
    updateFilterGroupCounts();
    renderActiveChips();
    renderMore();
  }

  function updateFilterGroupCounts() {
    const entries = [
      { id: "count-type", set: filters.types },
      { id: "count-compat", set: filters.compats },
      { id: "count-stat", set: filters.stats },
      { id: "count-rarity", set: filters.rarities },
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

    const addChip = (label, onRemove) => {
      const chip = document.createElement("span");
      chip.className = "filter-chip";
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
      document
        .querySelectorAll(`#${containerId} input[type=checkbox]`)
        .forEach((cb) => {
          if (cb.value === value) cb.checked = false;
        });
    };

    for (const v of filters.types) {
      addChip(v, () => {
        filters.types.delete(v);
        uncheckIn("filter-type", v);
        applyFilters();
      });
    }
    for (const v of filters.compats) {
      addChip(v, () => {
        filters.compats.delete(v);
        uncheckIn("filter-compat", v);
        applyFilters();
      });
    }
    for (const v of filters.stats) {
      addChip(v, () => {
        filters.stats.delete(v);
        uncheckIn("filter-stat", v);
        applyFilters();
      });
    }
    for (const v of filters.rarities) {
      addChip(v, () => {
        filters.rarities.delete(v);
        uncheckIn("filter-rarity", v);
        // Sync quick filter buttons
        const quickBtn = document.querySelector(
          `.quick-filter-btn[data-rarity="${v}"]`,
        );
        if (quickBtn) quickBtn.classList.remove("active");
        applyFilters();
      });
    }
  }

  function sortMods() {
    const [key, dir] = sortKey.split("-");
    const mult = dir === "asc" ? 1 : -1;
    filtered.sort((a, b) => {
      if (key === "name") return mult * a.name.localeCompare(b.name);
      if (key === "drain")
        return mult * ((a.baseDrain || 0) - (b.baseDrain || 0));
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
    card.className = `mod-card rarity-${(mod.rarity || "common").toLowerCase()}`;
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
    const wikiUrl = `https://warframe.fandom.com/wiki/${encodeURIComponent(cleanText(mod.name).replace(/ /g, "_"))}`;

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
      <a href="${wikiUrl}" target="_blank" rel="noopener noreferrer" class="badge badge-polarity" style="text-decoration:none;">📖 Wiki</a>
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
  function cleanText(s) {
    if (!s) return s;
    // Strip out color tags like <DT_PUNCTURE_COLOR> and other markup tags
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
    return s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
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
