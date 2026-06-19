// codex/js/notif-bell.js
// Reusable notification bell (button + corner badge + grouped dropdown). One
// component, two surfaces: the Codex topbar (teacher, cross-turma) and the Trilha
// header (student, scoped). It is SOURCE-AGNOSTIC: the caller injects a fetch and a
// mark-seen callback plus a navigate handler and a t() for labels, so the bell never
// hardcodes a facade (the "always reusable" rule). Notification items are the generic
// shape { type, title, meta, deeplink, seen, created_at, group? }.
//
// Refresh policy: on creation, and on every window focus (cheap; no aggressive
// polling). The badge sits in the top-right CORNER of the button (mock sino, S2).
import { relTime } from './rel-time.js';

const BELL_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
//   markSeen:           () => Promise<any>
//   onNavigate:         (item) => void   (the bell closes + marks seen first)
//   t:                  (key) => string  (labels: notif.title / notif.mark_all / notif.empty)
//   btnClass:           extra class for the button (defaults to the topbar icon button)
export function createBell({ fetchNotifications, markSeen, onNavigate, t, btnClass = 'bs-icon-btn' }) {
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
    '</div>';
  const btn = wrap.querySelector('.cdx-bell-btn');
  const badge = wrap.querySelector('.cdx-bell-badge');
  const panel = wrap.querySelector('.cdx-bell-panel');
  const list = wrap.querySelector('.cdx-bell-list');
  const markBtn = wrap.querySelector('.cdx-bell-mark');

  function setBadge(n) {
    if (n > 0) { badge.textContent = n > 99 ? '99+' : String(n); badge.hidden = false; }
    else badge.hidden = true;
  }

  function paint(items) {
    if (!items.length) {
      list.innerHTML = '<div class="cdx-bell-empty">' + esc(t('notif.empty')) + '</div>';
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    let html = '';
    for (const grp of groupItems(items)) {
      if (grp.label) html += '<div class="cdx-bell-group"><span>' + esc(grp.label) + '</span><span class="cdx-bell-gcount">' + grp.items.length + '</span></div>';
      grp.items.forEach((it, i) => {
        const idx = items.indexOf(it);
        const metaBits = [];
        if (it.meta) metaBits.push(esc(it.meta));
        metaBits.push(esc(relTime(it.created_at, now)));
        html += '<a class="cdx-bell-notif' + (it.seen ? '' : ' cdx-bell-notif--unread') + '" data-bell-i="' + idx + '" role="menuitem">' +
            '<span class="cdx-bell-dot"></span>' +
            '<span class="cdx-bell-nbody">' +
              '<span class="cdx-bell-ntext">' + esc(it.title) + '</span>' +
              '<span class="cdx-bell-nmeta">' + metaBits.join(' · ') + '</span>' +
            '</span>' +
          '</a>';
      });
    }
    list.innerHTML = html;
    list.querySelectorAll('[data-bell-i]').forEach((a) => {
      a.addEventListener('click', () => {
        const it = items[parseInt(a.getAttribute('data-bell-i'), 10)];
        closePanel();
        if (markSeen) Promise.resolve(markSeen()).then(refresh).catch(() => {});
        if (onNavigate && it) onNavigate(it);
      });
    });
  }

  let _items = [];
  async function refresh() {
    let res;
    try { res = await fetchNotifications(); } catch (_) { return; }
    _items = (res && res.items) || [];
    setBadge((res && res.count) || _items.filter((i) => !i.seen).length);
    if (!panel.hidden) paint(_items);
  }

  function openPanel() { panel.hidden = false; paint(_items); document.addEventListener('click', onOutside, true); }
  function closePanel() { panel.hidden = true; document.removeEventListener('click', onOutside, true); }
  function onOutside(e) { if (!wrap.contains(e.target)) closePanel(); }

  btn.addEventListener('click', (e) => { if (e.stopPropagation) e.stopPropagation(); if (panel.hidden) openPanel(); else closePanel(); });
  markBtn.addEventListener('click', () => {
    if (markSeen) Promise.resolve(markSeen()).then(() => { _items = _items.map((i) => ({ ...i, seen: true })); setBadge(0); paint(_items); }).catch(() => {});
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
