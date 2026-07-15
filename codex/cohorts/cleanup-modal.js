// cohorts/cleanup-modal.js
// The "Limpeza" tool (track-28a2). Entry point is a button in the Alunos list carrying a
// notification-style counter of how much is waiting for a verdict (Élder).
//
// Élder 2026-07-15: "let's change the duplication name to cleanup, so the duplications stay the same
// and you can add a list of possible test registrations for deletion." So it now holds TWO sections
// that share one idea — the registry has junk in it and only Élder can say which — and nothing else:
//
//   DUPLICATAS       one person under two e-mails. a1 made same-e-mail duplicates impossible, so
//                    these are a typo, or a personal + work address. A three-state pill per pair:
//                    mesclar | não é a mesma | deixar assim.
//   REGISTROS DE TESTE  throwaway registrations (10 Minute Mail burners, @example.com seeds, rows
//                    named "teste"). Tick the ones to purge.
//
// NOTHING IS DECIDED ON OPEN, in either section. The backend only ever SUGGESTS, and the suggestion
// is shown (a "sugerido" marker) rather than pre-selected, so a pair Élder never looked at is a pair
// nothing happens to.
//
// THREE buttons, and only one of them touches the database:
//   Cancelar           closes; nothing was staged, so nothing is lost.
//   Aceitar sugestões  FILLS IN our recommendation everywhere — every pair onto its suggested
//                      verdict, every test registration ticked. Executes nothing.
//   Aplicar            THE executor: merges, dismissals and deletions, whatever is currently decided.
//                      Disabled until something is.
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

// A segmented control — one pill, N segments, exactly one live. Radios under the hood (so keyboard
// and screen readers get a real radiogroup for free), styled as a pill: Élder asked for a slider,
// not checkboxes. Exported because the shape is general, not a duplicates detail.
export function segmentedHtml(name, options, selected) {
  return '<div class="cdx-seg" role="radiogroup">' + options.map((o) =>
    '<label class="cdx-seg-opt' + (o.value === selected ? ' is-on' : '') + '">' +
      '<input type="radio" name="' + esc(name) + '" value="' + esc(o.value) + '"' +
        (o.value === selected ? ' checked' : '') + '>' +
      '<span>' + esc(o.label) +
        (o.hint ? '<i class="cdx-seg-sug">' + esc(o.hint) + '</i>' : '') +
      '</span>' +
    '</label>').join('') + '</div>';
}

// THE THREE-STATE VERDICT (Élder, asked three times before I built it):
// [ mesclar | não é a mesma | deixar assim ], and "deixar assim" is the DEFAULT.
//
// The old binary pre-selected the backend's suggestion, which had two consequences Élder called out:
// there was no way to SKIP a pair (apply hit all of them), and so "Aplicar" and "Aceitar todas as
// sugestões" did the same thing. With "deixar assim" as the default, the two buttons finally differ:
// Aplicar touches only the pairs he actually decided; Aceitar todas forces every pair to its
// suggestion. Nothing happens to a pair he did not look at.
//
// The suggestion is still SHOWN (a "sugerido" marker on its segment) — it is no longer pre-selected,
// so without the marker "aceitar todas" would be a black box.
export function pairHtml(p, idx) {
  const sug = p.suggestion === 'not_dup' ? 'not' : 'merge';
  const opts = [
    { value: 'merge', label: t('alunos.dup_v_merge'), hint: sug === 'merge' ? t('alunos.dup_suggested') : '' },
    { value: 'not',   label: t('alunos.dup_v_not'),   hint: sug === 'not' ? t('alunos.dup_suggested') : '' },
    { value: 'leave', label: t('alunos.dup_v_leave') },
  ];
  return '<div class="cdx-dup-pair" data-idx="' + idx + '" data-a="' + esc(String(p.a.id)) + '" data-b="' + esc(String(p.b.id)) + '"' +
      ' data-name-a="' + esc(p.a.name || p.a.email) + '" data-name-b="' + esc(p.b.name || p.b.email) + '">' +
      '<div class="cdx-dup-why">' + _reasons(p.reasons) + '</div>' +
      segmentedHtml('same-' + idx, opts, 'leave') +
      // ALWAYS visible: WHO the pair is. Hiding the two identities behind the "mesclar" state left a
      // pair showing nothing but its reason chip and the pill — impossible to judge, since the whole
      // question is "are these two the same person" and the two people were exactly what was missing.
      // Only the CHOICE of survivor is gated (the .is-merging class below): the names are information,
      // picking one is a decision.
      '<div class="cdx-dup-names">' +
        '<div class="cdx-dup-q">' + esc(t('alunos.dup_which_name')) + '</div>' +
        _option(p.a, 'a', idx, p.suggestion !== 'keep_b') +
        _option(p.b, 'b', idx, p.suggestion === 'keep_b') +
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
    ? list.map(pairHtml).join('')
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
      // THREE buttons, not four (Élder: "no need for an 'apagar selecionados' button — if it's
      // choosing people to be deleted, apply just does that"). Aplicar is the ONE executor: it
      // merges, dismisses and deletes, whatever was decided. Aceitar sugestões only FILLS IN the
      // suggestion everywhere — including ticking the test registrations — and executes nothing, so
      // there is always a look before the leap.
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-dup-cancel">' + esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn" id="cdx-dup-all">' + esc(t('alunos.dup_accept_all')) + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-dup-apply" disabled>' + esc(t('alunos.dup_apply')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html, { disableBackdropClose: true });

  // Repaint one pair: which segment is live, whether the survivor is choosable, which name is picked.
  function _syncPair(pair) {
    const same = pair.querySelector('input[name^=same-]:checked');
    const merging = !!(same && same.value === 'merge');
    // The identities stay VISIBLE either way — only picking between them is a "mesclar" thing.
    pair.classList.toggle('is-merging', merging);
    pair.querySelectorAll('.cdx-seg-opt').forEach((c) => {
      const r = c.querySelector('input[type=radio]');
      c.classList.toggle('is-on', !!(r && r.checked));
    });
    pair.querySelectorAll('.cdx-dup-opt').forEach((c) => {
      const r = c.querySelector('input[type=radio]');
      c.classList.toggle('is-on', merging && !!(r && r.checked));
    });
  }

  bd.addEventListener('change', (e) => {
    if (e.target.classList.contains('cdx-test-chk')) {
      const row = e.target.closest('.cdx-test-row');
      if (row) row.classList.toggle('is-on', e.target.checked);
      _syncApply();
      return;
    }
    if (e.target.type !== 'radio') return;
    const pair = e.target.closest('.cdx-dup-pair');
    if (!pair) return;
    _syncPair(pair);
    _syncApply();
  });

  // Aplicar stays dead until SOMETHING is decided, in either section. That is the skip made visible:
  // with every pair on "deixar assim" and no registration ticked, there is correctly nothing to do.
  function _syncApply() {
    const btn = bd.querySelector('#cdx-dup-apply');
    if (!btn) return;
    const decidedPair = !!bd.querySelector('.cdx-dup-pair input[name^=same-]:checked:not([value=leave])');
    const tickedTest = !!bd.querySelector('.cdx-test-chk:checked');
    btn.disabled = !decidedPair && !tickedTest;
  }

  const verdicts = () => Array.prototype.slice.call(bd.querySelectorAll('.cdx-dup-pair')).map((el) => {
    const same = el.querySelector('input[name^=same-]:checked');
    const keep = el.querySelector('input[name^=dup-]:checked');
    const keepB = !!(keep && keep.value === 'keep_b');
    return {
      a: Number(el.dataset.a), b: Number(el.dataset.b),
      verdict: same ? same.value : 'leave',    // merge | not | leave
      keepB,
      name: keepB ? el.dataset.nameB : el.dataset.nameA,
    };
  });

  // The ticked test registrations, each with the participant rows that have to go.
  const selectedTests = () => Array.prototype.slice.call(bd.querySelectorAll('.cdx-test-row'))
    .filter((el) => { const c = el.querySelector('.cdx-test-chk'); return c && c.checked; })
    .map((el) => ({ id: Number(el.dataset.id), pids: String(el.dataset.pids || '').split(',').filter(Boolean).map(Number) }));

  // "Aceitar sugestões" FILLS IN, it does not execute (Élder: "apply just does that"). It moves every
  // pair onto its suggested verdict and ticks every test registration — our recommendation for those
  // is always "apagar", they would not be listed otherwise. Then he looks, changes his mind wherever
  // he likes, and Aplicar is still the only thing that touches the database.
  function acceptSuggestions() {
    Array.prototype.slice.call(bd.querySelectorAll('.cdx-dup-pair')).forEach((el, i) => {
      const sug = list[i] && list[i].suggestion;
      if (!sug) return;
      const want = sug === 'not_dup' ? 'not' : 'merge';
      const seg = el.querySelector('input[name^=same-][value="' + want + '"]');
      if (seg) seg.checked = true;
      const keep = el.querySelector('input[name^=dup-][value="keep_' + (sug === 'keep_b' ? 'b' : 'a') + '"]');
      if (keep) keep.checked = true;
      _syncPair(el);
    });
    Array.prototype.slice.call(bd.querySelectorAll('.cdx-test-row')).forEach((el) => {
      const c = el.querySelector('.cdx-test-chk');
      if (c) { c.checked = true; el.classList.add('is-on'); }
    });
    _syncApply();
  }

  // Aplicar — THE one executor: merges, dismissals and deletions, whatever was decided, in one go.
  // A pair left on "deixar assim" and an unticked registration are skipped entirely: not merged, not
  // dismissed, not deleted. They come back next time, which is exactly what "deixar assim" means.
  async function apply() {
    const pairs = verdicts().filter((it) => it.verdict !== 'leave');
    const dels = selectedTests();
    if (!pairs.length && !dels.length) { closeModal(bd); return; }   // decided nothing -> did nothing
    // The only confirm in this modal, and only when it would delete: a merge can be undone by hand,
    // a purge cannot. The count is the thing worth checking before saying yes.
    if (dels.length && typeof confirm === 'function' &&
        !confirm(t('alunos.test_delete_confirm').replace('{n}', dels.length))) return;
    bd.querySelectorAll('.cdx-modal-actions button').forEach((b) => { b.disabled = true; });
    let done = 0;
    // Sequential: a merge deletes an identity, so a later pair may reference something that is
    // already gone. The backend answers 'student not found' for those; we skip them quietly.
    for (const it of pairs) {
      try {
        if (it.verdict === 'not') {
          await api.dismissDuplicate({ a_student_id: it.a, b_student_id: it.b });
        } else {
          const survivor = it.keepB ? it.b : it.a;
          const loser = it.keepB ? it.a : it.b;
          await api.mergeStudents({ survivor_id: survivor, loser_id: loser, name: it.name });
        }
        done++;
      } catch (err) {
        notice.internal('limpeza: duplicate resolution failed: ' + (err && err.message || err));
      }
    }
    // Deletions LAST: a merge may have folded one of these rows into another identity, so running
    // them first would delete rows the merges still need.
    for (const it of dels) {
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
    toast.ok(t('alunos.dup_applied').replace('{n}', done));
    if (onDone) onDone();
  }

  bd.querySelector('#cdx-dup-cancel').addEventListener('click', () => closeModal(bd));
  const allBtn = bd.querySelector('#cdx-dup-all');
  if (allBtn) allBtn.addEventListener('click', () => acceptSuggestions());
  const applyBtn = bd.querySelector('#cdx-dup-apply');
  if (applyBtn) applyBtn.addEventListener('click', () => apply());
  return bd;
}
