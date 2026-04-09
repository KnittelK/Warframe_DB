/* Relics tab */
(function() {
  function renderRelicsGrid(relics, containerEl, sidebarEl) {
    sidebarEl.innerHTML = `
      <div class="filter-group">
        <label class="filter-label">Search</label>
        <input type="search" id="relic-search" placeholder="Relic name or reward..." class="filter-subsearch" style="margin-bottom:0">
      </div>
      <div class="filter-group">
        <label class="filter-label">Tier</label>
        <div class="checkbox-list">
          ${['Lith','Meso','Neo','Axi'].map(t => `<label><input type="checkbox" class="relic-tier-cb" value="${t}"> <span>${t}</span></label>`).join('')}
        </div>
      </div>
      <div class="filter-group">
        <label class="filter-label">Refinement</label>
        <div class="checkbox-list">
          ${['Intact','Exceptional','Flawless','Radiant'].map(r => `<label><input type="checkbox" class="relic-ref-cb" value="${r}"> <span>${r}</span></label>`).join('')}
        </div>
      </div>
      <div class="filter-group">
        <label class="filter-label">Vaulted</label>
        <label><input type="checkbox" id="relic-vaulted"> <span>Show vaulted</span></label>
      </div>
      <button class="btn-clear" id="relic-clear">Clear Filters</button>
    `;

    const grid = document.createElement('div');
    grid.className = 'mod-grid';
    containerEl.innerHTML = '';
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = `<span id="relic-count"></span>
      <div class="toolbar-controls">
        <select id="relic-sort">
          <option value="name-asc">Name A–Z</option>
          <option value="tier-asc">Tier (Lith → Axi)</option>
        </select>
      </div>`;
    containerEl.appendChild(toolbar);
    containerEl.appendChild(grid);

    let sortKey = 'name-asc';
    let searchVal = '';
    let selTiers = new Set();
    let selRefs = new Set();
    let showVaulted = false;

    const TIER_ORDER = { Lith: 0, Meso: 1, Neo: 2, Axi: 3 };

    function getFiltered() {
      return relics.filter(r => {
        if (!showVaulted && r.vaulted) return false;
        if (selTiers.size && !selTiers.has(r.tier)) return false;
        if (selRefs.size && !selRefs.has(r.refinement)) return false;
        if (searchVal) {
          const nameMatch = `${r.tier} ${r.relicName}`.toLowerCase().includes(searchVal);
          const rewardMatch = (r.rewards || []).some(rew => (rew.itemName || '').toLowerCase().includes(searchVal));
          if (!nameMatch && !rewardMatch) return false;
        }
        return true;
      });
    }

    function sortRelics(arr) {
      return [...arr].sort((a, b) => {
        if (sortKey === 'tier-asc') {
          const td = (TIER_ORDER[a.tier] || 0) - (TIER_ORDER[b.tier] || 0);
          if (td !== 0) return td;
        }
        return `${a.tier} ${a.relicName}`.localeCompare(`${b.tier} ${b.relicName}`);
      });
    }

    function render() {
      const data = sortRelics(getFiltered());
      grid.innerHTML = '';
      for (const relic of data) {
        const tierLow = (relic.tier || '').toLowerCase();
        const rareReward = (relic.rewards || []).find(r => r.rarity === 'Rare');
        const card = document.createElement('article');
        card.className = 'mod-card relic-card';
        card.innerHTML = `
          <div class="mod-card-header">
            <div class="relic-tier-badge tier-${tierLow}">${escComp(relic.tier || '')}</div>
            <div class="mod-card-title">
              <div class="mod-card-name">${escComp(relic.tier + ' ' + relic.relicName + ' ' + (relic.refinement || ''))}</div>
              <div class="mod-card-type">${relic.vaulted ? '⚠ Vaulted' : 'Available'}</div>
            </div>
          </div>
          <div class="mod-card-stats">
            Rare: ${escComp(rareReward ? rareReward.itemName : '—')}
          </div>`;
        card.addEventListener('click', () => openModal(relic, 'relic'));
        grid.appendChild(card);
      }
      const countEl = document.getElementById('relic-count');
      if (countEl) countEl.textContent = `${data.length} relic${data.length !== 1 ? 's' : ''} found`;
    }

    sidebarEl.querySelector('#relic-search').addEventListener('input', e => {
      searchVal = e.target.value.trim().toLowerCase(); render();
    });
    sidebarEl.querySelectorAll('.relic-tier-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selTiers.add(cb.value); else selTiers.delete(cb.value);
        render();
      });
    });
    sidebarEl.querySelectorAll('.relic-ref-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selRefs.add(cb.value); else selRefs.delete(cb.value);
        render();
      });
    });
    sidebarEl.querySelector('#relic-vaulted').addEventListener('change', e => {
      showVaulted = e.target.checked; render();
    });
    sidebarEl.querySelector('#relic-clear').addEventListener('click', () => {
      searchVal = ''; selTiers.clear(); selRefs.clear(); showVaulted = false;
      sidebarEl.querySelectorAll('input').forEach(i => { i.value = ''; i.checked = false; });
      render();
    });
    containerEl.querySelector('#relic-sort').addEventListener('change', e => {
      sortKey = e.target.value; render();
    });

    render();
  }

  function renderRelicModal(relic) {
    const rewards = relic.rewards || [];
    const maxChance = rewards.length > 0 ? Math.max(...rewards.map(r => r.chance || 0)) : 1;

    let html = `<div class="modal-header">
      <div class="relic-tier-badge tier-${(relic.tier||'').toLowerCase()}">${escComp(relic.tier||'')}</div>
      <div class="modal-header-text">
        <h2>${escComp(relic.tier + ' ' + relic.relicName)}</h2>
        <p class="modal-type">${escComp(relic.refinement || '')}   ${relic.vaulted ? '<span style="color:var(--rare)">⚠ Vaulted — no longer obtainable</span>' : 'Currently available'}</p>
      </div>
    </div>`;

    if (rewards.length > 0) {
      html += `<div class="modal-section"><h3>Rewards</h3><div class="drop-table">`;
      for (const r of rewards) {
        const pct = (r.chance || 0).toFixed(2);
        const barW = maxChance > 0 ? ((r.chance || 0) / maxChance * 100).toFixed(1) : 0;
        const rarityClass = (r.rarity || 'common').toLowerCase();
        html += `<div class="drop-row">
          <button class="cross-link" data-nav-item="${escAttrComp(r.itemName)}" data-nav-category="weapon">
            ${escComp(r.itemName)} ↗
          </button>
          <span class="badge badge-${rarityClass}">${escComp(r.rarity || '')}</span>
          <span class="drop-pct">${pct}%</span>
          <div class="drop-bar-track"><div class="drop-bar-fill" style="width:${barW}%"></div></div>
        </div>`;
      }
      html += '</div></div>';
    }

    return html;
  }

  registerTab('relics', {
    loader: () => loadData('relics.json'),
    renderGrid: renderRelicsGrid,
  });

  window._renderRelicModal = renderRelicModal;
})();
