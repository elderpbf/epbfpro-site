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
// These prefs are about the FÓRUM only (that is what the popover offers), so they apply
// ONLY to forum_post items. Anything from another source passes straight through — a
// tarefa feedback is addressed to THIS student personally and is not a forum preference
// to opt out of. Without this pass-through the whole feed would be silently swallowed:
// a non-forum item has no `kind`/`mine`, so both branches below reject it.
export function filterByPrefs(items, prefs) {
  const p = prefs || DEFAULT_PREFS;
  if (p.all) return (items || []).slice();
  return (items || []).filter((it) =>
    it.type !== 'forum_post' ||
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
//   turmas   : the OTHER turmas on this device ({ name, client, url, clientSlug, turmaSlug }),
//              the "trocar de turma" list; onForget(clientSlug, turmaSlug) removes a saved one;
//              onMyData opens the read-only "Meus dados" card (track-42)
export function createNotifSettings({ initials, turmaKey, onChange, onLogout, onInstallApp, onMyData, showPrefs = true, turmas = [], onForget, btnClass = 'ph-action-btn' }) {
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

  // "Trocar de turma": the device's other saved turmas (Idea A — lives in this one
  // settings box). Each is a link to enter; the ✕ forgets it (so a dead/old turma can be
  // cleaned out). Hidden entirely when the device only knows this turma.
  const turmasHtml = () => (!turmas || !turmas.length) ? '' :
    '<div class="cdx-ns-turmas">' +
      '<div class="cdx-ns-head">' + escAttr(t('notif.switch_turma')) + '</div>' +
      turmas.map((tt, i) =>
        '<div class="cdx-ns-turma" data-ti="' + i + '">' +
          '<a class="cdx-ns-turma-go" href="' + escAttr(tt.url || '#') + '">' +
            '<span class="cdx-ns-turma-name">' + escAttr(tt.name) + '</span>' +
            (tt.client ? '<span class="cdx-ns-turma-client">' + escAttr(tt.client) + '</span>' : '') +
          '</a>' +
          (onForget ? '<button type="button" class="cdx-ns-turma-x" data-ti="' + i + '" aria-label="' + escAttr(t('notif.forget_turma')) + '">&times;</button>' : '') +
        '</div>').join('') +
    '</div>';

  // The button is just the initials ball (no gear glyph, no pill background — see
  // notif-bell.css). The panel holds the notif prefs (only when showPrefs, i.e. there's
  // a notification source) and the Sair (logout) action at the bottom.
  wrap.innerHTML =
    '<button type="button" class="' + btnClass + ' cdx-ns-btn" aria-label="' + escAttr(t('notif.settings_title')) + '">' +
      '<span class="cdx-ns-initials">' + escAttr(initials || '·') + '</span>' +
    '</button>' +
    '<div class="cdx-ns-panel" hidden role="menu">' +
      (showPrefs
        ? '<div class="cdx-ns-head">' + escAttr(t('notif.settings_title')) + '</div>' +
          '<div class="cdx-ns-opts">' + optsHtml() + '</div>'
        : '') +
      turmasHtml() +
      // "Meus dados" (track-42): read-only, right where the person already is. It goes ABOVE Sair
      // because logging out is the last thing in this panel, not a peer of looking at your data.
      (onMyData ? '<button type="button" class="cdx-ns-mydata">' + escAttr(t('mydata.pill')) + '</button>' : '') +
      (onInstallApp ? '<button type="button" class="cdx-ns-install">' + escAttr(t('install.pill')) + '</button>' : '') +
      (onLogout ? '<button type="button" class="cdx-ns-logout">' + escAttr(t('login.logout')) + '</button>' : '') +
    '</div>';

  const btn = wrap.querySelector('.cdx-ns-btn');
  const panel = wrap.querySelector('.cdx-ns-panel');
  const opts = wrap.querySelector('.cdx-ns-opts');

  function repaintOpts() { if (!opts) return; opts.innerHTML = optsHtml(); bindOpts(); }
  function bindOpts() {
    if (!opts) return;
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

  const installBtn = wrap.querySelector('.cdx-ns-install');
  if (installBtn && onInstallApp) installBtn.addEventListener('click', (e) => { if (e.stopPropagation) e.stopPropagation(); close(); onInstallApp(); });

  const myDataBtn = wrap.querySelector('.cdx-ns-mydata');
  if (myDataBtn && onMyData) myDataBtn.addEventListener('click', (e) => { if (e.stopPropagation) e.stopPropagation(); close(); onMyData(); });

  const logoutBtn = wrap.querySelector('.cdx-ns-logout');
  if (logoutBtn && onLogout) logoutBtn.addEventListener('click', (e) => { if (e.stopPropagation) e.stopPropagation(); close(); onLogout(); });

  // "Trocar de turma": the ✕ forgets a saved turma (removes its row; the link navigates).
  wrap.querySelectorAll('.cdx-ns-turma-x').forEach((x) => {
    x.addEventListener('click', (e) => {
      if (e.stopPropagation) e.stopPropagation();
      if (e.preventDefault) e.preventDefault();
      const tt = turmas[Number(x.getAttribute('data-ti'))];
      if (tt && onForget) onForget(tt.clientSlug, tt.turmaSlug);
      const row = x.closest && x.closest('.cdx-ns-turma');
      if (row && row.parentNode) row.parentNode.removeChild(row);
    });
  });

  return { el: wrap, getPrefs: () => prefs };
}
