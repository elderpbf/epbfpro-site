// questions/sessions.js
// Codex Questions -> Sessions sub-tab (native, host/admin). Lists sessions and
// runs their lifecycle: create, close, reopen. Live hosting itself is the Q2
// surface; until then "Host" is a bridge LINK to the legacy standalone host page
// (a plain navigation link, never an iframe/embed). All data through the facade;
// strings through t(); user-facing errors through the shared notice system.
import { questions as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';

let _viewEl = null;
let _cleanup = [];

// Bridge to the standalone legacy host for a session. Temporary until the native
// live host lands (Q2). A plain navigation link, never an iframe.
export function hostHref(code) {
  return '/backstage/classpulse/host.html?code=' + encodeURIComponent(code || '');
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function _on(el, evt, fn) {
  if (!el) return;
  el.addEventListener(evt, fn);
  _cleanup.push(() => el.removeEventListener(evt, fn));
}

function _fmtDate(iso) {
  if (!iso) return '';
  const d = String(iso).slice(0, 10).split('-');
  return d.length === 3 ? (d[2] + '/' + d[1] + '/' + d[0]) : '';
}

function _row(s) {
  const open = s.status === 'open';
  const statusKey = open ? 'questions.sessions_status_open' : 'questions.sessions_status_closed';
  const lifecycle = open
    ? '<button class="cdx-btn cdx-btn--danger" data-act="close" data-code="' + _esc(s.code) + '" type="button">' + t('questions.sessions_close') + '</button>'
    : '<button class="cdx-btn" data-act="reopen" data-code="' + _esc(s.code) + '" type="button">' + t('questions.sessions_reopen') + '</button>';
  return '<div class="cdx-session' + (open ? ' cdx-session--open' : '') + '">' +
    '<div class="cdx-session-main">' +
      '<div class="cdx-session-title">' + _esc(s.title || s.code) + '</div>' +
      '<div class="cdx-session-meta">' +
        '<span class="cdx-session-code">' + _esc(s.code) + '</span>' +
        '<span class="cdx-session-status cdx-session-status--' + (open ? 'open' : 'closed') + '">' + t(statusKey) + '</span>' +
        '<span class="cdx-session-date">' + _fmtDate(s.created_at) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="cdx-session-actions">' +
      '<a class="cdx-btn cdx-btn--ghost" href="' + hostHref(s.code) + '">' + t('questions.sessions_host') + '</a>' +
      lifecycle +
    '</div>' +
  '</div>';
}

async function _load(listEl) {
  listEl.innerHTML = '<div class="cdx-sessions-loading">' + t('questions.sessions_loading') + '</div>';
  let res;
  try { res = await api.listSessions(); } catch (e) { notice.internal(e); res = null; }
  if (!_viewEl || listEl !== _viewEl.querySelector('#cdx-sessions-list')) return; // unmounted/changed
  const sessions = (res && res.sessions) || [];
  listEl.innerHTML = sessions.length
    ? sessions.map(_row).join('')
    : '<div class="cdx-sessions-empty">' + t('questions.sessions_empty') + '</div>';
}

export function mount(viewEl, ctx) {
  _viewEl = viewEl;
  viewEl.innerHTML =
    '<div class="cdx-sessions">' +
      '<form class="cdx-sessions-create" id="cdx-sessions-create">' +
        '<input class="cdx-input" id="cdx-sessions-title" type="text" maxlength="120" placeholder="' + _esc(t('questions.sessions_new_title')) + '">' +
        '<button class="cdx-btn" type="submit">' + t('questions.sessions_create') + '</button>' +
      '</form>' +
      '<div class="cdx-sessions-list" id="cdx-sessions-list"></div>' +
    '</div>';
  const form = viewEl.querySelector('#cdx-sessions-create');
  const titleInput = viewEl.querySelector('#cdx-sessions-title');
  const list = viewEl.querySelector('#cdx-sessions-list');

  _on(form, 'submit', async (e) => {
    e.preventDefault();
    const title = titleInput.value.trim();
    if (!title) return;
    let res;
    try { res = await api.createSession({ title }); } catch (err) { notice.internal(err); res = null; }
    if (!res || res.error || !res.code) { notice.error(t('questions.sessions_create_error')); return; }
    titleInput.value = '';
    _load(list);
  });

  // One delegated handler for the per-row lifecycle buttons (no inline onclick).
  _on(list, 'click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    const code = btn.getAttribute('data-code');
    if (act === 'close') {
      try { await api.closeSession({ code }); } catch (err) { notice.internal(err); }
      _load(list);
    } else if (act === 'reopen') {
      let res;
      try { res = await api.reopenSession({ code }); } catch (err) { notice.internal(err); res = null; }
      if (res && res.error) { notice.warn(t('questions.sessions_reopen_blocked')); return; }
      _load(list);
    }
  });

  _load(list);
}

export function unmount() {
  _cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
  _cleanup = [];
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
