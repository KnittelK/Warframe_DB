/* Weapons tab */
(function() {
  function renderWeaponsGrid(weapons, containerEl, sidebarEl) {
    // Build sidebar
    const weaponTypes = [...new Set(weapons.map(w => w.type).filter(Boolean))].sort();

    sidebarEl.innerHTML = `
      <div class="filter-group">
        <label class="filter-label">Search</label>
        <input type="search" id="weapon-search" placeholder="Search weapons..." class="filter-subsearch" style="margin-bottom:0">
      </div>
      <div class="filter-group">
        <label class="filter-label">Category</label>
        <div class="checkbox-list">
          ${['Primary','Secondary','Melee'].map(c =>
            `<label><input type="checkbox" class="weapon-cat-cb" value="${c}"> <span>${c}</span></label>`
          ).join('')}
        </div>
      </div>
      <div class="filter-group collapsible collapsed" id="weapon-group-type">
        <button class="filter-group-header" aria-expanded="false">
          <span>Weapon Type</span><span class="toggle-arrow">▾</span>
        </button>
        <div class="filter-group-body">
          <div class="checkbox-list scrollable">
            ${weaponTypes.map(t =>
              `<label><input type="checkbox" class="weapon-type-cb" value="${escAttrComp(t)}"> <span>${escComp(t)}</span></label>`
            ).join('')}
          </div>
        </div>
      </div>
      <div class="filter-group">
        <label class="filter-label">Mastery Req</label>
        <div class="checkbox-list">
          ${[0,3,5,8,10,12,14,16].map(mr =>
            `<label><input type="checkbox" class="weapon-mr-cb" value="${mr}"> <span>MR ${mr}</span></label>`
          ).join('')}
        </div>
      </div>
      <div class="filter-group">
        <label class="filter-label">Tradable</label>
        <label><input type="checkbox" id="weapon-tradable"> <span>Tradable only</span></label>
      </div>
      <button class="btn-clear" id="weapon-clear">Clear Filters</button>
    `;

    const grid = document.createElement('div');
    grid.id = 'weapon-grid';
    grid.className = 'mod-grid';
    containerEl.innerHTML = '';
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = `<span id="weapon-count"></span>
      <div class="toolbar-controls">
        <select id="weapon-sort">
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="damage-desc">Total Damage (High–Low)</option>
          <option value="mr-asc">Mastery Req (Low–High)</option>
          <option value="crit-desc">Crit % (High–Low)</option>
        </select>
      </div>`;
    containerEl.appendChild(toolbar);
    containerEl.appendChild(grid);

    let sortKey = 'name-asc';
    let searchVal = '';
    let selCats = new Set();
    let selTypes = new Set();
    let selMRs = new Set();
    let tradableOnly = false;

    function getFiltered() {
      return weapons.filter(w => {
        if (searchVal && !w.name.toLowerCase().includes(searchVal)) return false;
        if (selCats.size && !selCats.has(w.category)) return false;
        if (selTypes.size && !selTypes.has(w.type)) return false;
        if (selMRs.size && !selMRs.has(String(w.masteryReq || 0))) return false;
        if (tradableOnly && !w.tradable) return false;
        return true;
      });
    }

    function sortWeapons(arr) {
      const [key, dir] = sortKey.split('-');
      const mult = dir === 'asc' ? 1 : -1;
      return [...arr].sort((a, b) => {
        if (key === 'name') return mult * a.name.localeCompare(b.name);
        if (key === 'damage') return mult * ((a.totalDamage || 0) - (b.totalDamage || 0));
        if (key === 'mr') return mult * ((a.masteryReq || 0) - (b.masteryReq || 0));
        if (key === 'crit') return mult * ((a.criticalChance || 0) - (b.criticalChance || 0));
        return 0;
      });
    }

    function render() {
      const data = sortWeapons(getFiltered());
      grid.innerHTML = '';
      for (const w of data) {
        const img = itemImageUrl(w);
        const card = document.createElement('article');
        card.className = `mod-card weapon-card`;
        card.innerHTML = `
          <div class="mod-card-header">
            ${img ? `<img class="mod-card-thumb" src="${escAttrComp(img)}" loading="lazy" alt="">` : '<div class="mod-card-thumb"></div>'}
            <div class="mod-card-title">
              <div class="mod-card-name">${escComp(w.name)}</div>
              <div class="mod-card-type">${escComp(w.type || '')}</div>
            </div>
          </div>
          <div class="mod-card-badges">
            <span class="badge badge-polarity">${escComp(w.category || '')}</span>
            ${(w.masteryReq > 0) ? `<span class="badge badge-drain">MR ${w.masteryReq}</span>` : ''}
            ${w.tradable ? '<span class="badge badge-polarity">Tradable</span>' : ''}
          </div>
          <div class="mod-card-stats">
            ${w.totalDamage ? `DMG ${w.totalDamage}` : ''}
            ${w.criticalChance != null ? `  CRIT ${(w.criticalChance*100).toFixed(0)}%` : ''}
            ${w.procChance != null ? `  STATUS ${(w.procChance*100).toFixed(0)}%` : ''}
          </div>`;
        card.addEventListener('click', () => openModal(w, 'weapon'));
        grid.appendChild(card);
      }
      const countEl = document.getElementById('weapon-count');
      if (countEl) countEl.textContent = `${data.length} weapon${data.length !== 1 ? 's' : ''} found`;
    }

    // Bind sidebar events
    sidebarEl.querySelector('#weapon-search').addEventListener('input', e => {
      searchVal = e.target.value.trim().toLowerCase();
      render();
    });
    sidebarEl.querySelectorAll('.weapon-cat-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selCats.add(cb.value); else selCats.delete(cb.value);
        render();
      });
    });
    sidebarEl.querySelector('#weapon-group-type .filter-group-header').addEventListener('click', function() {
      const group = this.closest('.filter-group');
      const isCollapsed = group.classList.toggle('collapsed');
      this.setAttribute('aria-expanded', String(!isCollapsed));
    });
    sidebarEl.querySelectorAll('.weapon-type-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selTypes.add(cb.value); else selTypes.delete(cb.value);
        render();
      });
    });
    sidebarEl.querySelectorAll('.weapon-mr-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selMRs.add(cb.value); else selMRs.delete(cb.value);
        render();
      });
    });
    sidebarEl.querySelector('#weapon-tradable').addEventListener('change', e => {
      tradableOnly = e.target.checked; render();
    });
    sidebarEl.querySelector('#weapon-clear').addEventListener('click', () => {
      searchVal = ''; selCats.clear(); selTypes.clear(); selMRs.clear(); tradableOnly = false;
      sidebarEl.querySelectorAll('input').forEach(i => { i.value = ''; i.checked = false; });
      render();
    });
    containerEl.querySelector('#weapon-sort').addEventListener('change', e => {
      sortKey = e.target.value; render();
    });

    render();
  }

  function renderWeaponModal(weapon) {
    const img = itemImageUrl(weapon);
    const wikiUrl = `https://warframe.fandom.com/wiki/${encodeURIComponent((weapon.name || '').replace(/ /g, '_'))}`;

    let html = `<div class="modal-header">
      ${img ? `<img src="${escAttrComp(img)}" alt="${escAttrComp(weapon.name)}" class="modal-mod-image">` : ''}
      <div class="modal-header-text">
        <h2>${escComp(weapon.name)}</h2>
        <p class="modal-type">${escComp(weapon.category || '')} — ${escComp(weapon.type || '')}${weapon.masteryReq ? `   MR ${weapon.masteryReq}` : ''}${weapon.tradable ? '   Tradable ✓' : ''}</p>
      </div>
    </div>`;

    // Stats
    html += `<div class="modal-section"><h3>Stats</h3><table class="stat-table"><tbody>`;
    const stats = [
      weapon.totalDamage != null && ['Total Damage', weapon.totalDamage],
      weapon.fireRate != null && ['Fire Rate', weapon.fireRate],
      weapon.criticalChance != null && ['Critical Chance', (weapon.criticalChance*100).toFixed(1)+'%'],
      weapon.criticalMultiplier != null && ['Critical Multiplier', weapon.criticalMultiplier+'×'],
      weapon.procChance != null && ['Status Chance', (weapon.procChance*100).toFixed(1)+'%'],
      weapon.accuracy != null && ['Accuracy', weapon.accuracy],
      weapon.magazineSize != null && ['Magazine', weapon.magazineSize],
      weapon.reloadTime != null && ['Reload', weapon.reloadTime+'s'],
      weapon.trigger && ['Trigger', weapon.trigger],
      weapon.disposition != null && ['Disposition', '●'.repeat(weapon.disposition) + '○'.repeat(5-weapon.disposition)],
    ].filter(Boolean);
    for (const [k, v] of stats) {
      html += `<tr><td>${escComp(k)}</td><td>${escComp(String(v))}</td></tr>`;
    }
    html += '</tbody></table></div>';

    // Build panel
    if (weapon.buildPrice > 0 || (weapon.components && weapon.components.length > 0)) {
      html += `<div class="modal-section"><h3>How to Build</h3>`;
      if (weapon.buildPrice) {
        html += `<p style="margin-bottom:0.5rem;font-size:0.85rem;color:var(--text-muted)">
          Credits: ${weapon.buildPrice.toLocaleString()}
          ${weapon.buildTime ? ` · Build time: ${Math.round(weapon.buildTime/3600)}h` : ''}
          ${weapon.skipBuildTimePrice ? ` · Rush: ${weapon.skipBuildTimePrice}₱` : ''}
        </p>`;
      }
      if (weapon.components && weapon.components.length > 0) {
        html += `<table class="stat-table"><thead><tr><th>Component</th><th>Qty</th><th>Source</th></tr></thead><tbody>`;
        for (const c of weapon.components) {
          const src = (c.drops && c.drops.length > 0)
            ? (() => {
                const best = [...c.drops].sort((a,b) => (b.chance||0)-(a.chance||0))[0];
                const pct = best.chance <= 1 ? (best.chance*100).toFixed(1) : best.chance.toFixed(1);
                return `${escComp(best.location)} (${pct}%)`;
              })()
            : '—';
          html += `<tr><td>${escComp(c.name)}</td><td>${c.itemCount||1}</td><td>${src}</td></tr>`;
        }
        html += '</tbody></table>';
      }
      html += '</div>';
    }

    // Drop locations
    if (weapon.drops && weapon.drops.length > 0) {
      html += `<div class="modal-section"><h3>Drop Locations</h3>${renderDropTable(weapon.drops)}</div>`;
    }

    // Wiki link
    html += `<div class="modal-section">
      <a href="${wikiUrl}" target="_blank" rel="noopener noreferrer" class="badge badge-polarity" style="text-decoration:none;">📖 Wiki</a>
    </div>`;

    // Related mods mount
    html += '<div id="related-mods-mount"></div>';

    return html;
  }

  // Register with tab system
  registerTab('weapons', {
    loader: () => loadData('weapons.json'),
    renderGrid: renderWeaponsGrid,
  });

  // Expose modal renderer globally for app.js dispatch
  window._renderWeaponModal = renderWeaponModal;
})();
