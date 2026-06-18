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
import { clockOffset, remainingSec, fmtRemain, enrollUrl } from './enroll-clock.js';
import * as qr from '../js/qr-share-modal.js';

let _viewEl = null;
let _turmas = [];
let _current = null; // the selected turma row (from ct_list_all_turmas)
let _enrollTimer = null; // the live-countdown interval for the open enrollment window
let _participants = [];  // the loaded roster for the selected turma (one list, filtered client-side)
let _filter = 'all';     // students-list filter: all | pending | approved | denied

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
async function safe(fn) { try { return await fn(); } catch (_) { return null; } }
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
function settingsCard() {
  const g = !!_current.access_gated;
  const mode = _current.gate_mode || 'inline';
  const certs = !!_current.certificates_enabled;
  return '<section class="cdx-alunos-card">' +
    '<h2>' + esc(t('alunos.settings')) + '</h2>' +
    '<label class="cdx-al-row"><input type="checkbox" class="cdx-al-gated"' + (g ? ' checked' : '') + '> <span>' + esc(t('alunos.gated')) + '</span></label>' +
    '<label class="cdx-al-row"><span>' + esc(t('alunos.mode')) + '</span> <select class="cdx-al-mode"' + (g ? '' : ' disabled') + '>' +
      '<option value="inline"' + (mode === 'inline' ? ' selected' : '') + '>' + esc(t('alunos.mode_inline')) + '</option>' +
      '<option value="upfront"' + (mode === 'upfront' ? ' selected' : '') + '>' + esc(t('alunos.mode_upfront')) + '</option>' +
    '</select></label>' +
    '<label class="cdx-al-row"><input type="checkbox" class="cdx-al-certs"' + (certs ? ' checked' : '') + '> <span>' + esc(t('alunos.certs')) + '</span></label>' +
    '<div class="cdx-al-actions"><button type="button" class="cdx-btn cdx-al-save">' + esc(t('alunos.save')) + '</button>' +
    '<span class="cdx-al-msg cdx-al-save-msg" aria-live="polite"></span></div>' +
  '</section>';
}
function wireSettings() {
  const gated = body().querySelector('.cdx-al-gated');
  const mode = body().querySelector('.cdx-al-mode');
  const certs = body().querySelector('.cdx-al-certs');
  const save = body().querySelector('.cdx-al-save');
  const msg = body().querySelector('.cdx-al-save-msg');
  gated.addEventListener('change', () => { mode.disabled = !gated.checked; });
  save.addEventListener('click', async () => {
    save.disabled = true; msg.textContent = '';
    const res = await safe(() => api.updateTurmaMeta({
      client_slug: _current.client_slug, slug: _current.turma_slug,
      access_gated: gated.checked ? 1 : 0, gate_mode: mode.value,
      certificates_enabled: certs.checked ? 1 : 0,
    }));
    if (res && res.ok) {
      _current.access_gated = gated.checked ? 1 : 0;
      _current.gate_mode = mode.value;
      _current.certificates_enabled = certs.checked ? 1 : 0;
      msg.textContent = t('alunos.saved');
    } else { msg.textContent = t('alunos.save_error'); }
    save.disabled = false;
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
      '<button type="button" class="cdx-btn cdx-btn-ghost cdx-al-enroll-close">' + esc(t('alunos.enroll_close')) + '</button>' +
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

// ── Students (one list: pending on top, status filters, inline approve/deny/revoke) ──
// Elder's call: no separate approval queue. A single roster, pending sorted first, with a
// filter bar on top and per-row actions by status, so the instructor manages everyone in
// one place. The list filters client-side (no refetch); actions reload the turma.
const _STATUS_RANK = { pending: 0, approved: 1, denied: 2 };

function statusBadge(p) {
  const s = p.access_status || 'pending';
  return '<span class="cdx-al-badge cdx-al-badge--' + s + '">' + esc(t('alunos.status_' + s)) + '</span>';
}

function studentsCard() {
  const pendingCount = _participants.filter((p) => (p.access_status || 'pending') === 'pending').length;
  const filters = ['all', 'pending', 'approved', 'denied'].map((f) =>
    '<button type="button" class="cdx-al-filter' + (f === _filter ? ' is-active' : '') + '" data-filter="' + f + '">' +
      esc(t('alunos.filter_' + f)) + (f === 'pending' && pendingCount ? ' (' + pendingCount + ')' : '') + '</button>').join('');
  return '<section class="cdx-alunos-card"><h2>' + esc(t('alunos.students')) + ' (' + _participants.length + ')</h2>' +
    '<div class="cdx-al-filters">' + filters +
      (pendingCount ? '<button type="button" class="cdx-btn cdx-al-approve-all">' + esc(t('alunos.approve_all')) + '</button>' : '') +
    '</div>' +
    '<ul class="cdx-al-list cdx-al-students" id="cdx-al-students-list"></ul></section>';
}

function _sortedFiltered() {
  let list = _participants.slice();
  if (_filter !== 'all') list = list.filter((p) => (p.access_status || 'pending') === _filter);
  list.sort((a, b) => {
    const ra = _STATUS_RANK[a.access_status || 'pending'] ?? 9;
    const rb = _STATUS_RANK[b.access_status || 'pending'] ?? 9;
    if (ra !== rb) return ra - rb; // pending first
    return String(a.display_name || a.name || '').localeCompare(String(b.display_name || b.name || ''));
  });
  return list;
}

function studentRow(p) {
  const st = p.access_status || 'pending';
  const online = (p.active_sessions || 0) > 0;
  const via = p.approved_via ? '<span class="cdx-al-via">' + esc(t('alunos.via_' + p.approved_via)) + '</span>' : '<span class="cdx-al-via"></span>';
  // An email taken on trust (QR join / self-registration) is flagged until the student
  // clicks a magic link; the instructor can spot and fix typos in the room.
  const unv = (p.email && !p.email_verified) ? ' <span class="cdx-al-unverified" title="' + esc(t('alunos.unverified')) + '">⚠</span>' : '';
  let actions = '';
  if (st === 'pending' || st === 'denied') actions += '<button type="button" class="cdx-btn cdx-al-approve">' + esc(t('alunos.approve')) + '</button>';
  if (st === 'pending') actions += '<button type="button" class="cdx-btn cdx-btn-ghost cdx-al-deny">' + esc(t('alunos.deny')) + '</button>';
  if (st === 'approved') actions += '<button type="button" class="cdx-btn cdx-btn-ghost cdx-al-revoke">' + esc(t('alunos.revoke')) + '</button>';
  actions += '<button type="button" class="cdx-btn cdx-btn-ghost cdx-al-remove">' + esc(t('alunos.remove')) + '</button>';
  return '<li class="cdx-al-srow" data-id="' + p.id + '">' +
    '<span class="cdx-al-name">' + esc(p.display_name || p.name || ('#' + p.id)) +
      (online ? ' <span class="cdx-al-online" title="' + esc(t('alunos.online')) + '">●</span>' : '') + '</span>' +
    '<span class="cdx-al-email">' + esc(p.email || '') + unv + '</span>' +
    statusBadge(p) + via +
    '<span class="cdx-al-sact">' + actions + '</span>' +
  '</li>';
}

function paintStudents() {
  const ul = body() && body().querySelector('#cdx-al-students-list');
  if (!ul) return;
  const list = _sortedFiltered();
  ul.innerHTML = list.length
    ? list.map(studentRow).join('')
    : '<li class="cdx-alunos-empty">' + esc(t('alunos.students_empty')) + '</li>';
  wireStudentRows();
}

function wireStudents() {
  body().querySelectorAll('.cdx-al-filter').forEach((b) => {
    b.addEventListener('click', () => {
      _filter = b.dataset.filter;
      body().querySelectorAll('.cdx-al-filter').forEach((x) => x.classList.toggle('is-active', x === b));
      paintStudents();
    });
  });
  const all = body().querySelector('.cdx-al-approve-all');
  if (all) all.addEventListener('click', async () => {
    const ids = _participants.filter((p) => (p.access_status || 'pending') === 'pending').map((p) => p.id);
    if (!ids.length) return;
    all.disabled = true;
    await safe(() => api.setParticipantAccess({ participant_ids: ids, status: 'approved', origin: _origin() }));
    loadTurma();
  });
  paintStudents();
}

function wireStudentRows() {
  body().querySelectorAll('.cdx-al-srow').forEach((li) => {
    const id = Number(li.dataset.id);
    const ap = li.querySelector('.cdx-al-approve');
    const dn = li.querySelector('.cdx-al-deny');
    const rv = li.querySelector('.cdx-al-revoke');
    const rm = li.querySelector('.cdx-al-remove');
    if (ap) ap.addEventListener('click', async () => { ap.disabled = true; await safe(() => api.setParticipantAccess({ participant_id: id, status: 'approved', origin: _origin() })); loadTurma(); });
    if (dn) dn.addEventListener('click', async () => { dn.disabled = true; await safe(() => api.setParticipantAccess({ participant_id: id, status: 'denied' })); loadTurma(); });
    // Revoke = flip access_status back to pending (the gate reads it live; the worker also
    // cuts live sessions, so the student is logged out on their next page load).
    if (rv) rv.addEventListener('click', async () => { rv.disabled = true; await safe(() => api.setParticipantAccess({ participant_id: id, status: 'pending' })); loadTurma(); });
    if (rm) rm.addEventListener('click', async () => {
      if (typeof confirm === 'function' && !confirm(t('alunos.remove_confirm'))) return;
      rm.disabled = true; await safe(() => api.deleteParticipant({ id })); loadTurma();
    });
  });
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
