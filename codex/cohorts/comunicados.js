// cohorts/comunicados.js
// track-44 Etapa A — Comunicações. The AUTHORED broadcast composer at the Cohorts level
// (general, cross-turma — the sibling of the Alunos/Usuários roster). ONE comunicado is
// one message fanned to the chosen channels (sino / e-mail / push) for the chosen scope
// (all turmas / specific turmas / global). The SAME composer mounts turma-locked inside a
// dossier later; here it is the general surface. Backend: comunicados.send/list via the
// codex-api facade; the router (worker lib/notify.js) does the fan-out and returns the
// reach counts. Doctrine: manifest/architecture/notifications.md.
import { comunicados as api, cohorts as cohortsApi } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc as _esc } from '../js/dom.js';
import * as toast from '../js/toast.js';
import * as notice from '../js/notice.js';

let _viewEl = null;
let _turmas = [];
let _sending = false;

export async function mount(viewEl) {
  _viewEl = viewEl;
  viewEl.innerHTML = '<div class="cdx-cm-wrap"><p class="cdx-cm-muted">' + _esc(t('comunicados.loading')) + '</p></div>';
  try {
    const r = await cohortsApi.listAllTurmas();
    _turmas = ((r && r.turmas) || []).filter((tm) => tm && (tm.status ? tm.status !== 'archived' : true));
  } catch (e) {
    _turmas = [];
    notice.internal('comunicados: listAllTurmas falhou: ' + (e && e.message));
  }
  if (_viewEl) _render();
}

export function unmount() { _viewEl = null; _turmas = []; _sending = false; }

function _turmaLabel(tm) {
  const name = tm.display_name || tm.name || tm.slug || '?';
  const client = tm.client_name || tm.client_display_name || tm.client_slug || '';
  return client ? (client + ' · ' + name) : name;
}

function _render() {
  const turmaOpts = _turmas.map((tm) =>
    '<label class="cdx-cm-turma"><input type="checkbox" class="cdx-cm-turma-cb" value="' + _esc(String(tm.id)) + '"> ' +
    '<span>' + _esc(_turmaLabel(tm)) + '</span></label>'
  ).join('') || ('<p class="cdx-cm-muted">' + _esc(t('comunicados.no_turmas')) + '</p>');

  _viewEl.innerHTML =
    '<div class="cdx-cm-wrap">' +
      '<div class="cdx-cm-head">' +
        '<h2 class="cdx-cm-title">' + _esc(t('comunicados.title')) + '</h2>' +
        '<p class="cdx-cm-sub">' + _esc(t('comunicados.subtitle')) + '</p>' +
      '</div>' +
      '<div class="cdx-cm-card">' +
        // Scope
        '<div class="cdx-cm-field">' +
          '<div class="cdx-cm-label">' + _esc(t('comunicados.scope')) + '</div>' +
          '<label class="cdx-cm-radio"><input type="radio" name="cdx-cm-scope" value="all" checked> ' + _esc(t('comunicados.scope_all')) + '</label>' +
          '<label class="cdx-cm-radio"><input type="radio" name="cdx-cm-scope" value="turmas"> ' + _esc(t('comunicados.scope_pick')) + '</label>' +
          '<label class="cdx-cm-radio"><input type="radio" name="cdx-cm-scope" value="global"> ' + _esc(t('comunicados.scope_global')) + '</label>' +
          '<div class="cdx-cm-turmas" hidden>' + turmaOpts + '</div>' +
        '</div>' +
        // Title
        '<div class="cdx-cm-field">' +
          '<label class="cdx-cm-label" for="cdx-cm-title-in">' + _esc(t('comunicados.msg_title')) + '</label>' +
          '<input id="cdx-cm-title-in" class="cdx-cm-input" type="text" maxlength="200" placeholder="' + _esc(t('comunicados.msg_title_ph')) + '">' +
        '</div>' +
        // Body
        '<div class="cdx-cm-field">' +
          '<label class="cdx-cm-label" for="cdx-cm-body-in">' + _esc(t('comunicados.msg_body')) + '</label>' +
          '<textarea id="cdx-cm-body-in" class="cdx-cm-textarea" rows="5" placeholder="' + _esc(t('comunicados.msg_body_ph')) + '"></textarea>' +
        '</div>' +
        // Channels
        '<div class="cdx-cm-field">' +
          '<div class="cdx-cm-label">' + _esc(t('comunicados.channels')) + '</div>' +
          '<label class="cdx-cm-check"><input type="checkbox" class="cdx-cm-ch" value="bell" checked> ' + _esc(t('comunicados.ch_bell')) + '</label>' +
          '<label class="cdx-cm-check"><input type="checkbox" class="cdx-cm-ch" value="email" checked> ' + _esc(t('comunicados.ch_email')) + '</label>' +
          '<label class="cdx-cm-check cdx-cm-check--soon"><input type="checkbox" class="cdx-cm-ch" value="push" disabled> ' + _esc(t('comunicados.ch_push')) + ' <span class="cdx-cm-soon">' + _esc(t('comunicados.soon')) + '</span></label>' +
        '</div>' +
        // Reach + send
        '<div class="cdx-cm-actions">' +
          '<button type="button" class="cdx-btn cdx-btn-primary cdx-cm-send">' + _esc(t('comunicados.send')) + '</button>' +
          '<span class="cdx-cm-result" role="status"></span>' +
        '</div>' +
      '</div>' +
      '<div class="cdx-cm-recent">' +
        '<h3 class="cdx-cm-recent-title">' + _esc(t('comunicados.recent')) + '</h3>' +
        '<div class="cdx-cm-list"><p class="cdx-cm-muted">' + _esc(t('comunicados.loading')) + '</p></div>' +
      '</div>' +
    '</div>';

  _wire();
  _loadRecent();
}

function _wire() {
  const root = _viewEl;
  const turmasBox = root.querySelector('.cdx-cm-turmas');
  root.querySelectorAll('input[name="cdx-cm-scope"]').forEach((r) => {
    r.addEventListener('change', () => {
      const pick = root.querySelector('input[name="cdx-cm-scope"]:checked');
      if (turmasBox) turmasBox.hidden = !(pick && pick.value === 'turmas');
    });
  });
  const sendBtn = root.querySelector('.cdx-cm-send');
  if (sendBtn) sendBtn.addEventListener('click', _send);
}

async function _send() {
  if (_sending) return;
  const root = _viewEl;
  const scope = (root.querySelector('input[name="cdx-cm-scope"]:checked') || {}).value || 'all';
  const title = (root.querySelector('#cdx-cm-title-in').value || '').trim();
  const body = (root.querySelector('#cdx-cm-body-in').value || '').trim();
  const channels = { bell: false, email: false, push: false };
  root.querySelectorAll('.cdx-cm-ch:checked').forEach((c) => { channels[c.value] = true; });
  if (!title) { toast.err(t('comunicados.need_title')); return; }
  if (!body) { toast.err(t('comunicados.need_body')); return; }
  if (!channels.bell && !channels.email && !channels.push) { toast.err(t('comunicados.need_channel')); return; }

  // scope 'all' = every turma (turmas scope with all ids); 'global' = un-scoped news; 'turmas' = picked.
  let payload;
  if (scope === 'global') {
    payload = { scope: 'global', category: 'noticia', title, body, channels };
  } else {
    let turmaIds;
    if (scope === 'all') {
      turmaIds = _turmas.map((tm) => Number(tm.id)).filter((n) => Number.isInteger(n));
    } else {
      turmaIds = Array.from(root.querySelectorAll('.cdx-cm-turma-cb:checked')).map((c) => Number(c.value)).filter((n) => Number.isInteger(n));
      if (!turmaIds.length) { toast.err(t('comunicados.pick_turmas')); return; }
    }
    payload = { scope: 'turmas', turma_ids: turmaIds, category: 'comunicado', title, body, channels };
  }

  const btn = root.querySelector('.cdx-cm-send');
  const result = root.querySelector('.cdx-cm-result');
  _sending = true;
  if (btn) { btn.disabled = true; btn.textContent = t('comunicados.sending'); }
  try {
    const r = await api.send(payload);
    if (!r || !r.ok) { notice.error(t('comunicados.send_failed') + (r && r.error ? ' (' + r.error + ')' : '')); if (result) result.textContent = ''; return; }
    const reach = r.reach || {};
    const bits = [];
    bits.push(t('comunicados.ch_bell') + ': ' + (reach.bell || 0));
    if (channels.email) bits.push(t('comunicados.ch_email') + ': ' + (reach.email || 0));
    if (result) result.textContent = t('comunicados.sent') + ' — ' + bits.join(' · ');
    toast.ok(t('comunicados.sent'));
    // clear the message fields, keep scope/channels for a quick next send
    root.querySelector('#cdx-cm-title-in').value = '';
    root.querySelector('#cdx-cm-body-in').value = '';
    _loadRecent();
  } catch (e) {
    notice.internal('comunicados.send falhou: ' + (e && e.message));
  } finally {
    _sending = false;
    if (btn) { btn.disabled = false; btn.textContent = t('comunicados.send'); }
  }
}

async function _loadRecent() {
  const list = _viewEl && _viewEl.querySelector('.cdx-cm-list');
  if (!list) return;
  try {
    const r = await api.list({ limit: 30 });
    const rows = (r && r.comunicados) || [];
    if (!rows.length) { list.innerHTML = '<p class="cdx-cm-muted">' + _esc(t('comunicados.none')) + '</p>'; return; }
    list.innerHTML = rows.map((c) => {
      const scopeLabel = c.scope === 'global' ? t('comunicados.scope_global')
        : (c.scope === 'turmas' ? _scopeTurmasLabel(c.turma_ids) : '');
      return '<div class="cdx-cm-item">' +
        '<div class="cdx-cm-item-main">' +
          '<span class="cdx-cm-item-title">' + _esc(c.title || '') + '</span>' +
          '<span class="cdx-cm-item-meta">' + _esc(scopeLabel) + '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (e) {
    list.innerHTML = '<p class="cdx-cm-muted">' + _esc(t('comunicados.none')) + '</p>';
  }
}

function _scopeTurmasLabel(turmaIdsJson) {
  let ids = [];
  try { ids = JSON.parse(turmaIdsJson || '[]'); } catch (_) { ids = []; }
  if (!ids.length) return '';
  if (ids.length === _turmas.length) return t('comunicados.scope_all');
  return ids.length + ' ' + t('comunicados.turmas_word');
}
