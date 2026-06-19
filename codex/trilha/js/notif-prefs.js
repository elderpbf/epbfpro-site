// codex/trilha/js/notif-prefs.js
// Student notification preferences for the Trilha: WHICH forum events raise the
// bell. Three choices today — replies in the student's own threads, brand-new
// topics, or everything — persisted per turma in localStorage. The settings button
// (student initials + a gear) opens a small popover with the toggles. The CATEGORIES
// list + the matching rule in filterByPrefs() are the single extension point: adding
// a future notification source means one entry here and one branch below.
//
// filterByPrefs() is pure (unit-tested); the popover DOM is verified visually.
import { t } from '../i18n.js';

const KEY = (turmaKey) => 'cdx_notif_prefs_' + (turmaKey || '');
export const DEFAULT_PREFS = { replies: true, topics: true, all: false };

export function getPrefs(turmaKey) {
  try {
    const raw = localStorage.getItem(KEY(turmaKey));
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch (_) { /* fall through to defaults */ }
  return { ...DEFAULT_PREFS };
}

export function setPrefs(turmaKey, prefs) {
  try { localStorage.setItem(KEY(turmaKey), JSON.stringify(prefs)); } catch (_) { /* best effort */ }
}

// Pure: keep only the notification items the prefs allow. 'all' supersedes the rest.
//   replies → a reply in a thread the student takes part in (item.mine + kind 'reply')
//   topics  → a brand-new conversation (kind 'new_thread')
export function filterByPrefs(items, prefs) {
  const p = prefs || DEFAULT_PREFS;
  if (p.all) return (items || []).slice();
  return (items || []).filter((it) =>
    (p.replies && it.mine && it.kind === 'reply') ||
    (p.topics && it.kind === 'new_thread')
  );
}

// Notification categories in display order. EXTENSION POINT: a new source adds an
// entry here + a branch in filterByPrefs(). 'all' is the catch-all and, when on,
// disables the finer toggles (they're subsumed).
const CATEGORIES = [
  { key: 'replies', labelKey: 'notif.opt_replies' },
  { key: 'topics',  labelKey: 'notif.opt_topics' },
  { key: 'all',     labelKey: 'notif.opt_all' },
];

const GEAR_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';

function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// createNotifSettings -> { el } : the initials+gear button plus its preferences popover.
//   initials : the student's avatar initials
//   turmaKey : storage scope (client/turma)
//   onChange : called after a toggle, with the new prefs (so the bell re-filters)
export function createNotifSettings({ initials, turmaKey, onChange, btnClass = 'ph-action-btn' }) {
  const wrap = document.createElement('div');
  wrap.className = 'cdx-ns-wrap';

  let prefs = getPrefs(turmaKey);

  const optsHtml = () => CATEGORIES.map((c) => {
    const disabled = c.key !== 'all' && prefs.all;
    return '<label class="cdx-ns-opt' + (disabled ? ' cdx-ns-opt--off' : '') + '">' +
      '<input type="checkbox" data-ns="' + c.key + '"' + (prefs[c.key] ? ' checked' : '') + (disabled ? ' disabled' : '') + '>' +
      '<span>' + escAttr(t(c.labelKey)) + '</span>' +
    '</label>';
  }).join('');

  wrap.innerHTML =
    '<button type="button" class="' + btnClass + ' cdx-ns-btn" aria-label="' + escAttr(t('notif.settings_title')) + '">' +
      '<span class="cdx-ns-initials">' + escAttr(initials || '·') + '</span>' +
      '<span class="cdx-ns-gear">' + GEAR_SVG + '</span>' +
    '</button>' +
    '<div class="cdx-ns-panel" hidden role="menu">' +
      '<div class="cdx-ns-head">' + escAttr(t('notif.settings_title')) + '</div>' +
      '<div class="cdx-ns-opts">' + optsHtml() + '</div>' +
    '</div>';

  const btn = wrap.querySelector('.cdx-ns-btn');
  const panel = wrap.querySelector('.cdx-ns-panel');
  const opts = wrap.querySelector('.cdx-ns-opts');

  function repaintOpts() { opts.innerHTML = optsHtml(); bindOpts(); }
  function bindOpts() {
    opts.querySelectorAll('input[data-ns]').forEach((cb) => {
      cb.addEventListener('change', () => {
        prefs = { ...prefs, [cb.getAttribute('data-ns')]: cb.checked };
        setPrefs(turmaKey, prefs);
        repaintOpts();                 // reflect the all-disables-others state
        if (onChange) onChange(prefs);
      });
    });
  }
  bindOpts();

  function open() { panel.hidden = false; document.addEventListener('click', onOutside, true); }
  function close() { panel.hidden = true; document.removeEventListener('click', onOutside, true); }
  function onOutside(e) { if (!wrap.contains(e.target)) close(); }
  btn.addEventListener('click', (e) => { if (e.stopPropagation) e.stopPropagation(); if (panel.hidden) open(); else close(); });

  return { el: wrap, getPrefs: () => prefs };
}
