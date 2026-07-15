// cohorts/dupes-modal.js
// The duplicate-resolution tool (track-28a2 stage 4). Entry point is a button in the Alunos list
// carrying a notification-style counter of how many possible duplicates await a verdict (Élder).
//
// a1 made same-e-mail duplicates impossible; these are ONE person under TWO e-mails (a typo, or a
// personal + work address). The backend only SUGGESTS; Élder decides each pair, one of three ways:
// keep #1 (absorb #2) / keep #2 (absorb #1) / não é a mesma pessoa. "Aceitar todas" applies every
// suggestion in one go. A dismissal is permanent and never resurfaces, so "decidir depois" exists
// to avoid ever forcing a verdict.
import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import * as toast from '../js/toast.js';
import * as notice from '../js/notice.js';

// The list button + its counter badge.
export function dupesButtonHtml(count) {
  const n = Number(count || 0);
  return '<button type="button" class="cdx-btn cdx-btn-sm cdx-al-dupes" id="cdx-al-dupes"' + (n ? '' : ' disabled') + '>' +
      esc(t('alunos.dupes_btn')) +
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

// pairs: [{ a, b, reasons, suggestion }] from ct_find_duplicates. onDone() reloads the roster.
export function openDupesModal(pairs, onDone) {
  const list = pairs || [];
  const body = list.length
    ? list.map(_pairHtml).join('')
    : '<div class="cdx-empty">' + esc(t('alunos.dupes_none')) + '</div>';
  const html =
    '<div class="cdx-modal cdx-modal--lg cdx-dup-modal">' +
      '<div class="cdx-modal-title">' + esc(t('alunos.dupes_title')) + '</div>' +
      (list.length ? '<p class="cdx-helper-text">' + esc(t('alunos.dupes_hint')) + '</p>' : '') +
      '<div class="cdx-dup-list">' + body + '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-dup-cancel">' + esc(t('cohorts.cancel')) + '</button>' +
        (list.length ? '<button class="cdx-btn" id="cdx-dup-all">' + esc(t('alunos.dup_accept_all')) + '</button>' : '') +
        (list.length ? '<button class="cdx-btn cdx-btn-primary" id="cdx-dup-apply">' + esc(t('alunos.dup_apply')) + '</button>' : '') +
      '</div>' +
    '</div>';
  const bd = openModal(html, { disableBackdropClose: true });

  // Same/not-same reveals or hides the name choice; the picked name highlights.
  bd.addEventListener('change', (e) => {
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

  bd.querySelector('#cdx-dup-cancel').addEventListener('click', () => closeModal(bd));
  const allBtn = bd.querySelector('#cdx-dup-all');
  if (allBtn) allBtn.addEventListener('click', () => apply(true));
  const applyBtn = bd.querySelector('#cdx-dup-apply');
  if (applyBtn) applyBtn.addEventListener('click', () => apply(false));
  return bd;
}
