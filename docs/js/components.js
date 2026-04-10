/* components.js — shared UI components */

// ── Drop Table ─────────────────────────────────
function renderDropTable(drops) {
  if (!drops || drops.length === 0) {
    return '<p class="text-muted">No drop data available.</p>';
  }

  function normPct(drop) {
    return drop.chance <= 1 ? drop.chance * 100 : drop.chance;
  }

  function groupFor(drop) {
    // Prefer the structured 'type' field when present
    if (drop.type) {
      const t = drop.type.toLowerCase();
      if (t === 'enemy' || t === 'boss') return 'Enemy';
      if (t === 'relic' || t === 'void fissure') return 'Relic';
      if (t === 'mission' || t === 'bounty' || t === 'rotation') return 'Mission';
    }
    // Fallback: infer from location string
    const loc = (drop.location || '').toLowerCase();
    if (/relic|void fissure/i.test(loc)) return 'Relic';
    if (/rotation|nightmare|sortie|bounty|spy/i.test(loc)) return 'Mission';
    if (/drop|boss|enemy/i.test(loc)) return 'Enemy';
    return 'Mission'; // most drops are mission drops
  }

  function dropContextHtml(drop) {
    if (!drop.planet) return '';
    const parts = [escComp(drop.planet)];
    if (drop.missionType) parts.push(escComp(drop.missionType));
    if (drop.faction) parts.push(escComp(drop.faction));
    if (drop.levelMax > 0) parts.push(`Lv ${drop.levelMin}–${drop.levelMax}`);
    return `<span class="drop-context">${parts.join(' · ')}</span>`;
  }

  const maxPct = Math.max(...drops.map(normPct));
  const groups = {};

  for (const drop of drops) {
    const grp = groupFor(drop);
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(drop);
  }

  const ORDER = ['Mission', 'Relic', 'Enemy', 'Other'];
  let html = '<div class="drop-table">';

  for (const grpName of ORDER) {
    const items = groups[grpName];
    if (!items) continue;
    const collapsed = items.length > 5 ? ' collapsed' : '';
    html += `<div class="drop-group">
      <button class="drop-group-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        ${grpName} <span class="drop-group-count">${items.length}</span> <span>▾</span>
      </button>
      <div class="drop-group-body${collapsed}">`;

    for (const drop of items) {
      const pct = normPct(drop);
      const barW = maxPct > 0 ? (pct / maxPct * 100).toFixed(1) : 0;
      const rarityBadge = drop.rarity
        ? `<span class="badge badge-${drop.rarity.toLowerCase()}">${escComp(drop.rarity)}</span>`
        : '';
      html += `<div class="drop-row">
        <div class="drop-loc-wrap">
          <span class="drop-location">${escComp(drop.location)}</span>
          ${dropContextHtml(drop)}
        </div>
        ${rarityBadge}
        <span class="drop-pct">${pct.toFixed(2)}%</span>
        <div class="drop-bar-track"><div class="drop-bar-fill" style="width:${barW}%"></div></div>
      </div>`;
    }

    html += '</div></div>';
  }

  html += '</div>';
  return html;
}

// ── Item Image URL ─────────────────────────────
function itemImageUrl(item) {
  if (item.imageName) return `https://cdn.warframestat.us/img/${item.imageName}`;
  if (item.wikiaThumbnail) return item.wikiaThumbnail;
  return '';
}

// ── Escape helpers for components ──────────────
function escComp(s) {
  if (!s) return '';
  const d = document.createElement('div');
  d.textContent = String(s).replace(/<[^>]+>/g, '');
  return d.innerHTML;
}

function escAttrComp(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Hover Tooltip ──────────────────────────────
let _tooltipTimer = null;

function showTooltip(chipEl, item, category) {
  if (!window.matchMedia('(hover: hover)').matches) return;
  const tooltip = document.getElementById('hover-tooltip');
  if (!tooltip) return;
  clearTimeout(_tooltipTimer);
  _tooltipTimer = setTimeout(() => {
    tooltip.innerHTML = _renderTooltipContent(item, category);
    _positionTooltip(chipEl);
    tooltip.hidden = false;
  }, 300);
}

function hideTooltip() {
  clearTimeout(_tooltipTimer);
  const tooltip = document.getElementById('hover-tooltip');
  if (tooltip) tooltip.hidden = true;
}

function _positionTooltip(anchor) {
  const tooltip = document.getElementById('hover-tooltip');
  if (!tooltip) return;
  const rect = anchor.getBoundingClientRect();
  const tipW = 280;
  let left = rect.left + window.scrollX;
  let top = rect.top + window.scrollY - 8;

  if (rect.top < 160) top = rect.bottom + window.scrollY + 8;
  if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;

  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
  tooltip.style.transform = rect.top >= 160 ? 'translateY(-100%)' : 'none';
}

function _renderTooltipContent(item, category) {
  if (category === 'weapon') return _renderWeaponTooltip(item);
  if (category === 'warframe') return _renderWarframeTooltip(item);
  return '';
}

function _renderWeaponTooltip(w) {
  const img = itemImageUrl(w);
  return `<div class="tooltip-header">
    ${img ? `<img class="tooltip-img" src="${escAttrComp(img)}" alt="" loading="lazy">` : ''}
    <div>
      <div class="tooltip-name">${escComp(w.name)}</div>
      <div class="tooltip-sub">${escComp(w.category || '')} — ${escComp(w.type || '')}</div>
    </div>
  </div>
  <div class="tooltip-stats">
    <span>DMG <strong>${w.totalDamage ?? '—'}</strong></span>
    <span>CRIT <strong>${w.criticalChance != null ? (w.criticalChance*100).toFixed(0)+'%' : '—'}</strong></span>
    <span>STATUS <strong>${w.procChance != null ? (w.procChance*100).toFixed(0)+'%' : '—'}</strong></span>
    ${w.masteryReq ? `<span>MR <strong>${w.masteryReq}</strong></span>` : ''}
  </div>
  ${w.buildPrice ? `<div class="tooltip-build">${w.buildPrice.toLocaleString()} ₵ · ${Math.round((w.buildTime||0)/3600)}h · ${w.skipBuildTimePrice}₱</div>` : ''}`;
}

function _renderWarframeTooltip(wf) {
  const img = itemImageUrl(wf);
  return `<div class="tooltip-header">
    ${img ? `<img class="tooltip-img" src="${escAttrComp(img)}" alt="" loading="lazy">` : ''}
    <div>
      <div class="tooltip-name">${escComp(wf.name)}</div>
      <div class="tooltip-sub">Warframe${wf.masteryReq ? ' · MR '+wf.masteryReq : ''}</div>
    </div>
  </div>
  <div class="tooltip-stats">
    <span>HP <strong>${wf.health ?? '—'}</strong></span>
    <span>SHD <strong>${wf.shield ?? '—'}</strong></span>
    <span>ARM <strong>${wf.armor ?? '—'}</strong></span>
    <span>NRG <strong>${wf.power ?? '—'}</strong></span>
  </div>
  ${wf.buildPrice ? `<div class="tooltip-build">${wf.buildPrice.toLocaleString()} ₵ · ${Math.round((wf.buildTime||0)/3600)}h · ${wf.skipBuildTimePrice}₱</div>` : ''}`;
}

// ── Related Mods ───────────────────────────────
async function mountRelatedMods(item, category) {
  const mount = document.getElementById('related-mods-mount');
  if (!mount) return;

  const mods = getTabData('mods') || await loadData('mods.json');
  if (!mods) { mount.hidden = true; return; }

  const itemNameUpper = item.name.toUpperCase();

  const augments = mods.filter(m => (m.compatName || '').toUpperCase() === itemNameUpper);
  const stances = (category === 'weapon' && item.type)
    ? mods.filter(m => m.type === 'Stance' && (m.compatName || '').toUpperCase() === item.type.toUpperCase())
    : [];

  const related = [...augments, ...stances];

  const categoryUpper = (category === 'weapon' ? (item.category || '') : 'Warframe').toUpperCase();
  const compatibleCount = mods.filter(m =>
    (m.compatName || '').toUpperCase() === categoryUpper ||
    (m.type || '').toUpperCase() === categoryUpper
  ).length;

  if (related.length === 0 && compatibleCount === 0) {
    mount.hidden = true;
    return;
  }

  let html = '<div class="modal-section"><h3>Related Mods</h3>';

  if (related.length > 0) {
    html += '<div class="related-mods-grid">';
    for (const mod of related) {
      const img = itemImageUrl(mod);
      const rarityClass = (mod.rarity || 'common').toLowerCase();
      html += `<button class="related-mod-card rarity-${rarityClass}"
          data-nav-item="${escAttrComp(mod.name)}"
          data-nav-category="mod">
        ${img ? `<img src="${escAttrComp(img)}" alt="" loading="lazy" class="related-mod-img">` : ''}
        <span class="related-mod-name">${escComp(mod.name)}</span>
        <span class="badge badge-${rarityClass}">${escComp(mod.rarity)}</span>
      </button>`;
    }
    html += '</div>';
  }

  if (compatibleCount > 0) {
    const label = category === 'weapon' ? (item.category || 'Weapon') : 'Warframe';
    html += `<button class="btn-browse-mods"
        data-filter-tab="mods"
        data-filter-field="compatName"
        data-filter-value="${escAttrComp(item.name)}">
      Browse ${compatibleCount} compatible ${label} mods →
    </button>`;
  }

  html += '</div>';
  mount.outerHTML = html;
}
