/* Arcanes tab */
(function() {
  function maxRankEffect(arcane) {
    const ls = arcane.levelStats;
    if (!Array.isArray(ls) || ls.length === 0) return '';
    const last = ls[ls.length - 1];
    const stats = last.stats || [];
    return stats[0] ? String(stats[0]).replace(/<[^>]+>/g, '') : '';
  }

  function renderArcanesGrid(arcanes, containerEl, sidebarEl) {
    const types = [...new Set(arcanes.map(a => a.type).filter(Boolean))].sort();
    const rarities = [...new Set(arcanes.map(a => a.rarity).filter(Boolean))];

    sidebarEl.innerHTML = `
      <div class="filter-group">
        <label class="filter-label">Search</label>
        <input type="search" id="arcane-search" placeholder="Search arcanes..." class="filter-subsearch" style="margin-bottom:0">
      </div>
      <div class="filter-group">
        <label class="filter-label">Type</label>
        <div class="checkbox-list scrollable">
          ${types.map(t => `<label><input type="checkbox" class="arcane-type-cb" value="${escAttrComp(t)}"> <span>${escComp(t)}</span></label>`).join('')}
        </div>
      </div>
      <div class="filter-group">
        <label class="filter-label">Rarity</label>
        <div class="checkbox-list">
          ${rarities.map(r => `<label><input type="checkbox" class="arcane-rarity-cb" value="${escAttrComp(r)}"> <span>${escComp(r)}</span></label>`).join('')}
        </div>
      </div>
      <div class="filter-group">
        <label class="filter-label">Tradable</label>
        <label><input type="checkbox" id="arcane-tradable"> <span>Tradable only</span></label>
      </div>
      <button class="btn-clear" id="arcane-clear">Clear Filters</button>
    `;

    const grid = document.createElement('div');
    grid.className = 'mod-grid';
    containerEl.innerHTML = '';
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = `<span id="arcane-count"></span>
      <div class="toolbar-controls">
        <select id="arcane-sort">
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
        </select>
      </div>`;
    containerEl.appendChild(toolbar);
    containerEl.appendChild(grid);

    let sortKey = 'name-asc';
    let searchVal = '';
    let selTypes = new Set();
    let selRarities = new Set();
    let tradableOnly = false;

    function getFiltered() {
      return arcanes.filter(a => {
        if (searchVal && !a.name.toLowerCase().includes(searchVal)) return false;
        if (selTypes.size && !selTypes.has(a.type)) return false;
        if (selRarities.size && !selRarities.has(a.rarity)) return false;
        if (tradableOnly && !a.tradable) return false;
        return true;
      });
    }

    function sortArcanes(arr) {
      const [key, dir] = sortKey.split('-');
      const mult = dir === 'asc' ? 1 : -1;
      return [...arr].sort((a, b) => {
        if (key === 'name') return mult * a.name.localeCompare(b.name);
        return 0;
      });
    }

    function render() {
      const data = sortArcanes(getFiltered());
      grid.innerHTML = '';
      for (const arcane of data) {
        const img = itemImageUrl(arcane);
        const rarityClass = (arcane.rarity || 'common').toLowerCase();
        const effect = maxRankEffect(arcane);
        const card = document.createElement('article');
        card.className = `mod-card arcane-card rarity-${rarityClass}`;
        card.innerHTML = `
          <div class="mod-card-header">
            ${img ? `<img class="mod-card-thumb" src="${escAttrComp(img)}" loading="lazy" alt="">` : '<div class="mod-card-thumb"></div>'}
            <div class="mod-card-title">
              <div class="mod-card-name">${escComp(arcane.name)}</div>
              <div class="mod-card-type">${escComp(arcane.type || '')}</div>
            </div>
          </div>
          <div class="mod-card-badges">
            <span class="badge badge-${rarityClass}">${escComp(arcane.rarity || '')}</span>
            ${arcane.tradable ? '<span class="badge badge-polarity">Tradable</span>' : ''}
          </div>
          ${effect ? `<div class="mod-card-stats">${escComp(effect)}</div>` : ''}`;
        card.addEventListener('click', () => openModal(arcane, 'arcane'));
        grid.appendChild(card);
      }
      const countEl = document.getElementById('arcane-count');
      if (countEl) countEl.textContent = `${data.length} arcane${data.length !== 1 ? 's' : ''} found`;
    }

    sidebarEl.querySelector('#arcane-search').addEventListener('input', e => {
      searchVal = e.target.value.trim().toLowerCase(); render();
    });
    sidebarEl.querySelectorAll('.arcane-type-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selTypes.add(cb.value); else selTypes.delete(cb.value);
        render();
      });
    });
    sidebarEl.querySelectorAll('.arcane-rarity-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selRarities.add(cb.value); else selRarities.delete(cb.value);
        render();
      });
    });
    sidebarEl.querySelector('#arcane-tradable').addEventListener('change', e => {
      tradableOnly = e.target.checked; render();
    });
    sidebarEl.querySelector('#arcane-clear').addEventListener('click', () => {
      searchVal = ''; selTypes.clear(); selRarities.clear(); tradableOnly = false;
      sidebarEl.querySelectorAll('input').forEach(i => { i.value = ''; i.checked = false; });
      render();
    });
    containerEl.querySelector('#arcane-sort').addEventListener('change', e => {
      sortKey = e.target.value; render();
    });

    render();
  }

  function renderArcaneModal(arcane) {
    const img = itemImageUrl(arcane);
    const rarityClass = (arcane.rarity || 'common').toLowerCase();
    const wikiUrl = `https://warframe.fandom.com/wiki/${encodeURIComponent((arcane.name || '').replace(/ /g, '_'))}`;

    let html = `<div class="modal-header">
      ${img ? `<img src="${escAttrComp(img)}" alt="${escAttrComp(arcane.name)}" class="modal-mod-image">` : ''}
      <div class="modal-header-text">
        <h2>${escComp(arcane.name)}</h2>
        <p class="modal-type">${escComp(arcane.type || '')}   <span class="badge badge-${rarityClass}">${escComp(arcane.rarity || '')}</span>${arcane.tradable ? '   Tradable ✓' : ''}</p>
      </div>
    </div>`;

    // Rank progression
    if (Array.isArray(arcane.levelStats) && arcane.levelStats.length > 0) {
      html += `<div class="modal-section"><h3>Rank Progression</h3><table class="stat-table"><thead><tr><th>Rank</th><th>Effect</th></tr></thead><tbody>`;
      arcane.levelStats.forEach((level, i) => {
        const stats = (level.stats || []).join(', ').replace(/<[^>]+>/g, '');
        html += `<tr><td>${i}</td><td>${escComp(stats)}</td></tr>`;
      });
      html += '</tbody></table></div>';
    }

    // Drops
    if (arcane.drops && arcane.drops.length > 0) {
      html += `<div class="modal-section"><h3>Drop Locations</h3>${renderDropTable(arcane.drops)}</div>`;
    }

    html += `<div class="modal-section">
      <a href="${wikiUrl}" target="_blank" rel="noopener noreferrer" class="badge badge-polarity" style="text-decoration:none;">📖 Wiki</a>
    </div>`;

    return html;
  }

  registerTab('arcanes', {
    loader: () => loadData('arcanes.json'),
    renderGrid: renderArcanesGrid,
  });

  window._renderArcaneModal = renderArcaneModal;
})();
