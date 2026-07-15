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
//                    named "teste"). The same three-state pill, one per row:
//                    apagar | não é teste | deixar assim.
//
// NOTHING IS DECIDED ON OPEN, in either section. The backend only ever SUGGESTS, and the suggestion
// is shown (a "sugerido" marker) rather than pre-selected, so a pair Élder never looked at is a pair
// nothing happens to.
//
// THREE buttons, and only one of them touches the database:
//   Cancelar           closes; nothing was staged, so nothing is lost.
//   Aceitar sugestões  FILLS IN our recommendation everywhere — every pair onto its suggested
//                      verdict, every test registration onto "apagar". Executes nothing.
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
//
// The radio is pre-checked to the suggestion so the survivor is ready the moment "mesclar" is picked
// — but the `is-on` HIGHLIGHT is not applied here, only by _syncPair once the pair really is merging.
// Painting one identity as chosen while the verdict still says "deixar assim" would contradict the
// one promise this modal makes: nothing is decided until you decide it.
function _option(s, side, idx, checked) {
  const ver = s.email_verified
    ? '<span class="cdx-al-val ok" title="' + esc(t('alunos.verified')) + '">✓</span>'
    : '<span class="cdx-al-val no" title="' + esc(t('alunos.unverified')) + '">•</span>';
  return '<label class="cdx-dup-opt">' +
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
        // The kept name, PREFILLED and editable (Élder, round 1: "sometimes you have a name that has
        // more parts than the other one, but the more complete one is not in Pascal case, so I can
        // quickly make it better and then just save that name. Same if there's a misspelling").
        // Picking a survivor refills it; typing over it wins. The radios choose which identity
        // survives, this fixes what it is called.
        '<div class="cdx-dup-final">' +
          '<label class="cdx-dup-final-l" for="dup-name-' + idx + '">' + esc(t('alunos.dup_final_name')) + '</label>' +
          '<input type="text" class="cdx-dup-name-in" id="dup-name-' + idx + '" autocomplete="off"' +
            ' value="' + esc(p.suggestion === 'keep_b' ? (p.b.name || p.b.email) : (p.a.name || p.a.email)) + '">' +
        '</div>' +
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

// THE SAME THREE-STATE VERDICT as a duplicate pair, because it is the same question asked once per
// row: [ apagar | não é teste | deixar assim ], defaulting to "deixar assim".
//
// It was a checkbox until Élder 2026-07-15: "falta um botão de dispensar e a pessoa não aparece ali
// mais." A checkbox only spans purge / not-yet: there was no way to tell the detector it was WRONG,
// so a real student called "Teste" came back every single time and the list could never reach zero.
// A list that is never empty stops being read, which is how a real deletion gets waved through.
//
// So "não é teste" is the exact analog of the pair's "não é a mesma" — a verdict that persists
// (ct_test_dismissed) — and once there is a third state, the control that fits is the pill Élder
// asked for three times, not a checkbox plus a button that could contradict it.
//
// No "sugerido" marker here, unlike the pairs. Everything listed is suggested for deletion (it would
// not be listed otherwise), so marking every row would say nothing.
export function testRowHtml(p, idx) {
  const seen = p.last_access_at
    ? t('alunos.test_seen').replace('{t}', relTime(p.last_access_at))
    : t('alunos.test_never');
  const opts = [
    { value: 'del',   label: t('alunos.test_v_delete') },
    { value: 'not',   label: t('alunos.test_v_not') },
    { value: 'leave', label: t('alunos.dup_v_leave') },
  ];
  return '<div class="cdx-test-row" data-id="' + esc(String(p.id)) + '" data-pids="' + esc((p.participant_ids || []).join(',')) + '">' +
      '<div class="cdx-test-main">' +
        '<div class="cdx-test-body">' +
          '<span class="cdx-test-name">' + esc(p.name || t('alunos.no_name')) + '</span>' +
          '<span class="cdx-test-mail">' + esc(p.email) + '</span>' +
          '<span class="cdx-test-meta">' + esc(p.turma_name || '') + ' · ' + esc(seen) + '</span>' +
        '</div>' +
        '<div class="cdx-test-why">' + _testReasons(p.reasons || {}) + '</div>' +
      '</div>' +
      segmentedHtml('test-' + idx, opts, 'leave') +
    '</div>';
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

  // Repaint one test row: which segment is live, and whether the row is dressed as a pending delete
  // (is-on) or a pending dismissal (is-off). Only "apagar" gets the danger colour — a dismissal is
  // the harmless verdict and must not look like the destructive one.
  function _syncTest(row) {
    const v = row.querySelector('input[name^=test-]:checked');
    const val = v ? v.value : 'leave';
    row.classList.toggle('is-on', val === 'del');
    row.classList.toggle('is-off', val === 'not');
    row.querySelectorAll('.cdx-seg-opt').forEach((c) => {
      const r = c.querySelector('input[type=radio]');
      c.classList.toggle('is-on', !!(r && r.checked));
    });
  }

  bd.addEventListener('change', (e) => {
    if (e.target.type !== 'radio') return;
    const testRow = e.target.closest('.cdx-test-row');
    if (testRow) { _syncTest(testRow); _syncApply(); return; }
    const pair = e.target.closest('.cdx-dup-pair');
    if (!pair) return;
    // Picking a survivor REFILLS the name field with that side's name: the radio says "start from
    // this one", and anything typed afterwards wins (verdicts() reads the field, never the dataset).
    if (String(e.target.name || '').startsWith('dup-')) {
      const inp = pair.querySelector('.cdx-dup-name-in');
      if (inp) inp.value = e.target.value === 'keep_b' ? pair.dataset.nameB : pair.dataset.nameA;
    }
    _syncPair(pair);
    _syncApply();
  });

  // Aplicar stays dead until SOMETHING is decided, in either section. That is the skip made visible:
  // with every row on "deixar assim" there is correctly nothing to do.
  function _syncApply() {
    const btn = bd.querySelector('#cdx-dup-apply');
    if (!btn) return;
    const decidedPair = !!bd.querySelector('.cdx-dup-pair input[name^=same-]:checked:not([value=leave])');
    const decidedTest = !!bd.querySelector('.cdx-test-row input[name^=test-]:checked:not([value=leave])');
    btn.disabled = !decidedPair && !decidedTest;
  }

  const verdicts = () => Array.prototype.slice.call(bd.querySelectorAll('.cdx-dup-pair')).map((el) => {
    const same = el.querySelector('input[name^=same-]:checked');
    const keep = el.querySelector('input[name^=dup-]:checked');
    const keepB = !!(keep && keep.value === 'keep_b');
    const inp = el.querySelector('.cdx-dup-name-in');
    // The FIELD is the name, not the radio: the radio only says which one it started from. An empty
    // field falls back to the picked side rather than saving a nameless person.
    const typed = inp ? String(inp.value || '').trim() : '';
    return {
      a: Number(el.dataset.a), b: Number(el.dataset.b),
      verdict: same ? same.value : 'leave',    // merge | not | leave
      keepB,
      name: typed || (keepB ? el.dataset.nameB : el.dataset.nameA),
    };
  });

  // Every test row's verdict, with the participant rows a deletion would have to remove.
  const testVerdicts = () => Array.prototype.slice.call(bd.querySelectorAll('.cdx-test-row')).map((el) => {
    const v = el.querySelector('input[name^=test-]:checked');
    return {
      id: Number(el.dataset.id),
      verdict: v ? v.value : 'leave',   // del | not | leave
      pids: String(el.dataset.pids || '').split(',').filter(Boolean).map(Number),
    };
  });

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
      // Refill the name from the suggested survivor — but NOT over a name he typed himself. Setting
      // .checked in code fires no change event, so this is also what keeps the field in step with the
      // radio here. "Aceitar sugestões" fills in decisions; it must not throw away his corrections.
      const inp = el.querySelector('.cdx-dup-name-in');
      const untouched = inp && (inp.value === el.dataset.nameA || inp.value === el.dataset.nameB);
      if (inp && untouched) inp.value = sug === 'keep_b' ? el.dataset.nameB : el.dataset.nameA;
      _syncPair(el);
    });
    Array.prototype.slice.call(bd.querySelectorAll('.cdx-test-row')).forEach((el) => {
      const seg = el.querySelector('input[name^=test-][value="del"]');
      if (seg) seg.checked = true;
      _syncTest(el);
    });
    _syncApply();
  }

  // Aplicar — THE one executor: merges, dismissals and deletions, whatever was decided, in one go.
  // A pair left on "deixar assim" and an unticked registration are skipped entirely: not merged, not
  // dismissed, not deleted. They come back next time, which is exactly what "deixar assim" means.
  async function apply() {
    const pairs = verdicts().filter((it) => it.verdict !== 'leave');
    const tests = testVerdicts().filter((it) => it.verdict !== 'leave');
    const dels = tests.filter((it) => it.verdict === 'del');
    if (!pairs.length && !tests.length) { closeModal(bd); return; }   // decided nothing -> did nothing
    // The only confirm in this modal, and only when it would DELETE: a merge can be undone by hand, a
    // dismissal is harmless, a purge is neither. It counts `dels`, not `tests` — asking "apagar 3
    // registros?" over two dismissals and one delete would train him to click through the one prompt
    // that matters.
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
    for (const it of tests) {
      try {
        if (it.verdict === 'not') {
          await api.dismissTestAccount({ student_id: it.id });
        } else {
          // Deleting the LAST participation purges the identity (and its aliases) with it, so there
          // is no separate "delete person" call to keep in step with this one.
          for (const pid of it.pids) await api.deleteParticipant({ id: pid });
        }
        done++;
      } catch (err) {
        notice.internal('limpeza: test registration verdict failed: ' + (err && err.message || err));
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
