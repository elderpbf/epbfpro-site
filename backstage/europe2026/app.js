/* Europe 2026 — Italy trip builder.
   All site content is rendered from window.ITALY_DATA (data.js), which is the
   researched + fact-checked dataset. Nothing here invents site facts. */
(function () {
  'use strict';
  const DATA = window.ITALY_DATA || { sites: [], transport: {} };
  const SITES = DATA.sites || [];
  const TRANSPORT = DATA.transport || {};
  const DAY_HOURS = 8; // a realistic sightseeing day

  // ---- cluster model (travel/sequencing heuristics, shown transparently) ----
  const CLUSTERS = [
    { key: 'rome',   label: 'Rome — the city core',           color: '#b23a2e', kind: 'base',     intraHopH: 0.4,
      note: 'Home base. Sights are walkable or a short metro/bus hop apart.' },
    { key: 'ostia',  label: 'Ostia Antica — day trip from Rome', color: '#c8843a', kind: 'daytrip', intraHopH: 0, returnTravelH: 1.0,
      note: 'Day trip on the Roma-Lido line, about 30 min each way.' },
    { key: 'tivoli', label: 'Tivoli — day trip from Rome',     color: '#9c6b3f', kind: 'daytrip',  intraHopH: 0.5, returnTravelH: 1.6,
      note: 'Day trip ~45-60 min each way by regional train, plus a local bus between the two villas.' },
    { key: 'naples', label: 'Bay of Naples — relocate base',   color: '#2e7d4f', kind: 'relocate', intraHopH: 0.6, transferH: 1.5,
      note: 'Best done by moving your base to Naples (Rome-Naples high-speed ~1h10). Sites sit along the Circumvesuviana line.' },
    { key: 'sicily', label: 'Sicily — fly down',               color: '#7a5ea8', kind: 'fly',      intraHopH: 2.0, transferH: 4.0,
      note: 'A flight to Catania or Palermo (~1h20). Sites are far apart, so a hire car is effectively required.' },
    { key: 'north',  label: 'Northern Italy',                  color: '#3a6ea5', kind: 'far',      intraHopH: 3.0, transferH: 3.1,
      note: 'Verona is ~3h from Rome by fast train; Aquileia and Aosta are 6-7h away and far from each other.' },
  ];
  const REGION_TO_CLUSTER = {
    'Rome core': 'rome', 'Rome day trip': 'ostia', 'Tivoli day trip': 'tivoli',
    'Bay of Naples': 'naples', 'Sicily': 'sicily', 'Northern Italy': 'north',
  };
  const clusterMap = {};
  CLUSTERS.forEach((c) => (clusterMap[c.key] = c));
  const clusterOf = (s) => clusterMap[REGION_TO_CLUSTER[s.region] || 'rome'];

  // ---- helpers ----
  const $ = (sel, el) => (el || document).querySelector(sel);
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function parseMoney(s) {
    if (!s) return 0;
    if (/free/i.test(s) && !/€|\d/.test(s)) return 0;
    const t = String(s).replace(/,/g, '');
    let m = t.match(/€\s?(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
    m = t.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : 0;
  }
  const fmtH = (h) => (Math.round(h * 10) / 10).toString().replace(/\.0$/, '') + 'h';

  // ---- state ----
  const selected = new Set();
  let lastPlan = { days: [] };
  let map = null;
  const markers = {};
  let routeLine = null;

  // =====================================================================
  // PLAN ENGINE
  // =====================================================================
  function computePlan(sites, daysAvailable) {
    const byKey = {};
    sites.forEach((s) => {
      const k = clusterOf(s).key;
      (byKey[k] = byKey[k] || []).push(s);
    });
    const days = [];
    CLUSTERS.forEach((cl) => {
      const list = byKey[cl.key];
      if (!list || !list.length) return;
      let cur = null;
      const openDay = (travelH) => {
        cur = { cluster: cl, items: [], hours: 0, visitH: 0, travelH: 0, transferNote: null };
        if (travelH) { cur.hours += travelH; cur.travelH += travelH; cur.transferNote = cl.note; }
        days.push(cur);
      };
      if (cl.kind === 'base') {
        list.forEach((s) => {
          const v = s.visitDurationHours || 2;
          const hop = cur && cur.items.length ? cl.intraHopH : 0;
          if (!cur || cur.hours + hop + v > DAY_HOURS) openDay(0);
          else { cur.hours += hop; cur.travelH += hop; }
          cur.items.push(s); cur.hours += v; cur.visitH += v;
        });
      } else {
        const firstTravel = cl.kind === 'daytrip' ? cl.returnTravelH : cl.transferH;
        const contTravel = cl.kind === 'daytrip' ? cl.returnTravelH : 0; // a 2nd day-trip day re-incurs the round trip
        list.forEach((s) => {
          const v = s.visitDurationHours || 2;
          if (!cur) openDay(firstTravel);
          else {
            const hop = cl.intraHopH;
            if (cur.hours + hop + v > DAY_HOURS) openDay(contTravel);
            else { cur.hours += hop; cur.travelH += hop; }
          }
          cur.items.push(s); cur.hours += v; cur.visitH += v;
        });
      }
    });
    const totalVisit = days.reduce((a, d) => a + d.visitH, 0);
    const totalTravel = days.reduce((a, d) => a + d.travelH, 0);
    const ticketCost = sites.reduce((a, s) => a + parseMoney(s.price && s.price.adult), 0);
    return { days, daysNeeded: days.length, totalVisit, totalTravel, ticketCost, overBudget: days.length > daysAvailable };
  }

  // =====================================================================
  // RENDER: cards
  // =====================================================================
  function badge(conf) {
    const c = (conf || 'unknown').toLowerCase();
    const txt = c === 'high' ? 'verified' : c === 'medium' ? 'mostly verified' : c === 'low' ? 'low confidence' : 'unchecked';
    return `<span class="badge ${esc(c)}" title="Fact-check confidence">${txt}</span>`;
  }
  function cardDetail(s) {
    const v = s.verified || {};
    const tips = (s.tips || []).map((t) => `<li>${esc(t)}</li>`).join('');
    const srcs = (s.sources || []).map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc((x.supports || x.url).slice(0, 60))}</a>`).join(' · ');
    const issues = (v.issues || []).length ? `<div class="vernote"><b>Fact-check notes:</b> ${v.issues.map(esc).join(' ')}</div>` : '';
    const ph = s.photo || {};
    const credit = ph.attribution
      ? `<div class="credit">📷 ${esc(ph.description || '')} — ${esc(ph.attribution)}${ph.license ? ', ' + esc(ph.license) : ''}${ph.sourcePageUrl ? ' (<a href="' + esc(ph.sourcePageUrl) + '" target="_blank" rel="noopener">Wikimedia</a>)' : ''}</div>`
      : '';
    return `
      <div class="sc-detail" hidden>
        <h5>About</h5><div>${esc(s.fullDesc || '')}</div>
        <h5>Getting there</h5><div>${esc(s.howToGetThere || '')} ${s.howToSourceUrl ? '<a href="' + esc(s.howToSourceUrl) + '" target="_blank" rel="noopener">source</a>' : ''}</div>
        ${s.openingNotes ? '<h5>Opening &amp; booking</h5><div>' + esc(s.openingNotes) + '</div>' : ''}
        <h5>Cost</h5><div>${esc((s.price && s.price.adult) || '')}${s.price && s.price.note ? '. ' + esc(s.price.note) : ''} ${s.price && s.price.sourceUrl ? '<a href="' + esc(s.price.sourceUrl) + '" target="_blank" rel="noopener">source</a>' : ''}</div>
        ${tips ? '<h5>Tips</h5><ul>' + tips + '</ul>' : ''}
        ${issues}
        <h5>Fact-check</h5><div>${esc(v.verdict || '')}</div>
        ${srcs ? '<h5>Sources</h5><div class="srclist">' + srcs + '</div>' : ''}
        ${credit}
      </div>`;
  }
  function cardHTML(s) {
    const ph = s.photo || {};
    const price = (s.price && s.price.adult) || '';
    const free = /^\s*free/i.test(price);
    const img = ph.imageUrl
      ? `<img class="sc-thumb" loading="lazy" src="${esc(ph.imageUrl)}" alt="${esc(ph.description || s.name)}" onerror="this.style.visibility='hidden'">`
      : `<div class="sc-thumb"></div>`;
    return `
      <article class="site-card" data-id="${esc(s.id)}">
        <input type="checkbox" class="sc-toggle" aria-label="Add ${esc(s.name)} to trip">
        ${img}
        <div class="sc-main">
          <div class="sc-top">
            <h4 class="sc-title">${esc(s.name)}</h4>
            <span class="price${free ? ' free' : ''}">${esc(price || '—')}</span>
          </div>
          <div class="sc-meta">
            <span>⏱ ${fmtH(s.visitDurationHours || 2)} visit</span>
            ${badge(s.verified && s.verified.confidence)}
            ${s.officialUrl ? '<a href="' + esc(s.officialUrl) + '" target="_blank" rel="noopener" style="color:var(--terra)">official ↗</a>' : ''}
          </div>
          <p class="sc-short">${esc(s.shortDesc || '')}</p>
          <button class="sc-more" type="button">Details ▾</button>
          ${cardDetail(s)}
        </div>
      </article>`;
  }
  function renderCards() {
    const root = $('#italy-cards');
    let html = '';
    CLUSTERS.forEach((cl) => {
      const list = SITES.filter((s) => clusterOf(s).key === cl.key);
      if (!list.length) return;
      html += `
        <div class="group" data-cluster="${cl.key}">
          <div class="group-head">
            <span class="group-dot" style="background:${cl.color}"></span>
            <h3>${esc(cl.label)}</h3>
            <span class="gcount">${list.length} site${list.length > 1 ? 's' : ''}</span>
            <span class="gactions">
              <button class="glink" data-gsel="${cl.key}">select all</button>
              <button class="glink" data-gclr="${cl.key}">clear</button>
            </span>
          </div>
          ${list.map(cardHTML).join('')}
        </div>`;
    });
    root.innerHTML = html;

    // wire each card
    root.querySelectorAll('.site-card').forEach((card) => {
      const id = card.dataset.id;
      const cb = $('.sc-toggle', card);
      cb.addEventListener('change', () => setSel(id, cb.checked, true));
      $('.sc-title', card).addEventListener('click', () => { cb.checked = !cb.checked; setSel(id, cb.checked, true); });
      $('.sc-thumb', card).addEventListener('click', () => { cb.checked = !cb.checked; setSel(id, cb.checked, true); });
      const more = $('.sc-more', card);
      const det = $('.sc-detail', card);
      more.addEventListener('click', () => {
        const open = det.hasAttribute('hidden');
        if (open) { det.removeAttribute('hidden'); more.textContent = 'Hide details ▴'; }
        else { det.setAttribute('hidden', ''); more.textContent = 'Details ▾'; }
      });
    });
    root.querySelectorAll('[data-gsel]').forEach((b) => b.addEventListener('click', () => {
      SITES.filter((s) => clusterOf(s).key === b.dataset.gsel).forEach((s) => selected.add(s.id));
      syncAll(); recompute();
    }));
    root.querySelectorAll('[data-gclr]').forEach((b) => b.addEventListener('click', () => {
      SITES.filter((s) => clusterOf(s).key === b.dataset.gclr).forEach((s) => selected.delete(s.id));
      syncAll(); recompute();
    }));
  }

  // =====================================================================
  // RENDER: transport reference
  // =====================================================================
  function renderTransport() {
    const root = $('#transport-ref');
    const air = (TRANSPORT.airports || []).map((a) =>
      `<div class="tr-card"><b>${esc(a.name)}${a.code ? ' (' + esc(a.code) + ')' : ''}</b><br>${esc(a.serves || a.notes || '')} ${a.sourceUrl ? '<a href="' + esc(a.sourceUrl) + '" target="_blank" rel="noopener">↗</a>' : ''}</div>`).join('');
    const pass = (TRANSPORT.passes || []).map((p) =>
      `<div class="tr-card"><b>${esc(p.name)}${p.price ? ' — ' + esc(p.price) : ''}</b><br>${esc(p.covers || '')} ${p.sourceUrl ? '<a href="' + esc(p.sourceUrl) + '" target="_blank" rel="noopener">↗</a>' : ''}</div>`).join('');
    const legs = (TRANSPORT.legs || []).map((l) =>
      `<tr><td>${esc(l.from)} → ${esc(l.to)}</td><td>${esc(l.mode)}</td><td>${l.durationHours ? '~' + esc(l.durationHours) + 'h' : ''}</td><td>${esc(l.cost || '')} ${l.sourceUrl ? '<a href="' + esc(l.sourceUrl) + '" target="_blank" rel="noopener">↗</a>' : ''}</td></tr>`).join('');
    root.innerHTML = `
      <h3>Getting around Italy — airports, passes & key connections</h3>
      <div style="margin-bottom:14px"><strong style="font-size:13px;color:var(--ink)">Arrival airports</strong><div class="tr-grid" style="margin-top:8px">${air}</div></div>
      <div style="margin-bottom:14px"><strong style="font-size:13px;color:var(--ink)">City passes</strong><div class="tr-grid" style="margin-top:8px">${pass}</div></div>
      <div><strong style="font-size:13px;color:var(--ink)">Key legs that connect the regions</strong>
        <table class="legtbl"><tbody>${legs}</tbody></table></div>`;
  }

  // =====================================================================
  // RENDER: summary + day plan
  // =====================================================================
  function daysAvailable() {
    const v = parseInt($('#days-input').value, 10);
    return isNaN(v) || v < 1 ? 1 : v;
  }
  function dayLabel(i) {
    const v = $('#start-input').value;
    if (!v) return 'Day ' + (i + 1);
    const d = new Date(v + 'T00:00:00');
    if (isNaN(d.getTime())) return 'Day ' + (i + 1);
    d.setDate(d.getDate() + i);
    return 'Day ' + (i + 1) + ' · ' + d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function renderSummary(plan, avail) {
    const total = plan.totalVisit + plan.totalTravel;
    const fitClass = selected.size === 0 ? '' : plan.overBudget ? 'over' : 'fit';
    $('#bar-stats').innerHTML = `
      <div class="stat"><div class="n">${selected.size}</div><div class="l">selected</div></div>
      <div class="stat ${fitClass}"><div class="n">${plan.daysNeeded} / ${avail}</div><div class="l">days needed</div></div>
      <div class="stat"><div class="n">${fmtH(total)}</div><div class="l">visit + travel</div></div>
      <div class="stat"><div class="n">€${Math.round(plan.ticketCost)}</div><div class="l">est. tickets</div></div>`;
  }
  function renderDayPlan(plan, avail) {
    const root = $('#dayplan');
    if (selected.size === 0) {
      root.innerHTML = `<h3>Your day-by-day plan</h3><p class="dp-empty">Select sites (or use a quick-fill preset) and the plan builds itself here.</p>`;
      return;
    }
    let banner;
    if (plan.overBudget) {
      banner = `<div class="dp-warn">⚠ This selection needs about ${plan.daysNeeded} days, but you have ${avail}. Drop a region, or add days.</div>`;
    } else {
      banner = `<div class="dp-ok">✓ Fits in ${plan.daysNeeded} of your ${avail} day${avail > 1 ? 's' : ''}${avail > plan.daysNeeded ? ' (' + (avail - plan.daysNeeded) + ' spare)' : ''}.</div>`;
    }
    const rows = plan.days.map((d, i) => {
      const items = d.items.map((s) => `<li>${esc(s.name)} <span style="opacity:.7">(${fmtH(s.visitDurationHours || 2)})</span></li>`).join('');
      return `
        <div class="day-row">
          <div class="dr-head"><span class="dr-num" style="color:${d.cluster.color}">${esc(dayLabel(i))}</span><span class="dr-h">${fmtH(d.hours)} · ${esc(d.cluster.label.split('—')[0].trim())}</span></div>
          ${d.transferNote ? '<div class="dr-transfer">↳ ' + esc(d.transferNote) + '</div>' : ''}
          <ul>${items}</ul>
        </div>`;
    }).join('');
    root.innerHTML = `<h3>Your day-by-day plan</h3>
      <p class="dp-note">Estimate at ${DAY_HOURS}h of sightseeing per day, including local travel and the moves between regions.</p>
      ${banner}${rows}`;
  }

  // =====================================================================
  // MAP
  // =====================================================================
  function initMap() {
    map = L.map('map', { scrollWheelZoom: false }).setView([41.9, 12.6], 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    SITES.forEach((s) => {
      if (!s.coords) return;
      const cl = clusterOf(s);
      const m = L.circleMarker([s.coords.lat, s.coords.lng], { radius: 5, color: cl.color, weight: 1.5, fillColor: cl.color, fillOpacity: 0.3 });
      m.bindTooltip(s.name, { direction: 'top' });
      m.on('click', () => { const on = !selected.has(s.id); setSel(s.id, on, true); });
      m.addTo(map);
      markers[s.id] = m;
    });
    updateMap();
  }
  function updateMap() {
    if (!map) return;
    SITES.forEach((s) => {
      const m = markers[s.id]; if (!m) return;
      const sel = selected.has(s.id); const cl = clusterOf(s);
      m.setStyle({ radius: sel ? 9 : 5, weight: sel ? 3 : 1.5, fillOpacity: sel ? 0.95 : 0.3, color: cl.color, fillColor: cl.color });
    });
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    const order = lastPlan.days.reduce((a, d) => a.concat(d.items), []).filter((s) => s.coords);
    const pts = order.map((s) => [s.coords.lat, s.coords.lng]);
    if (pts.length >= 2) routeLine = L.polyline(pts, { color: '#8a2c22', weight: 2, dashArray: '5,7', opacity: 0.8 }).addTo(map);
    if (pts.length) { try { map.fitBounds(L.latLngBounds(pts).pad(0.35)); } catch (e) {} }
  }

  // =====================================================================
  // GLUE
  // =====================================================================
  function setSel(id, on, refresh) {
    if (on) selected.add(id); else selected.delete(id);
    syncCard(id);
    if (refresh) recompute();
  }
  function syncCard(id) {
    const card = document.querySelector('.site-card[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!card) return;
    const on = selected.has(id);
    card.classList.toggle('sel', on);
    const cb = $('.sc-toggle', card); if (cb) cb.checked = on;
  }
  function syncAll() { SITES.forEach((s) => syncCard(s.id)); }
  function recompute() {
    const avail = daysAvailable();
    lastPlan = computePlan(SITES.filter((s) => selected.has(s.id)), avail);
    renderSummary(lastPlan, avail);
    renderDayPlan(lastPlan, avail);
    updateMap();
  }

  const PRESETS = {
    rome: SITES.filter((s) => s.region === 'Rome core').map((s) => s.id),
    romenaples: ['colosseum', 'pantheon', 'capitoline', 'trajan', 'pompeii', 'herculaneum', 'mann'],
    all: SITES.map((s) => s.id),
  };
  function applyPreset(name) {
    selected.clear();
    (PRESETS[name] || []).forEach((id) => { if (SITES.some((s) => s.id === id)) selected.add(id); });
    if (name === 'romenaples') $('#days-input').value = 5;
    if (name === 'rome') $('#days-input').value = 4;
    syncAll(); recompute();
  }

  function bindControls() {
    $('#days-input').addEventListener('input', recompute);
    $('#start-input').addEventListener('change', recompute);
    $('#clear-btn').addEventListener('click', () => { selected.clear(); syncAll(); recompute(); });
    document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      const id = t.dataset.tab;
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + id));
      if (id === 'italy' && map) setTimeout(() => map.invalidateSize(), 60);
    }));
  }

  function boot() {
    if (!SITES.length) { $('#italy-cards').innerHTML = '<p style="color:#b23a2e">Site data failed to load (data.js).</p>'; return; }
    renderCards();
    renderTransport();
    bindControls();
    if (window.L) initMap();
    recompute();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
