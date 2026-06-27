// codex/alunos/alunos.js
// Codex "Alunos" admin section (Phase 7): per-turma student access management. The
// home for the manual approval queue (signal d), roster pre-approval (signal c),
// student-session revocation, and the per-turma access switches (gated on/off,
// inline/upfront, certificates). Backend ONLY through the cohorts facade; cdx- CSS
// prefix. The DOM is verified on staging; the worker actions it drives are
// unit-tested in the codex-api access-control suite.
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { cohorts as api } from '../js/codex-api.js';
import { clockOffset, remainingSec, fmtRemain, enrollUrl } from '../js/enroll-clock.js';
import { settingsHtml as accessSettingsHtml, wireSettings as wireAccessSettings } from '../js/access-panel.js';
import * as qr from '../js/qr-share-modal.js';
import { sectionParticipants, toolbarState, avatarFor } from './alunos-logic.js';

let _viewEl = null;
let _turmas = [];
let _current = null; // the selected turma row (from ct_list_all_turmas)
let _enrollTimer = null; // the live-countdown interval for the open enrollment window
let _participants = [];  // the loaded roster for the selected turma (one sectioned list)

function clearEnrollTimer() { if (_enrollTimer) { clearInterval(_enrollTimer); _enrollTimer = null; } }

export function mount(viewEl) {
  _viewEl = viewEl;
  _viewEl.innerHTML =
    '<div class="cdx-alunos">' +
      '<header class="cdx-alunos-head">' +
        '<h1>' + esc(t('alunos.title')) + '</h1>' +
        '<label class="cdx-alunos-pick">' +
          '<span>' + esc(t('alunos.turma')) + '</span>' +
          '<select class="cdx-alunos-turma"><option value="">' + esc(t('alunos.pick')) + '</option></select>' +
        '</label>' +
      '</header>' +
      '<div class="cdx-alunos-body"><p class="cdx-alunos-empty">' + esc(t('alunos.pick_hint')) + '</p></div>' +
    '</div>';
  const sel = _viewEl.querySelector('.cdx-alunos-turma');
  sel.addEventListener('change', () => {
    _current = _turmas.find((x) => x.id === Number(sel.value)) || null;
    if (_current) loadTurma();
    else body().innerHTML = '<p class="cdx-alunos-empty">' + esc(t('alunos.pick_hint')) + '</p>';
  });
  loadTurmas(sel);
}

export function unmount() {
  clearEnrollTimer();
  _viewEl = null; _turmas = []; _current = null;
}

function body() { return _viewEl.querySelector('.cdx-alunos-body'); }
// Swallow + null on failure, but the caught error STILL reaches the debug pill
// with real detail (never a silent catch).
async function safe(fn) {
  try { return await fn(); }
  catch (e) {
    if (typeof window !== 'undefined' && window.bsLog) window.bsLog('alunos: ' + ((e && e.message) || e), 'error');
    return null;
  }
}
// The admin's deployment, so the access-liberado email links back to staging/prod (not always prod).
function _origin() { return (typeof location !== 'undefined' && location.origin) ? location.origin : undefined; }

async function loadTurmas(sel) {
  const res = await safe(() => api.listAllTurmas({}));
  if (!res) { body().innerHTML = '<p class="cdx-alunos-error">' + esc(t('alunos.load_error')) + '</p>'; return; }
  _turmas = res.turmas || [];
  for (const tu of _turmas) {
    const opt = document.createElement('option');
    opt.value = String(tu.id);
    opt.textContent = (tu.client_display_name ? tu.client_display_name + ' · ' : '') + (tu.display_name || tu.name);
    sel.appendChild(opt);
  }
}

async function loadTurma() {
  clearEnrollTimer();
  body().innerHTML = '<p class="cdx-alunos-empty">' + esc(t('alunos.loading')) + '</p>';
  const res = await safe(() => api.listParticipants({ turma_id: _current.id }));
  if (!res) { body().innerHTML = '<p class="cdx-alunos-error">' + esc(t('alunos.load_error')) + '</p>'; return; }
  render(res.participants || []);
}

function render(participants) {
  clearEnrollTimer();
  _participants = participants;
  body().innerHTML = settingsCard() + enrollmentCard() + studentsCard() + rosterCard();
  wireSettings();
  wireStudents();
  wireRoster();
  loadEnrollment();
}

// ── Access settings (per-turma switches) ─────────────────────────────────────
// The switches themselves live in the shared js/access-panel.js (the same
// component the cohort dossier mounts), so the gating logic is in one place.
function settingsCard() {
  return '<section class="cdx-alunos-card">' +
    '<h2>' + esc(t('alunos.settings')) + '</h2>' +
    accessSettingsHtml(_current) +
  '</section>';
}
function wireSettings() {
  wireAccessSettings(body(), _current, {
    api, clientSlug: _current.client_slug, slug: _current.turma_slug,
  });
}

// ── QR enrollment window (signal a/b, instructor-controlled) ──────────────────
// Open a time-boxed window and project a QR; scanning it auto-approves the scanner.
// The countdown is anchored to the server expiry (enroll-clock.js) and the card
// re-validates against the server, so it is never a silent client-only timer.
function enrollmentCard() {
  return '<section class="cdx-alunos-card cdx-al-enroll"><h2>' + esc(t('alunos.enroll')) + '</h2>' +
    '<div class="cdx-al-enroll-body"><p class="cdx-alunos-empty">' + esc(t('alunos.loading')) + '</p></div></section>';
}

async function loadEnrollment() {
  clearEnrollTimer();
  const card = body() && body().querySelector('.cdx-al-enroll-body');
  if (!card || !_current) return;
  const res = await safe(() => api.getEnrollment({ client_slug: _current.client_slug, slug: _current.turma_slug }));
  const box = body() && body().querySelector('.cdx-al-enroll-body');
  if (!box) return;
  if (!res || !res.ok) { box.innerHTML = '<p class="cdx-alunos-error">' + esc(t('alunos.load_error')) + '</p>'; return; }
  renderEnrollBox(box, res);
}

function renderEnrollBox(box, res) {
  clearEnrollTimer();
  if (!res.open) {
    // Closed: ONE QR button. It mints a window and opens the QR straight away
    // (mint-if-none), so there is no separate "open enrollment" then "show QR" step.
    box.innerHTML =
      '<div class="cdx-al-enroll-actions">' +
        '<button type="button" class="cdx-btn cdx-btn-primary cdx-al-enroll-qr">' +
          '<span class="cdx-al-qrglyph" aria-hidden="true">▦</span> ' + esc(t('alunos.enroll_open_btn')) +
        '</button>' +
      '</div>' +
      '<p class="cdx-alunos-hint">' + esc(t('alunos.enroll_hint_closed')) + '</p>';
    const qb = box.querySelector('.cdx-al-enroll-qr');
    qb.addEventListener('click', async () => {
      qb.disabled = true;
      const opened = await safe(() => api.openEnrollment({ client_slug: _current.client_slug, slug: _current.turma_slug }));
      if (opened && opened.ok) {
        qr.open({
          joinUrl: enrollUrl(
            (typeof location !== 'undefined' && location.origin) ? location.origin : '',
            _current.client_slug, _current.turma_slug, opened.turma_token, opened.enrollment_token,
          ),
          title: t('alunos.enroll_qr_title'),
        });
      }
      loadEnrollment();
    });
    return;
  }
  const offset = clockOffset(res.now, Math.floor(Date.now() / 1000));
  const joinUrl = enrollUrl(
    (typeof location !== 'undefined' && location.origin) ? location.origin : '',
    _current.client_slug, _current.turma_slug, res.turma_token, res.enrollment_token,
  );
  // Open: the SAME QR button re-opens the QR and carries the remaining time on it.
  box.innerHTML =
    '<p class="cdx-al-enroll-on"><span class="cdx-al-enroll-dot" aria-hidden="true">●</span> ' + esc(t('alunos.enroll_open')) + '</p>' +
    '<div class="cdx-al-enroll-actions">' +
      '<button type="button" class="cdx-btn cdx-btn-primary cdx-al-enroll-qr"><span class="cdx-al-qrglyph" aria-hidden="true">▦</span> <span class="cdx-al-enroll-rem"></span></button>' +
      '<button type="button" class="cdx-btn cdx-btn-vazado cdx-al-enroll-close">' + esc(t('alunos.enroll_close')) + '</button>' +
    '</div>' +
    '<p class="cdx-alunos-hint">' + esc(t('alunos.enroll_hint_open')) + '</p>';
  box.querySelector('.cdx-al-enroll-qr').addEventListener('click', () => qr.open({ joinUrl, title: t('alunos.enroll_qr_title') }));
  box.querySelector('.cdx-al-enroll-close').addEventListener('click', async () => {
    clearEnrollTimer();
    await safe(() => api.closeEnrollment({ client_slug: _current.client_slug, slug: _current.turma_slug }));
    loadEnrollment();
  });
  const remEl = box.querySelector('.cdx-al-enroll-rem');
  let revalIn = 30; // re-fetch the server state every ~30s so the timer can't drift silently
  const tick = () => {
    const remain = remainingSec(res.enrollment_expires_at, offset, Math.floor(Date.now() / 1000));
    if (remain <= 0) { clearEnrollTimer(); loadEnrollment(); return; }
    if (remEl) remEl.textContent = fmtRemain(remain);
    if (--revalIn <= 0) { revalIn = 30; loadEnrollment(); }
  };
  tick();
  _enrollTimer = setInterval(tick, 1000);
}

// ── Students (B+C2: one sectioned list + sticky adaptive toolbar) ─────────────
// Elder's call: no separate approval queue. A single roster split into status
// sections (Pendentes / Aprovados / Bloqueados, pending first), each row with an
// always-visible checkbox and a deterministic avatar. The batch actions live in
// a sticky toolbar that GREYS OUT each button when it does not apply to the WHOLE
// current selection (predicate map in alunos-logic.js, ported from the mock). A
// per-row pencil opens an inline name/email editor. Actions reload the turma.

function statusBadge(p) {
  const s = p.access_status || 'pending';
  return '<span class="cdx-al-badge cdx-al-badge--' + s + '">' + esc(t('alunos.status_' + s)) + '</span>';
}

function studentsCard() {
  return '<section class="cdx-alunos-card cdx-al-listcard"><h2>' + esc(t('alunos.students')) + ' (' + _participants.length + ')</h2>' +
    '<div class="cdx-al-toolbar" id="cdx-al-toolbar" role="toolbar" aria-label="' + esc(t('alunos.students')) + '">' +
      '<label class="cdx-al-master-lbl"><input type="checkbox" class="cdx-al-master" id="cdx-al-master"> ' + esc(t('alunos.toolbar_select_all')) + '</label>' +
      '<span class="cdx-al-count" id="cdx-al-count">0 ' + esc(t('alunos.sel_suffix')) + '</span>' +
      '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-act="aprovar" disabled>' + esc(t('alunos.approve')) + '</button>' +
      '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-act="revogar" disabled>' + esc(t('alunos.revoke_token')) + '</button>' +
      '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-act="bloquear" disabled>' + esc(t('alunos.block')) + '</button>' +
      '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-act="desbloquear" disabled>' + esc(t('alunos.unblock')) + '</button>' +
      '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm" data-act="remover" disabled>' + esc(t('alunos.remove')) + '</button>' +
    '</div>' +
    '<ul class="cdx-al-list cdx-al-students" id="cdx-al-students-list"></ul></section>';
}

const _SEP_DOT = { pending: '◐', approved: '●', denied: '✕' };
const _SEP_LBL = { pending: 'alunos.filter_pending', approved: 'alunos.filter_approved', denied: 'alunos.filter_denied' };

function sepRow(status, count) {
  return '<li class="cdx-al-sep" data-sep="' + status + '">' +
    '<span class="cdx-al-dot--' + status + '" aria-hidden="true">' + (_SEP_DOT[status] || '●') + '</span>' +
    '<span class="cdx-al-sep-t">' + esc(t(_SEP_LBL[status])) + ' · ' + count + '</span>' +
    '<span class="cdx-al-sep-sp"></span>' +
    '<button type="button" class="cdx-al-secsel" data-section="' + status + '">' + esc(t('alunos.select_section')) + '</button>' +
  '</li>';
}

function avatarHtml(p) {
  const av = avatarFor(p.id != null ? p.id : (p.email || p.name || ''), p.display_name || p.name || '');
  return '<span class="cdx-al-av" style="background:' + av.bg + ';color:' + av.fg + '" aria-hidden="true">' + esc(av.initials) + '</span>';
}

// Row inner (no <li> wrapper) so the same markup serves a fresh paint AND the
// in-place swap back from edit mode.
function studentRowInner(p) {
  const online = (p.active_sessions || 0) > 0;
  const via = p.approved_via ? esc(t('alunos.via_' + p.approved_via)) : '';
  // An email taken on trust (QR join / self-registration) is flagged until the
  // student clicks a magic link; the instructor can spot and fix typos in the room.
  const unv = (p.email && !p.email_verified) ? ' <span class="cdx-al-unverified" title="' + esc(t('alunos.unverified')) + '">⚠</span>' : '';
  const dot = online ? ' <span class="cdx-al-online" title="' + esc(t('alunos.online')) + '">●</span>' : '';
  const label = esc(p.display_name || p.name || ('#' + p.id));
  return '<input type="checkbox" class="cdx-al-chk" aria-label="' + label + '">' +
    avatarHtml(p) +
    '<span class="cdx-al-id">' +
      '<span class="cdx-al-name">' + label + dot + '</span>' +
      '<span class="cdx-al-email">' + esc(p.email || '') + unv + '</span>' +
    '</span>' +
    statusBadge(p) +
    '<span class="cdx-al-via">' + via + '</span>' +
    '<button type="button" class="cdx-al-edit" data-edit title="' + esc(t('alunos.edit_title')) + '">✎</button>';
}

function studentRow(p) {
  const st = p.access_status || 'pending';
  return '<li class="cdx-al-srow" data-id="' + p.id + '" data-status="' + st + '">' + studentRowInner(p) + '</li>';
}

// Inline name/email editor swapped into a single row by the pencil.
function editRowInner(p) {
  return '<input type="checkbox" class="cdx-al-chk" disabled>' +
    avatarHtml(p) +
    '<span class="cdx-al-editbox">' +
      '<input type="text" class="cdx-al-edit-name" value="' + esc(p.display_name || p.name || '') + '" placeholder="' + esc(t('alunos.edit_name_ph')) + '">' +
      '<input type="email" class="cdx-al-edit-email" value="' + esc(p.email || '') + '" placeholder="' + esc(t('alunos.edit_email_ph')) + '">' +
    '</span>' +
    '<span class="cdx-al-edit-actions">' +
      '<button type="button" class="cdx-btn cdx-btn-primary cdx-btn-sm cdx-al-edit-save">' + esc(t('alunos.save')) + '</button>' +
      '<button type="button" class="cdx-btn cdx-btn-vazado cdx-btn-sm cdx-al-edit-cancel">' + esc(t('alunos.cancel')) + '</button>' +
    '</span>';
}

function paintStudents() {
  const ul = body() && body().querySelector('#cdx-al-students-list');
  if (!ul) return;
  const sections = sectionParticipants(_participants);
  if (!_participants.length) {
    ul.innerHTML = '<li class="cdx-alunos-empty">' + esc(t('alunos.students_empty')) + '</li>';
    return;
  }
  let html = '';
  for (const sec of sections) {
    if (!sec.items.length) continue;
    html += sepRow(sec.status, sec.items.length) + sec.items.map(studentRow).join('');
  }
  ul.innerHTML = html;
}

// ── Selection helpers ─────────────────────────────────────────────────────────
function _rows(ul) { return Array.prototype.slice.call(ul.querySelectorAll('.cdx-al-srow')); }
function _chk(li) { return li.querySelector('.cdx-al-chk'); }
function _selected(ul) { return _rows(ul).filter((r) => { const c = _chk(r); return c && c.checked; }); }

function refreshToolbar() {
  const ul = body() && body().querySelector('#cdx-al-students-list');
  const tb = body() && body().querySelector('#cdx-al-toolbar');
  if (!ul || !tb) return;
  const rows = _rows(ul);
  rows.forEach((r) => { const c = _chk(r); r.classList.toggle('is-on', !!(c && c.checked)); });
  const sel = rows.filter((r) => { const c = _chk(r); return c && c.checked; });
  const count = tb.querySelector('#cdx-al-count');
  if (count) count.textContent = sel.length + ' ' + t('alunos.sel_suffix');
  const state = toolbarState(sel.map((r) => r.dataset.status));
  tb.querySelectorAll('button[data-act]').forEach((b) => { b.disabled = !state[b.dataset.act]; });
  const master = tb.querySelector('.cdx-al-master');
  if (master) {
    const selectable = rows.filter((r) => { const c = _chk(r); return c && !c.disabled; });
    master.checked = selectable.length > 0 && sel.length >= selectable.length;
    master.indeterminate = sel.length > 0 && sel.length < selectable.length;
  }
}

function setToolbarBusy(on) {
  const tb = body() && body().querySelector('#cdx-al-toolbar');
  if (tb) tb.querySelectorAll('button[data-act]').forEach((b) => { b.disabled = on; });
}

function wireStudents() {
  paintStudents();
  const tb = body().querySelector('#cdx-al-toolbar');
  const ul = body().querySelector('#cdx-al-students-list');
  if (!ul) return;
  if (tb) {
    tb.querySelectorAll('button[data-act]').forEach((b) => b.addEventListener('click', () => runBatch(b.dataset.act)));
    const master = tb.querySelector('.cdx-al-master');
    if (master) master.addEventListener('change', () => {
      _rows(ul).forEach((r) => { const c = _chk(r); if (c && !c.disabled) c.checked = master.checked; });
      refreshToolbar();
    });
  }
  // Delegated list handlers: a checkbox change, a section "selecionar seção", a
  // row click (toggles its checkbox), and the edit pencil / inline editor.
  ul.addEventListener('change', (e) => {
    if (e.target && e.target.classList && e.target.classList.contains('cdx-al-chk')) refreshToolbar();
  });
  ul.addEventListener('click', (e) => onListClick(e, ul));
  refreshToolbar();
}

function onListClick(e, ul) {
  const tgt = e.target;
  if (!tgt || !tgt.closest) return;
  const secBtn = tgt.closest('.cdx-al-secsel');
  if (secBtn) {
    const sec = secBtn.dataset.section;
    _rows(ul).forEach((r) => { if (r.dataset.status === sec) { const c = _chk(r); if (c && !c.disabled) c.checked = true; } });
    refreshToolbar();
    return;
  }
  const li = tgt.closest('.cdx-al-srow');
  if (!li) return;
  if (tgt.closest('[data-edit]')) { e.stopPropagation(); enterEdit(li); return; }
  if (li.classList.contains('is-editing')) {
    if (tgt.closest('.cdx-al-edit-save')) saveEdit(li);
    else if (tgt.closest('.cdx-al-edit-cancel')) exitEdit(li);
    return; // clicks inside the editor never toggle selection
  }
  if (tgt.classList && tgt.classList.contains('cdx-al-chk')) return; // native toggle + change event
  const c = _chk(li);
  if (c && !c.disabled) { c.checked = !c.checked; refreshToolbar(); }
}

function _find(id) { return _participants.find((x) => x.id === id); }

function enterEdit(li) {
  const p = _find(Number(li.dataset.id));
  if (!p) return;
  li.classList.add('is-editing');
  li.innerHTML = editRowInner(p);
  const nameEl = li.querySelector('.cdx-al-edit-name');
  if (nameEl && nameEl.focus) nameEl.focus();
  refreshToolbar();
}

function exitEdit(li) {
  const p = _find(Number(li.dataset.id));
  li.classList.remove('is-editing');
  if (p) li.innerHTML = studentRowInner(p);
  refreshToolbar();
}

async function saveEdit(li) {
  const id = Number(li.dataset.id);
  const nameEl = li.querySelector('.cdx-al-edit-name');
  const emailEl = li.querySelector('.cdx-al-edit-email');
  const name = ((nameEl && nameEl.value) || '').trim();
  const email = ((emailEl && emailEl.value) || '').trim();
  if (!name) { if (nameEl && nameEl.focus) nameEl.focus(); return; }
  const save = li.querySelector('.cdx-al-edit-save');
  if (save) save.disabled = true;
  const res = await safe(() => api.updateParticipant({ id, name, email: email || null }));
  if (res) loadTurma();
  else if (save) save.disabled = false;
}

// Batch action driven by the toolbar. Status flips (aprovar/bloquear/desbloquear)
// go through setParticipantAccess with the participant_ids array; remover and
// revogar have no array form on the facade, so they loop per id.
async function runBatch(act) {
  const ul = body() && body().querySelector('#cdx-al-students-list');
  if (!ul) return;
  const ids = _selected(ul).map((r) => Number(r.dataset.id));
  if (!ids.length) return;
  if (act === 'remover' && typeof confirm === 'function' && !confirm(t('alunos.remove_selected_confirm'))) return;
  if (act === 'revogar' && typeof confirm === 'function' && !confirm(t('alunos.revoke_confirm'))) return;
  setToolbarBusy(true);
  if (act === 'aprovar') await safe(() => api.setParticipantAccess({ participant_ids: ids, status: 'approved', origin: _origin() }));
  else if (act === 'bloquear') await safe(() => api.setParticipantAccess({ participant_ids: ids, status: 'denied' }));
  else if (act === 'desbloquear') await safe(() => api.setParticipantAccess({ participant_ids: ids, status: 'pending' }));
  else if (act === 'remover') { for (const id of ids) await safe(() => api.deleteParticipant({ id })); }
  else if (act === 'revogar') { for (const id of ids) await safe(() => api.revokeStudentSessions({ participant_id: id })); }
  loadTurma();
}

// ── Roster pre-approval (signal c) ───────────────────────────────────────────
function rosterCard() {
  return '<section class="cdx-alunos-card"><h2>' + esc(t('alunos.roster')) + '</h2>' +
    '<p class="cdx-alunos-hint">' + esc(t('alunos.roster_hint')) + '</p>' +
    '<textarea class="cdx-al-roster" rows="4" placeholder="' + esc(t('alunos.roster_ph')) + '"></textarea>' +
    '<div class="cdx-al-actions"><button type="button" class="cdx-btn cdx-al-roster-go">' + esc(t('alunos.roster_go')) + '</button>' +
    '<span class="cdx-al-msg cdx-al-roster-msg" aria-live="polite"></span></div></section>';
}
function wireRoster() {
  const ta = body().querySelector('.cdx-al-roster');
  const go = body().querySelector('.cdx-al-roster-go');
  const msg = body().querySelector('.cdx-al-roster-msg');
  if (!go) return;
  go.addEventListener('click', async () => {
    const emails = (ta.value || '').split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!emails.length) { msg.textContent = t('alunos.roster_none'); return; }
    go.disabled = true; msg.textContent = '';
    const res = await safe(() => api.rosterApprove({ turma_id: _current.id, emails }));
    if (res && res.ok) { msg.textContent = t('alunos.roster_done'); ta.value = ''; loadTurma(); }
    else { msg.textContent = t('alunos.save_error'); go.disabled = false; }
  });
}
