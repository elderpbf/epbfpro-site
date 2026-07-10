// codex/js/notif-bell.js
// Reusable notification bell (button + corner badge + grouped dropdown). One
// component, two surfaces: the Codex topbar (teacher, cross-turma) and the Trilha
// header (student, scoped). It is SOURCE-AGNOSTIC: the caller injects a fetch, a
// mark-seen (bell-open), an optional mark-all + dismiss-one, a navigate handler and a
// t() for labels, so the bell never hardcodes a facade (the "always reusable" rule).
// Notification items are the generic shape { type, title, meta, deeplink, seen,
// created_at, notif_key?, kind?, group? }.
//
// Two tiers (notif-policy.js dismissalFor): ACT (Acionáveis) rows carry a dismiss ×
// and persist past open (dismissed one at a time via the injected dismissItem); OPEN
// (Dispensáveis) rows clear on open via markSeen. The badge decays to the ACT count
// after open. A collapsed "Histórico" holds what was already cleared this session,
// split into two named mini-tabs. Refresh policy: on creation + every window focus.
import { relTime } from './rel-time.js';
import { dismissalFor, DISMISS_OPEN, DISMISS_ACT } from './notif-policy.js';
import { esc } from './dom.js';

const BELL_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
const X_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

// Group items by their `group` label (teacher cross-turma). Items with no group
// fall into a single null bucket (student, single turma) rendered without a header.
function groupItems(items) {
  const order = [];
  const map = new Map();
  for (const it of items) {
    const key = it.group || '';
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(it);
  }
  return order.map((k) => ({ label: k, items: map.get(k) }));
}

// createBell(opts) -> { el, refresh, destroy }
//   fetchNotifications: () => Promise<{ count, items }>
//   markSeen:           () => Promise<any>   (bell-open: clears the OPEN/Dispensáveis tier)
//   markAll:            () => Promise<any>   (optional; "marcar tudo": clears everything)
//   dismissItem:        (item) => Promise<any> (optional; dismiss ONE ACT/Acionável)
//   onNavigate:         (item) => void   (the bell closes + marks seen first)
//   t:                  (key) => string  (labels: notif.title / notif.mark_all / notif.empty
//                                          / notif.dismiss / notif.history / notif.tier_act
//                                          / notif.tier_dismiss)
//   btnClass:           extra class for the button (defaults to the topbar icon button)
//   role:               'student' | 'admin'
export function createBell({ fetchNotifications, markSeen, markAll, dismissItem, onNavigate, t, btnClass = 'bs-icon-btn', role = 'student' }) {
  const wrap = document.createElement('div');
  wrap.className = 'cdx-bell-wrap';
  wrap.innerHTML =
    '<button type="button" class="' + btnClass + ' cdx-bell-btn" aria-label="' + esc(t('notif.title')) + '">' + BELL_SVG + '</button>' +
    '<span class="cdx-bell-badge" hidden>0</span>' +
    '<div class="cdx-bell-panel" hidden role="menu">' +
      '<div class="cdx-bell-head">' +
        '<span class="cdx-bell-title">' + esc(t('notif.title')) + '</span>' +
        '<button type="button" class="cdx-bell-mark">' + esc(t('notif.mark_all')) + '</button>' +
      '</div>' +
      '<div class="cdx-bell-list"></div>' +
      '<div class="cdx-bell-hist" hidden>' +
        '<button type="button" class="cdx-bell-histtoggle" aria-expanded="false">' +
          '<span>' + esc(t('notif.history')) + '</span><span class="cdx-bell-histchev">▾</span>' +
        '</button>' +
        '<div class="cdx-bell-histbody" hidden>' +
          '<div class="cdx-bell-histtabs">' +
            '<button type="button" class="cdx-bell-histtab active" data-hist="act">' + esc(t('notif.tier_act')) + '</button>' +
            '<button type="button" class="cdx-bell-histtab" data-hist="open">' + esc(t('notif.tier_dismiss')) + '</button>' +
          '</div>' +
          '<div class="cdx-bell-histlist"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  const btn = wrap.querySelector('.cdx-bell-btn');
  const badge = wrap.querySelector('.cdx-bell-badge');
  const panel = wrap.querySelector('.cdx-bell-panel');
  const list = wrap.querySelector('.cdx-bell-list');
  const markBtn = wrap.querySelector('.cdx-bell-mark');
  const hist = wrap.querySelector('.cdx-bell-hist');
  const histToggle = wrap.querySelector('.cdx-bell-histtoggle');
  const histBody = wrap.querySelector('.cdx-bell-histbody');
  const histList = wrap.querySelector('.cdx-bell-histlist');

  // Session-local history of already-cleared items, split by tier (no backend history
  // endpoint yet; resets on reload). Newest first, capped so the tray never bloats.
  const HIST_CAP = 40;
  const _hist = { act: [], open: [] };
  let _histTab = 'act';
  let _items = [];

  function _isAct(it) { return dismissalFor(it, role) === DISMISS_ACT; }
  function _histPush(tier, it) {
    const key = it.notif_key || (it.type + ':' + it.created_at + ':' + (it.title || ''));
    const bucket = _hist[tier];
    if (bucket.some((h) => (h.notif_key || (h.type + ':' + h.created_at + ':' + (h.title || ''))) === key)) return;
    bucket.unshift({ ...it, _clearedAt: Math.floor(Date.now() / 1000) });
    if (bucket.length > HIST_CAP) bucket.length = HIST_CAP;
  }

  function setBadge(n) {
    if (n > 0) { badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = false; }
    else badge.hidden = true;
  }

  function _rowHTML(it, idx, now) {
    const metaBits = [];
    if (it.meta) metaBits.push(esc(it.meta));
    metaBits.push(esc(relTime(it.created_at, now)));
    const act = _isAct(it);
    const xBtn = (act && dismissItem)
      ? '<button type="button" class="cdx-bell-dismiss" data-bell-x="' + idx + '" aria-label="' + esc(t('notif.dismiss')) + '" title="' + esc(t('notif.dismiss')) + '">' + X_SVG + '</button>'
      : '';
    return '<a class="cdx-bell-notif' + (it.seen ? '' : ' cdx-bell-notif--unread') + (act ? ' cdx-bell-notif--act' : '') + '" data-bell-i="' + idx + '" role="menuitem">' +
        '<span class="cdx-bell-dot"></span>' +
        '<span class="cdx-bell-nbody">' +
          '<span class="cdx-bell-ntext">' + esc(it.title) + '</span>' +
          '<span class="cdx-bell-nmeta">' + metaBits.join(' · ') + '</span>' +
        '</span>' +
        xBtn +
      '</a>';
  }

  function paint(items) {
    if (!items.length) {
      list.innerHTML = '<div class="cdx-bell-empty">' + esc(t('notif.empty')) + '</div>';
    } else {
      const now = Math.floor(Date.now() / 1000);
      let html = '';
      for (const grp of groupItems(items)) {
        if (grp.label) html += '<div class="cdx-bell-group"><span>' + esc(grp.label) + '</span><span class="cdx-bell-gcount">' + grp.items.length + '</span></div>';
        grp.items.forEach((it) => { html += _rowHTML(it, items.indexOf(it), now); });
      }
      list.innerHTML = html;
    }
    list.querySelectorAll('[data-bell-x]').forEach((x) => {
      x.addEventListener('click', (e) => {
        if (e.stopPropagation) e.stopPropagation();
        if (e.preventDefault) e.preventDefault();
        const it = items[parseInt(x.getAttribute('data-bell-x'), 10)];
        if (!it) return;
        _histPush('act', it);
        _items = _items.filter((i) => i !== it);
        setBadge(_items.filter((i) => !i.seen).length);
        paint(_items);
        renderHist();
        if (dismissItem) Promise.resolve(dismissItem(it)).catch(() => {});
      });
    });
    list.querySelectorAll('[data-bell-i]').forEach((a) => {
      a.addEventListener('click', () => {
        const it = items[parseInt(a.getAttribute('data-bell-i'), 10)];
        closePanel();
        if (markSeen) Promise.resolve(markSeen()).then(refresh).catch(() => {});
        if (onNavigate && it) onNavigate(it);
      });
    });
  }

  function renderHist() {
    const has = _hist.act.length || _hist.open.length;
    hist.hidden = !has;
    if (!has) return;
    wrap.querySelectorAll('.cdx-bell-histtab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-hist') === _histTab));
    const bucket = _hist[_histTab] || [];
    if (!bucket.length) { histList.innerHTML = '<div class="cdx-bell-empty">' + esc(t('notif.empty')) + '</div>'; return; }
    const now = Math.floor(Date.now() / 1000);
    histList.innerHTML = bucket.map((it) => {
      const metaBits = [];
      if (it.group) metaBits.push(esc(it.group));
      if (it.meta) metaBits.push(esc(it.meta));
      metaBits.push(esc(relTime(it.created_at, now)));
      return '<div class="cdx-bell-notif cdx-bell-notif--hist">' +
          '<span class="cdx-bell-dot"></span>' +
          '<span class="cdx-bell-nbody">' +
            '<span class="cdx-bell-ntext">' + esc(it.title) + '</span>' +
            '<span class="cdx-bell-nmeta">' + metaBits.join(' · ') + '</span>' +
          '</span>' +
        '</div>';
    }).join('');
  }

  async function refresh() {
    let res;
    try { res = await fetchNotifications(); } catch (_) { return; }
    _items = (res && res.items) || [];
    setBadge((res && res.count) || _items.filter((i) => !i.seen).length);
    if (!panel.hidden) { paint(_items); renderHist(); }
  }

  function openPanel() {
    panel.hidden = false;
    paint(_items);
    renderHist();
    positionMobile();
    dismissOnOpen();
    document.addEventListener('click', onOutside, true);
    document.addEventListener('keydown', onEsc);
  }
  // On a narrow viewport the panel is a viewport-pinned tray (css/notif-bell.css sets
  // position:fixed + 12px gutters); anchor its TOP just under the bell so it clears the
  // header regardless of header height. Desktop clears the inline top so CSS owns it.
  function positionMobile() {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (window.matchMedia('(max-width: 560px)').matches) {
      panel.style.top = (btn.getBoundingClientRect().bottom + 8) + 'px';
    } else {
      panel.style.top = '';
    }
  }
  // Opening the tray clears the OPEN/Dispensáveis tier: those rows keep their highlight
  // for THIS viewing (we only flag them seen locally, no repaint), drop into the history,
  // and the badge decays to the remaining ACT/Acionáveis count. markSeen persists the
  // glance watermark server-side. ACT rows are untouched (dismissed one at a time via ×).
  function dismissOnOpen() {
    const openItems = _items.filter((it) => !it.seen && dismissalFor(it, role) === DISMISS_OPEN);
    if (!openItems.length) return;
    const remaining = _items.filter((it) => !it.seen && dismissalFor(it, role) !== DISMISS_OPEN).length;
    setBadge(remaining);
    if (markSeen) Promise.resolve(markSeen()).catch(() => {});
    openItems.forEach((it) => { it.seen = true; _histPush('open', it); });
    renderHist();
  }
  function closePanel() { panel.hidden = true; document.removeEventListener('click', onOutside, true); document.removeEventListener('keydown', onEsc); }
  function onOutside(e) { if (!wrap.contains(e.target)) closePanel(); }
  function onEsc(e) { if (e.key === 'Escape') closePanel(); }

  btn.addEventListener('click', (e) => { if (e.stopPropagation) e.stopPropagation(); if (panel.hidden) openPanel(); else closePanel(); });
  // "Marcar tudo": clears BOTH tiers (markAll when the caller wired the scoped clear-all,
  // else falls back to markSeen). Everything currently pending drops into history.
  markBtn.addEventListener('click', () => {
    const clearAll = markAll || markSeen;
    _items.filter((i) => !i.seen).forEach((it) => _histPush(_isAct(it) ? 'act' : 'open', it));
    if (clearAll) Promise.resolve(clearAll()).then(() => { _items = _items.map((i) => ({ ...i, seen: true })); setBadge(0); paint(_items); renderHist(); }).catch(() => {});
  });

  histToggle.addEventListener('click', () => {
    const open = histBody.hidden;
    histBody.hidden = !open;
    histToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    wrap.querySelector('.cdx-bell-histchev').textContent = open ? '▴' : '▾';
    if (open) renderHist();
  });
  wrap.querySelectorAll('.cdx-bell-histtab').forEach((b) => {
    b.addEventListener('click', () => { _histTab = b.getAttribute('data-hist'); renderHist(); });
  });

  const onFocus = () => refresh();
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);

  refresh();
  return {
    el: wrap,
    refresh,
    destroy() { if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus); closePanel(); },
  };
}

// Exposed for unit tests.
export { groupItems };
