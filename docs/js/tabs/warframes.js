/* Warframes tab */
(function() {
  function renderWarframesGrid(warframes, containerEl, sidebarEl) {
    sidebarEl.innerHTML = `
      <div class="filter-group">
        <label class="filter-label">Search</label>
        <input type="search" id="wf-search" placeholder="Search warframes..." class="filter-subsearch" style="margin-bottom:0">
      </div>
      <div class="filter-group">
        <label class="filter-label">Mastery Req</label>
        <div class="checkbox-list">
          ${[0,3,5,8,10,12,14,16].map(mr =>
            `<label><input type="checkbox" class="wf-mr-cb" value="${mr}"> <span>MR ${mr}</span></label>`
          ).join('')}
        </div>
      </div>
      <div class="filter-group">
        <label class="filter-label">Tradable</label>
        <label><input type="checkbox" id="wf-tradable"> <span>Tradable only</span></label>
      </div>
      <button class="btn-clear" id="wf-clear">Clear Filters</button>
    `;

    const grid = document.createElement('div');
    grid.id = 'wf-grid';
    grid.className = 'mod-grid';
    containerEl.innerHTML = '';
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = `<span id="wf-count"></span>
      <div class="toolbar-controls">
        <select id="wf-sort">
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="mr-asc">Mastery Req (Low–High)</option>
          <option value="health-desc">Health (High–Low)</option>
        </select>
      </div>`;
    containerEl.appendChild(toolbar);
    containerEl.appendChild(grid);

    let sortKey = 'name-asc';
    let searchVal = '';
    let selMRs = new Set();
    let tradableOnly = false;

    function getFiltered() {
      return warframes.filter(wf => {
        if (searchVal && !wf.name.toLowerCase().includes(searchVal)) return false;
        if (selMRs.size && !selMRs.has(String(wf.masteryReq || 0))) return false;
        if (tradableOnly && !wf.tradable) return false;
        return true;
      });
    }

    function sortWF(arr) {
      const [key, dir] = sortKey.split('-');
      const mult = dir === 'asc' ? 1 : -1;
      return [...arr].sort((a, b) => {
        if (key === 'name') return mult * a.name.localeCompare(b.name);
        if (key === 'mr') return mult * ((a.masteryReq || 0) - (b.masteryReq || 0));
        if (key === 'health') return mult * ((a.health || 0) - (b.health || 0));
        return 0;
      });
    }

    function render() {
      const data = sortWF(getFiltered());
      grid.innerHTML = '';
      for (const wf of data) {
        const img = itemImageUrl(wf);
        const card = document.createElement('article');
        card.className = 'mod-card warframe-card';
        card.innerHTML = `
          <div class="mod-card-header">
            ${img ? `<img class="mod-card-thumb" src="${escAttrComp(img)}" loading="lazy" alt="">` : '<div class="mod-card-thumb"></div>'}
            <div class="mod-card-title">
              <div class="mod-card-name">${escComp(wf.name)}</div>
              <div class="mod-card-type">Warframe</div>
            </div>
          </div>
          <div class="mod-card-badges">
            ${wf.masteryReq > 0 ? `<span class="badge badge-drain">MR ${wf.masteryReq}</span>` : ''}
            ${wf.tradable ? '<span class="badge badge-polarity">Tradable</span>' : ''}
          </div>
          <div class="mod-card-stats">
            HP ${wf.health || '—'}  SHD ${wf.shield || '—'}  ARM ${wf.armor || '—'}
          </div>`;
        card.addEventListener('click', () => openModal(wf, 'warframe'));
        grid.appendChild(card);
      }
      const countEl = document.getElementById('wf-count');
      if (countEl) countEl.textContent = `${data.length} warframe${data.length !== 1 ? 's' : ''} found`;
    }

    sidebarEl.querySelector('#wf-search').addEventListener('input', e => {
      searchVal = e.target.value.trim().toLowerCase(); render();
    });
    sidebarEl.querySelectorAll('.wf-mr-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        if (cb.checked) selMRs.add(cb.value); else selMRs.delete(cb.value);
        render();
      });
    });
    sidebarEl.querySelector('#wf-tradable').addEventListener('change', e => {
      tradableOnly = e.target.checked; render();
    });
    sidebarEl.querySelector('#wf-clear').addEventListener('click', () => {
      searchVal = ''; selMRs.clear(); tradableOnly = false;
      sidebarEl.querySelectorAll('input').forEach(i => { i.value = ''; i.checked = false; });
      render();
    });
    containerEl.querySelector('#wf-sort').addEventListener('change', e => {
      sortKey = e.target.value; render();
    });

    render();
  }

  function renderWarframeModal(warframe) {
    const img = itemImageUrl(warframe);
    const wikiUrl = `https://warframe.fandom.com/wiki/${encodeURIComponent((warframe.name || '').replace(/ /g, '_'))}`;

    let html = `<div class="modal-header">
      ${img ? `<img src="${escAttrComp(img)}" alt="${escAttrComp(warframe.name)}" class="modal-mod-image">` : ''}
      <div class="modal-header-text">
        <h2>${escComp(warframe.name)}</h2>
        <p class="modal-type">${warframe.masteryReq ? `MR ${warframe.masteryReq}` : ''}${warframe.tradable ? '   Tradable ✓' : ''}</p>
      </div>
    </div>`;

    // Base stats
    html += `<div class="modal-section"><h3>Base Stats</h3><table class="stat-table"><tbody>`;
    const stats = [
      ['Health', warframe.health],
      ['Shield', warframe.shield],
      ['Armor', warframe.armor],
      ['Energy', warframe.power],
      ['Sprint Speed', warframe.sprintSpeed],
    ].filter(([,v]) => v != null);
    for (const [k, v] of stats) {
      html += `<tr><td>${k}</td><td>${v}</td></tr>`;
    }
    html += '</tbody></table></div>';

    // Abilities
    if (warframe.abilities && warframe.abilities.length > 0) {
      html += `<div class="modal-section"><h3>Abilities</h3>`;
      if (warframe.passiveDescription) {
        html += `<p style="margin-bottom:0.75rem;font-size:0.85rem;color:var(--text-muted)"><strong>Passive:</strong> ${escComp(warframe.passiveDescription)}</p>`;
      }
      html += '<div class="abilities-grid">';
      for (const ability of warframe.abilities) {
        html += `<div class="ability-card">
          <div class="ability-name">${escComp(ability.name)}</div>
          <div class="ability-desc">${escComp(ability.description || '')}</div>
        </div>`;
      }
      html += '</div></div>';
    }

    // Build panel
    if (warframe.buildPrice > 0 || (warframe.components && warframe.components.length > 0)) {
      html += `<div class="modal-section"><h3>How to Build</h3>`;
      if (warframe.buildPrice) {
        html += `<p style="margin-bottom:0.5rem;font-size:0.85rem;color:var(--text-muted)">
          Credits: ${warframe.buildPrice.toLocaleString()}
          ${warframe.buildTime ? ` · Build time: ${Math.round(warframe.buildTime/3600)}h` : ''}
          ${warframe.skipBuildTimePrice ? ` · Rush: ${warframe.skipBuildTimePrice}₱` : ''}
        </p>`;
      }
      if (warframe.components && warframe.components.length > 0) {
        html += `<table class="stat-table"><thead><tr><th>Component</th><th>Qty</th><th>Source</th></tr></thead><tbody>`;
        for (const c of warframe.components) {
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

    // Wiki link
    html += `<div class="modal-section">
      <a href="${wikiUrl}" target="_blank" rel="noopener noreferrer" class="badge badge-polarity" style="text-decoration:none;">📖 Wiki</a>
    </div>`;

    html += '<div id="related-mods-mount"></div>';
    return html;
  }

  registerTab('warframes', {
    loader: () => loadData('warframes.json'),
    renderGrid: renderWarframesGrid,
  });

  window._renderWarframeModal = renderWarframeModal;
})();
