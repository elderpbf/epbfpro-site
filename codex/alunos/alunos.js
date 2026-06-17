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

let _viewEl = null;
let _turmas = [];
let _current = null; // the selected turma row (from ct_list_all_turmas)

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
  _viewEl = null; _turmas = []; _current = null;
}

function body() { return _viewEl.querySelector('.cdx-alunos-body'); }
async function safe(fn) { try { return await fn(); } catch (_) { return null; } }

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
  body().innerHTML = '<p class="cdx-alunos-empty">' + esc(t('alunos.loading')) + '</p>';
  const res = await safe(() => api.listParticipants({ turma_id: _current.id }));
  if (!res) { body().innerHTML = '<p class="cdx-alunos-error">' + esc(t('alunos.load_error')) + '</p>'; return; }
  render(res.participants || []);
}

function render(participants) {
  const pending = participants.filter((p) => p.access_status === 'pending');
  body().innerHTML = settingsCard() + queueCard(pending) + studentsCard(participants) + rosterCard();
  wireSettings();
  wireQueue();
  wireStudents();
  wireRoster();
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

// ── Approval queue (signal d) ────────────────────────────────────────────────
function queueCard(pending) {
  if (!pending.length) {
    return '<section class="cdx-alunos-card"><h2>' + esc(t('alunos.queue')) + '</h2><p class="cdx-alunos-empty">' + esc(t('alunos.queue_empty')) + '</p></section>';
  }
  const rows = pending.map((p) =>
    '<li class="cdx-al-qrow" data-id="' + p.id + '">' +
      '<span class="cdx-al-name">' + esc(p.display_name || p.name || p.email || ('#' + p.id)) + '</span>' +
      '<span class="cdx-al-email">' + esc(p.email || '') + '</span>' +
      '<span class="cdx-al-qact">' +
        '<button type="button" class="cdx-btn cdx-al-approve">' + esc(t('alunos.approve')) + '</button>' +
        '<button type="button" class="cdx-btn cdx-btn-ghost cdx-al-deny">' + esc(t('alunos.deny')) + '</button>' +
      '</span>' +
    '</li>').join('');
  return '<section class="cdx-alunos-card"><h2>' + esc(t('alunos.queue')) + ' (' + pending.length + ')</h2>' +
    '<button type="button" class="cdx-btn cdx-al-approve-all">' + esc(t('alunos.approve_all')) + '</button>' +
    '<ul class="cdx-al-list">' + rows + '</ul></section>';
}
function wireQueue() {
  const all = body().querySelector('.cdx-al-approve-all');
  if (all) all.addEventListener('click', async () => {
    const ids = [...body().querySelectorAll('.cdx-al-qrow')].map((li) => Number(li.dataset.id));
    if (!ids.length) return;
    all.disabled = true;
    body().querySelectorAll('.cdx-al-approve, .cdx-al-deny').forEach((b) => { b.disabled = true; });
    await safe(() => api.setParticipantAccess({ participant_ids: ids, status: 'approved' }));
    loadTurma();
  });
  body().querySelectorAll('.cdx-al-qrow').forEach((li) => {
    const id = Number(li.dataset.id);
    const ap = li.querySelector('.cdx-al-approve');
    const dn = li.querySelector('.cdx-al-deny');
    if (ap) ap.addEventListener('click', async () => { ap.disabled = true; await safe(() => api.setParticipantAccess({ participant_id: id, status: 'approved' })); loadTurma(); });
    if (dn) dn.addEventListener('click', async () => { dn.disabled = true; await safe(() => api.setParticipantAccess({ participant_id: id, status: 'denied' })); loadTurma(); });
  });
}

// ── Students list (status + session revocation) ──────────────────────────────
function statusBadge(p) {
  const s = p.access_status || 'pending';
  return '<span class="cdx-al-badge cdx-al-badge--' + s + '">' + esc(t('alunos.status_' + s)) + '</span>';
}
function studentsCard(participants) {
  if (!participants.length) {
    return '<section class="cdx-alunos-card"><h2>' + esc(t('alunos.students')) + '</h2><p class="cdx-alunos-empty">' + esc(t('alunos.students_empty')) + '</p></section>';
  }
  const rows = participants.map((p) => {
    const online = (p.active_sessions || 0) > 0;
    const via = p.approved_via ? '<span class="cdx-al-via">' + esc(t('alunos.via_' + p.approved_via)) + '</span>' : '<span class="cdx-al-via"></span>';
    return '<li class="cdx-al-srow" data-id="' + p.id + '">' +
      '<span class="cdx-al-name">' + esc(p.display_name || p.name || ('#' + p.id)) +
        (online ? ' <span class="cdx-al-online" title="' + esc(t('alunos.online')) + '">●</span>' : '') + '</span>' +
      '<span class="cdx-al-email">' + esc(p.email || '') + '</span>' +
      statusBadge(p) + via +
      (online ? '<button type="button" class="cdx-btn cdx-btn-ghost cdx-al-revoke">' + esc(t('alunos.revoke')) + '</button>' : '<span></span>') +
    '</li>';
  }).join('');
  return '<section class="cdx-alunos-card"><h2>' + esc(t('alunos.students')) + ' (' + participants.length + ')</h2>' +
    '<ul class="cdx-al-list cdx-al-students">' + rows + '</ul></section>';
}
function wireStudents() {
  body().querySelectorAll('.cdx-al-srow').forEach((li) => {
    const id = Number(li.dataset.id);
    const rv = li.querySelector('.cdx-al-revoke');
    if (rv) rv.addEventListener('click', async () => { rv.disabled = true; await safe(() => api.revokeStudentSessions({ participant_id: id })); loadTurma(); });
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
