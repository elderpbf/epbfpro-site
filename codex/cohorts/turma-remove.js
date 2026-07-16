// cohorts/turma-remove.js
// "Remover" in the turma dossiê (track-42, Élder 2026-07-16, option B). Removing someone from a
// turma is not one act:
//   - in their ONLY turma, removing them here removes them entirely, so the decision is total and it
//     opens the same completa/anonimizar modal the Usuários roster uses (erase-modal.js) — nobody is
//     left in the content under their real name while the record is deleted;
//   - in one of SEVERAL turmas it ASKS: take them out of this turma only (a plain detach, they stay
//     in the others) or out of all of them (again completa/anonimizar).
//
// Two invariants, both things Élder said in his own words:
//   1. "se tem mais de uma turma, é só perguntar" — the question is asked for EVERY 2+-turma removal,
//      single or batch. It is never narrowed to single-selection, so a bulk remove can never detach
//      people silently.
//   2. A person in a single turma is NEVER detached silently. That path — the plain delete that
//      purges the childless identity while leaving the name in submissions / Perguntas — is the bug
//      option B removes.
import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import { applyRosterAction } from './roster-actions.js';
import { openEraseModal } from './erase-modal.js';

function _turmaLabel(x) {
  return (x.client_slug ? x.client_slug + ' | ' : '') + (x.turma_name || x.turma_slug || '');
}

// PURE. What removing this person from the current turma means, given the turmas they belong to:
//   'detach' — an identity-less roster row (no e-mail, so nothing to anonymise and only ever here);
//   'erase'  — this is their only turma (or the count lookup failed): the removal is total, so it
//              must go through the completa/anonimizar modal, never a blind detach;
//   'ask'    — they are in 2+ turmas: ask this-turma-or-all first.
// It deliberately does NOT see the selection size: the question is asked for a batch exactly as for a
// single person, so there is no back door that skips it.
export function classifyRemoval(person, turmas) {
  if (!person || person.id == null) return 'detach';
  if (!turmas || turmas.length <= 1) return 'erase';
  return 'ask';
}

// Ask, for the 2+-turma people in the selection, whether to remove from this turma only or from all.
// Resolves to 'this' | 'all' | null (cancel). A genuine three-way choice, so a small modal — a
// yes/no dialog could not carry the third outcome. One person shows their turmas; a batch shows the
// count.
function _askScope(people, turmasById) {
  return new Promise((resolve) => {
    const single = people.length === 1;
    const turmas0 = (single && turmasById) ? (turmasById.get(people[0].id) || []) : [];
    const msg = single
      ? t('alunos.remove_scope_msg')
          .replace('{name}', people[0].name || people[0].email || '?')
          .replace('{n}', String(turmas0.length))
      : t('alunos.remove_scope_msg_many').replace('{n}', String(people.length));
    const items = single ? turmas0.map((x) => '<li>' + esc(_turmaLabel(x)) + '</li>').join('') : '';
    const html =
      '<div class="cdx-modal">' +
        '<div class="cdx-modal-title">' + esc(t('alunos.remove_scope_title')) + '</div>' +
        '<div class="cdx-rs-msg">' + esc(msg) + '</div>' +
        (items ? '<ul class="cdx-rs-turmas">' + items + '</ul>' : '') +
        '<div class="cdx-modal-actions">' +
          '<button class="cdx-btn" data-scope="cancel">' + esc(t('cohorts.cancel')) + '</button>' +
          '<button class="cdx-btn" data-scope="this">' + esc(t('alunos.remove_scope_this')) + '</button>' +
          '<button class="cdx-btn cdx-btn-danger" data-scope="all">' + esc(t('alunos.remove_scope_all')) + '</button>' +
        '</div>' +
      '</div>';
    const bd = openModal(html, { disableBackdropClose: true });
    bd.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('[data-scope]');
      if (!b) return;
      const v = b.dataset.scope;
      closeModal(bd);
      resolve(v === 'cancel' ? null : v);
    });
  });
}

// people: the selected ct_list_people rows for THIS turma. onDone() reloads the panel.
export async function removeFromTurma(people, turma, opts) {
  const done = (opts && opts.onDone) || (() => {});
  const list = (people || []).filter((p) => p && (p.rows || []).length);
  if (!list.length) return;
  const thisPid = (p) => Number((((p.rows || [])[0]) || {}).participant_id) || null;

  const withId = list.filter((p) => p.id != null);
  const idLess = list.filter((p) => p.id == null);

  // How many turmas each identity is in (+ names for the question). If the lookup fails, turmasById
  // stays null and classifyRemoval fails safe to the erase modal, never a blind detach.
  let turmasById = new Map();
  if (withId.length) {
    try {
      const r = await api.personTurmas({ student_ids: withId.map((p) => p.id) });
      for (const row of (r && r.people) || []) turmasById.set(row.student_id, row.turmas || []);
    } catch (e) {
      turmasById = null;
      if (window.bsLog) window.bsLog('turma-remove: person_turmas failed: ' + (e && e.message || e), 'error');
    }
  }

  const detachPids = [];
  const eraseList = [];
  const askList = [];
  for (const p of withId) {
    const turmas = turmasById ? (turmasById.get(p.id) || []) : null;
    (classifyRemoval(p, turmas) === 'ask' ? askList : eraseList).push(p);
  }

  // 2+ turmas: ask once for the whole selection (single or batch). Cancelling aborts everything.
  if (askList.length) {
    const scope = await _askScope(askList, turmasById);
    if (scope == null) return;
    if (scope === 'all') for (const p of askList) eraseList.push(p);
    else for (const p of askList) { const pid = thisPid(p); if (pid) detachPids.push(pid); }
  }

  // Identity-less roster rows: a plain detach, but confirmed, like every removal (the old flow
  // confirmed each one). None exist today; this keeps that behaviour if one ever does.
  if (idLess.length && (typeof confirm !== 'function' || confirm(t('alunos.remove_confirm_simple')))) {
    for (const p of idLess) { const pid = thisPid(p); if (pid) detachPids.push(pid); }
  }

  if (detachPids.length) {
    try { await applyRosterAction('remove', detachPids); }
    catch (e) { if (window.bsLog) window.bsLog('turma-remove: detach failed: ' + (e && e.message || e), 'error'); }
  }
  if (eraseList.length) {
    if (detachPids.length) done();   // reflect the detach in the list before the erase modal takes over
    openEraseModal(eraseList.map((p) => ({ id: p.id, name: p.name, email: p.email })), done);
  } else if (detachPids.length) {
    done();
  }
}
