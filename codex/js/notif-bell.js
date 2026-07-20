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
import { dismissalFor, DISPENSAVEIS_ENABLED, DISMISS_OPEN, DISMISS_ACT } from './notif-policy.js';
import { esc } from './dom.js';
import { glyphSvg } from './glyphs.js';
import * as notifBus from './notif-bus.js';

// From the shared library. BELL_SVG was byte-for-byte the `bell` key. size:null on both
// because notif-bell.css owns the sizing (19px for the button, 13px for the dismiss).
// The dismiss keeps its 2.4 stroke: it renders at 13px, where the library's 2 goes faint.
const BELL_SVG = glyphSvg('bell', { size: null });
const X_SVG = glyphSvg('close', { size: null, strokeWidth: 2.4 });

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
//   adaptFeed:          (res) => { count, items } (optional; normalize/filter a raw feed —
//                        applied to BOTH a fetched feed and a piggybacked envelope, so the
//                        two can never diverge. The Trilha uses it for the student's prefs.)
//   onNavigate:         (item) => void   (the bell closes + marks seen first)
//   t:                  (key) => string  (labels: notif.title / notif.mark_all / notif.empty
//                                          / notif.dismiss / notif.history / notif.tier_act
//                                          / notif.tier_dismiss)
//   btnClass:           extra class for the button (defaults to the topbar icon button)
//   role:               'student' | 'admin'
export function createBell({ fetchNotifications, markSeen, markAll, dismissItem, adaptFeed, onNavigate, t, btnClass = 'bs-icon-btn', role = 'student' }) {
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
  const histTabs = wrap.querySelector('.cdx-bell-histtabs');
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
        // Clicking an ACIONÁVEL IS one of its two dismissals (Élder 2026-07-19: "o acionável
        // só desaparece se você clicar no × ou clicar nele — aí ele some pro histórico").
        // Same for EVERY acionável, no sub-rule. Same optimistic-then-server order as the ×
        // handler, and deliberately NO refresh: a re-fetch here would race the dismissal
        // write and bring the row straight back. A Dispensável keeps the old path — it has
        // already cleared on tray-open, so the click only marks seen + navigates.
        if (it && _isAct(it) && dismissItem) {
          _histPush('act', it);
          _items = _items.filter((i) => i !== it);
          setBadge(_items.filter((i) => !i.seen).length);
          renderHist();
          Promise.resolve(dismissItem(it)).catch(() => {});
        } else if (markSeen) {
          Promise.resolve(markSeen()).then(refresh).catch(() => {});
        }
        if (onNavigate && it) onNavigate(it);
      });
    });
  }

  function renderHist() {
    const has = _hist.act.length || _hist.open.length;
    hist.hidden = !has;
    if (!has) return;
    // Two mini-tabs ONLY when both tiers can actually produce rows. With Dispensáveis off
    // (notif-policy DISPENSAVEIS_ENABLED) the history is ONE flat list: naming a split the
    // user cannot see is pure chrome (Élder 2026-07-19).
    const split = DISPENSAVEIS_ENABLED && _hist.act.length > 0 && _hist.open.length > 0;
    if (histTabs) histTabs.hidden = !split;
    if (split) wrap.querySelectorAll('.cdx-bell-histtab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-hist') === _histTab));
    const bucket = split ? (_hist[_histTab] || []) : (_hist.act.length ? _hist.act : _hist.open);
    if (!bucket.length) { histList.innerHTML = '<div class="cdx-bell-empty">' + esc(t('notif.empty')) + '</div>'; return; }
    const now = Math.floor(Date.now() / 1000);
    histList.innerHTML = bucket.map((it, i) => {
      const metaBits = [];
      if (it.group) metaBits.push(esc(it.group));
      if (it.meta) metaBits.push(esc(it.meta));
      metaBits.push(esc(relTime(it.created_at, now)));
      return '<a class="cdx-bell-notif cdx-bell-notif--hist" data-bell-h="' + i + '" role="menuitem">' +
          '<span class="cdx-bell-dot"></span>' +
          '<span class="cdx-bell-nbody">' +
            '<span class="cdx-bell-ntext">' + esc(it.title) + '</span>' +
            '<span class="cdx-bell-nmeta">' + metaBits.join(' · ') + '</span>' +
          '</span>' +
        '</a>';
    }).join('');
    // A dismissed notification is still READABLE (Élder 2026-07-19): clicking a history row
    // re-opens the thing — the comunicado's message, the tarefa, the thread. It does NOT
    // re-dismiss and does not move anything: the row is already in the history, it stays.
    histList.querySelectorAll('[data-bell-h]').forEach((a) => {
      a.addEventListener('click', () => {
        const it = bucket[parseInt(a.getAttribute('data-bell-h'), 10)];
        if (!it) return;
        closePanel();
        if (onNavigate) onNavigate(it);
      });
    });
  }

  // Adopt a feed, whatever brought it (our own fetch, or an envelope that rode back on some
  // other call via notif-bus). Filtering the caller applied on its own fetch is re-applied
  // here through adaptFeed, so a piggybacked envelope obeys the same prefs as a fetched one.
  function _adopt(res) {
    const feed = adaptFeed ? adaptFeed(res) : res;
    _items = (feed && feed.items) || [];
    setBadge((feed && feed.count) || _items.filter((i) => !i.seen).length);
    if (!panel.hidden) { paint(_items); renderHist(); }
  }

  async function refresh() {
    let res;
    try { res = await fetchNotifications(); } catch (_) { return; }
    _adopt(res);
  }

  // Opening the tray paints what we already hold (instantly — the student never waits to see
  // the tray), then ASKS THE SERVER (Élder 2026-07-15: "clicar no sino deve checar por novas
  // notificações"). A click on a bell is a request for news; answering it from a cache that
  // last refreshed on some other tab's focus event is how a bell stops being believed.
  //
  // Deliberately outside the notif-bus throttle: the throttle exists to stop PASSIVE refreshes
  // (window focus) from buying a request per tab-flip. An explicit tap is not passive.
  //
  // dismissOnOpen runs AFTER the fetch resolves, not before: it fires markSeen, and clearing
  // the tier against the stale list would race the in-flight fetch — the server would answer
  // with rows still unseen and the badge would pop back up right after the student cleared it.
  function openPanel() {
    panel.hidden = false;
    paint(_items);
    renderHist();
    positionMobile();
    document.addEventListener('click', onOutside, true);
    document.addEventListener('keydown', onEsc);
    Promise.resolve(refresh()).catch(() => {}).then(() => { if (!panel.hidden) dismissOnOpen(); });
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

  // The feed now comes to US: any Worker call the page makes can carry it back (notif-bus).
  // Subscribe first, then seed from whatever the bus already holds — the page's own load call
  // (turmaView / the admin's first fetch) normally lands BEFORE the bell mounts, so the bell
  // paints having spent ZERO requests of its own. Only when nothing has arrived do we buy one.
  const _unsub = notifBus.subscribe(_adopt);
  const _seeded = notifBus.latest();
  if (_seeded) _adopt(_seeded); else refresh();

  // Focus is a FALLBACK now, not the refresh mechanism, and it shares the bus's single
  // throttle window: flipping tabs no longer buys a request per flip (it used to buy one
  // EVERY time), and it still catches the idle case where the page calls nothing at all.
  const onFocus = () => { if (notifBus.shouldAsk()) { notifBus.markAsked(); refresh(); } };
  if (typeof window !== 'undefined') window.addEventListener('focus', onFocus);

  return {
    el: wrap,
    refresh,
    destroy() { _unsub(); if (typeof window !== 'undefined') window.removeEventListener('focus', onFocus); closePanel(); },
  };
}

// Exposed for unit tests.
export { groupItems };
