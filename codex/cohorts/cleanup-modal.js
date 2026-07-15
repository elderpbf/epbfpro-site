// cohorts/cleanup-modal.js
// The "Limpeza" tool (track-28a2). Entry point is a button in the Alunos list carrying a
// notification-style counter of how much is waiting for a verdict (Élder).
//
// Élder 2026-07-15: "let's change the duplication name to cleanup, so the duplications stay the same
// and you can add a list of possible test registrations for deletion." So it now holds TWO sections
// that share one idea — the registry has junk in it and only Élder can say which — and nothing else:
//
//   DUPLICATAS       one person under two e-mails. a1 made same-e-mail duplicates impossible, so
//                    these are a typo, or a personal + work address. The backend SUGGESTS a verdict
//                    and it comes pre-selected; a wrong click here is cheap (a merge is undoable by
//                    hand, a dismissal only hides a suggestion).
//   REGISTROS DE TESTE  throwaway registrations (10 Minute Mail burners, @example.com seeds, rows
//                    named "teste"). NOTHING is pre-selected and the button is destructive: this
//                    delete purges the person's rows, sessions and identity, and nothing brings them
//                    back. The backend only points; Élder ticks.
//
// The asymmetry is the whole design: two sections, two opposite defaults, for two opposite costs of
// being wrong.
import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import * as toast from '../js/toast.js';
import * as notice from '../js/notice.js';
import { relTime } from '../js/rel-time.js';

// The list button + its counter badge: everything awaiting a verdict, both sections.
export function cleanupButtonHtml(dupeCount, testCount) {
  const n = Number(dupeCount || 0) + Number(testCount || 0);
  return '<button type="button" class="cdx-btn cdx-btn-sm cdx-al-dupes" id="cdx-al-dupes"' + (n ? '' : ' disabled') + '>' +
      esc(t('alunos.cleanup_btn')) +
      (n ? '<span class="cdx-al-dupes-n">' + n + '</span>' : '') +
    '</button>';
}

function _reasons(r) {
  const bits = [];
  if (r.nearEmail) bits.push(t('alunos.dup_r_near_email'));
  if (r.sameLocal) bits.push(t('alunos.dup_r_same_local'));
  if (r.sameName) bits.push(t('alunos.dup_r_same_name'));
  else if (r.nearName) bits.push(t('alunos.dup_r_near_name'));
  return bits.map((b) => '<span class="cdx-dup-reason">' + esc(b) + '</span>').join('');
}

// One stacked option per identity: the NAME is what is being chosen (some records carry a fuller
// name than others), and picking it also picks which identity survives.
function _option(s, side, idx, checked) {
  const ver = s.email_verified
    ? '<span class="cdx-al-val ok" title="' + esc(t('alunos.verified')) + '">✓</span>'
    : '<span class="cdx-al-val no" title="' + esc(t('alunos.unverified')) + '">•</span>';
  return '<label class="cdx-dup-opt' + (checked ? ' is-on' : '') + '">' +
      '<input type="radio" name="dup-' + idx + '" value="keep_' + side + '"' + (checked ? ' checked' : '') + '>' +
      '<span class="cdx-dup-body">' +
        '<span class="cdx-dup-name">' + esc(s.name || s.email) + ' ' + ver + '</span>' +
        '<span class="cdx-dup-mail">' + esc(s.email) + ' · ' + esc(t('alunos.dup_turmas').replace('{n}', Number(s.turma_count || 0))) + '</span>' +
      '</span>' +
    '</label>';
}

function _pairHtml(p, idx) {
  const sug = p.suggestion;
  // The verdict is binary: same person (then pick the name) or not. There is no "decide later",
  // closing the window already does that (Élder 2026-07-14).
  const same = sug !== 'not_dup';
  return '<div class="cdx-dup-pair" data-idx="' + idx + '" data-a="' + esc(String(p.a.id)) + '" data-b="' + esc(String(p.b.id)) + '"' +
      ' data-name-a="' + esc(p.a.name || p.a.email) + '" data-name-b="' + esc(p.b.name || p.b.email) + '">' +
      '<div class="cdx-dup-why">' + _reasons(p.reasons) + '</div>' +
      '<div class="cdx-dup-same">' +
        '<label><input type="radio" name="same-' + idx + '" value="same"' + (same ? ' checked' : '') + '> ' + esc(t('alunos.dup_same')) + '</label>' +
        '<label><input type="radio" name="same-' + idx + '" value="not"' + (same ? '' : ' checked') + '> ' + esc(t('alunos.dup_not_same')) + '</label>' +
      '</div>' +
      '<div class="cdx-dup-names"' + (same ? '' : ' hidden') + '>' +
        '<div class="cdx-dup-q">' + esc(t('alunos.dup_which_name')) + '</div>' +
        _option(p.a, 'a', idx, sug !== 'keep_b') +
        _option(p.b, 'b', idx, sug === 'keep_b') +
      '</div>' +
    '</div>';
}

// ── registros de teste ────────────────────────────────────────────────────────────
// Why this row is here, in Élder's words rather than the detector's. Every candidate shows at least
// one, so a deletion is never blind.
function _testReasons(r) {
  const bits = [];
  if (r.reservedDomain) bits.push(t('alunos.test_r_reserved'));
  if (r.gibberishLocal) bits.push(t('alunos.test_r_gibberish'));
  if (r.junkName) bits.push(t('alunos.test_r_junk_name'));
  return bits.map((b) => '<span class="cdx-dup-reason">' + esc(b) + '</span>').join('');
}

// Unchecked by DEFAULT and never pre-selected — the opposite of the duplicates section above, because
// this button purges a person for good. Élder: "do nothing should be the default, so I can choose to
// do something about it."
export function testRowHtml(p) {
  const seen = p.last_access_at
    ? t('alunos.test_seen').replace('{t}', relTime(p.last_access_at))
    : t('alunos.test_never');
  return '<label class="cdx-test-row" data-id="' + esc(String(p.id)) + '" data-pids="' + esc((p.participant_ids || []).join(',')) + '">' +
      '<input type="checkbox" class="cdx-test-chk">' +
      '<span class="cdx-test-body">' +
        '<span class="cdx-test-name">' + esc(p.name || t('alunos.no_name')) + '</span>' +
        '<span class="cdx-test-mail">' + esc(p.email) + '</span>' +
        '<span class="cdx-test-meta">' + esc(p.turma_name || '') + ' · ' + esc(seen) + '</span>' +
      '</span>' +
      '<span class="cdx-test-why">' + _testReasons(p.reasons || {}) + '</span>' +
    '</label>';
}

function _sectionHtml(title, count, inner) {
  return '<div class="cdx-clean-sec">' +
      '<div class="cdx-clean-h">' + esc(title) + '<span class="cdx-clean-n">' + count + '</span></div>' +
      inner +
    '</div>';
}

// data: { pairs: [{ a, b, reasons, suggestion }], tests: [{ id, email, name, participant_ids, reasons }] }
// from ct_find_duplicates + ct_find_test_accounts. onDone() reloads the roster.
export function openCleanupModal(data, onDone) {
  const list = (data && data.pairs) || [];
  const tests = (data && data.tests) || [];
  const dupBody = list.length
    ? list.map(_pairHtml).join('')
    : '<div class="cdx-empty">' + esc(t('alunos.dupes_none')) + '</div>';
  const testBody = tests.length
    ? '<p class="cdx-helper-text">' + esc(t('alunos.tests_hint')) + '</p>' +
      '<div class="cdx-test-list">' + tests.map(testRowHtml).join('') + '</div>'
    : '<div class="cdx-empty">' + esc(t('alunos.tests_none')) + '</div>';
  const html =
    '<div class="cdx-modal cdx-modal--lg cdx-dup-modal">' +
      '<div class="cdx-modal-title">' + esc(t('alunos.cleanup_title')) + '</div>' +
      // ONE scroller for both sections. Two sections each scrolling on their own pushed the title
      // and the buttons off the screen — including the delete button, on the one modal where the
      // buttons are the point. The title and actions stay pinned; only this scrolls.
      '<div class="cdx-clean-body">' +
        _sectionHtml(t('alunos.sec_dupes'), list.length,
          (list.length ? '<p class="cdx-helper-text">' + esc(t('alunos.dupes_hint')) + '</p>' : '') +
          '<div class="cdx-dup-list">' + dupBody + '</div>') +
        _sectionHtml(t('alunos.sec_tests'), tests.length, testBody) +
      '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-dup-cancel">' + esc(t('cohorts.cancel')) + '</button>' +
        (tests.length ? '<button class="cdx-btn cdx-btn-danger" id="cdx-test-del" disabled>' + esc(t('alunos.test_delete')) + '</button>' : '') +
        (list.length ? '<button class="cdx-btn" id="cdx-dup-all">' + esc(t('alunos.dup_accept_all')) + '</button>' : '') +
        (list.length ? '<button class="cdx-btn cdx-btn-primary" id="cdx-dup-apply">' + esc(t('alunos.dup_apply')) + '</button>' : '') +
      '</div>' +
    '</div>';
  const bd = openModal(html, { disableBackdropClose: true });

  // Same/not-same reveals or hides the name choice; the picked name highlights. Ticking a test row
  // arms the delete button — it stays disabled while nothing is selected, so the destructive button
  // is never live by default.
  bd.addEventListener('change', (e) => {
    if (e.target.classList.contains('cdx-test-chk')) {
      const del = bd.querySelector('#cdx-test-del');
      if (del) del.disabled = !bd.querySelector('.cdx-test-chk:checked');
      const row = e.target.closest('.cdx-test-row');
      if (row) row.classList.toggle('is-on', e.target.checked);
      return;
    }
    if (e.target.type !== 'radio') return;
    const pair = e.target.closest('.cdx-dup-pair');
    if (!pair) return;
    const same = pair.querySelector('input[name^=same-]:checked');
    const names = pair.querySelector('.cdx-dup-names');
    if (names) names.hidden = !(same && same.value === 'same');
    pair.querySelectorAll('.cdx-dup-opt').forEach((c) => {
      const r = c.querySelector('input[type=radio]');
      c.classList.toggle('is-on', !!(r && r.checked));
    });
  });

  const verdicts = () => Array.prototype.slice.call(bd.querySelectorAll('.cdx-dup-pair')).map((el) => {
    const same = el.querySelector('input[name^=same-]:checked');
    const keep = el.querySelector('input[name^=dup-]:checked');
    const keepB = !!(keep && keep.value === 'keep_b');
    return {
      a: Number(el.dataset.a), b: Number(el.dataset.b),
      same: !!(same && same.value === 'same'),
      keepB,
      name: keepB ? el.dataset.nameB : el.dataset.nameA,
    };
  });

  async function apply(all) {
    let items = verdicts();
    if (all) {
      // "Aceitar todas": force every pair back to the suggestion we shipped it with.
      items = items.map((it, i) => {
        const sug = list[i] && list[i].suggestion;
        if (!sug) return it;
        const keepB = sug === 'keep_b';
        return { ...it, same: sug !== 'not_dup', keepB, name: keepB ? list[i].b.name || list[i].b.email : list[i].a.name || list[i].a.email };
      });
    }
    const btns = bd.querySelectorAll('.cdx-modal-actions button');
    btns.forEach((b) => { b.disabled = true; });
    let done = 0;
    // Sequential: a merge deletes an identity, so a later pair may reference something that is
    // already gone. The backend answers 'student not found' for those; we skip them quietly.
    for (const it of items) {
      try {
        if (!it.same) {
          await api.dismissDuplicate({ a_student_id: it.a, b_student_id: it.b });
        } else {
          const survivor = it.keepB ? it.b : it.a;
          const loser = it.keepB ? it.a : it.b;
          await api.mergeStudents({ survivor_id: survivor, loser_id: loser, name: it.name });
        }
        done++;
      } catch (err) {
        notice.internal('alunos: duplicate resolution failed: ' + (err && err.message || err));
      }
    }
    closeModal(bd);
    toast.ok(t('alunos.dup_applied').replace('{n}', done));
    if (onDone) onDone();
  }

  // The checked test registrations, each with the participant rows that have to go.
  const selectedTests = () => Array.prototype.slice.call(bd.querySelectorAll('.cdx-test-row'))
    .filter((el) => { const c = el.querySelector('.cdx-test-chk'); return c && c.checked; })
    .map((el) => ({ id: Number(el.dataset.id), pids: String(el.dataset.pids || '').split(',').filter(Boolean).map(Number) }));

  async function deleteTests() {
    const items = selectedTests();
    if (!items.length) return;
    // Named confirmation, not a generic one: this purges people, and the count is the thing to check
    // before saying yes. Deliberately the ONLY confirm in this modal — merges are recoverable by
    // hand, this is not.
    if (typeof confirm === 'function' && !confirm(t('alunos.test_delete_confirm').replace('{n}', items.length))) return;
    const btns = bd.querySelectorAll('.cdx-modal-actions button');
    btns.forEach((b) => { b.disabled = true; });
    let done = 0;
    for (const it of items) {
      try {
        // Deleting the LAST participation purges the identity (and its aliases) with it, so there is
        // no separate "delete person" call to keep in step with this one.
        for (const pid of it.pids) await api.deleteParticipant({ id: pid });
        done++;
      } catch (err) {
        notice.internal('limpeza: delete test account failed: ' + (err && err.message || err));
      }
    }
    closeModal(bd);
    toast.ok(t('alunos.test_deleted').replace('{n}', done));
    if (onDone) onDone();
  }

  bd.querySelector('#cdx-dup-cancel').addEventListener('click', () => closeModal(bd));
  const allBtn = bd.querySelector('#cdx-dup-all');
  if (allBtn) allBtn.addEventListener('click', () => apply(true));
  const applyBtn = bd.querySelector('#cdx-dup-apply');
  if (applyBtn) applyBtn.addEventListener('click', () => apply(false));
  const delBtn = bd.querySelector('#cdx-test-del');
  if (delBtn) delBtn.addEventListener('click', () => deleteTests());
  return bd;
}
