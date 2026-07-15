// cohorts/person-legend.js
// The legend for THE people list — the reference card behind the "?" glyph, on BOTH surfaces.
//
// Élder 2026-07-15: "let's put the legend back on both people and participant lists, it's useful 3
// months from now when I forget what we did; just a ? glyph besides Alunos."
//
// WHY ITS OWN MODULE: two surfaces open it (the Usuários roster and the turma dossiê). The old one
// was a private function inside cohorts.js, so the roster had no legend at all — and importing a
// private from cohorts.js, or copying it, is exactly the two-implementations-of-one-thing that
// produced two disagreeing renderers for one list. One module, one card, both scopes.
//
// It is NOT the old card moved over. That one predates the validação and acesso columns and the
// three-concepts framing, so it explained a list that no longer exists. This one explains the list
// as it is now, and the wording tracks manifest/architecture/access.md §"Os 3 conceitos" — the
// words come from access-model.js and the SWATCHES from the real badge classes, so the card cannot
// drift from the rows it describes.

import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import { ORIGIN_I18N, ORIGIN_TONE } from '../js/access-model.js';

// The "?" beside the list title. Same glyph, same look, both scopes — from ONE builder, because a
// module whose whole reason to exist is "both surfaces share this" cannot have the dossiê hand-rolling
// its own copy next to it (it did, until an audit noticed).
//
// `hook` picks the delegation attribute, from a closed set: the roster listens on an id, the dossiê
// on its existing data-doss switch. That is the only thing that legitimately differs, so it is the
// only thing parameterised — and being a closed set, nothing can be injected through it.
export function legendButtonHtml(hook) {
  const h = hook === 'doss' ? 'data-doss="phelp"' : 'id="cdx-pl-help"';
  return '<button type="button" class="cdx-leg-btn" ' + h + ' title="' +
    esc(t('cohorts.phelp_title')) + '" aria-label="' + esc(t('cohorts.phelp_title')) + '">?</button>';
}

// A real badge, built the same way the rows build theirs — so a colour change (or the dot removal)
// reaches the legend without anyone remembering to update it.
function badge(origin) {
  const teal = origin === 'janela' ? ' style="--acc:var(--acc-teal)"' : '';
  return '<span class="cdx-badge ' + ORIGIN_TONE[origin] + '"' + teal + '>' + esc(t(ORIGIN_I18N[origin])) + '</span>';
}
function stateBadge(cls, key) {
  return '<span class="cdx-badge ' + cls + '">' + esc(t(key)) + '</span>';
}
function row(swatch, text) {
  return '<div class="cdx-leg-row"><span class="cdx-leg-sw">' + swatch + '</span>' +
    '<span class="cdx-leg-tx">' + esc(text) + '</span></div>';
}
function head(key) { return '<div class="cdx-leg-h">' + esc(t(key)) + '</div>'; }
function note(key) { return '<p class="cdx-leg-note">' + esc(t(key)) + '</p>'; }

export function openPersonLegend(cfg) {
  const c = cfg || {};
  const turmaScope = c.scope === 'turma';
  const html =
    '<div class="cdx-modal cdx-modal--lg cdx-leg-modal">' +
      '<div class="cdx-modal-title">' + esc(t('cohorts.phelp_title')) + '</div>' +
      '<div class="cdx-leg-body">' +

        // The three concepts FIRST. They are the thing that is genuinely hard to reconstruct months
        // later, and the reason the three columns exist at all (access.md §Os 3 conceitos).
        head('cohorts.phelp_concepts_h') +
        row('<span class="cdx-leg-word">' + esc(t('access.col_approval')) + '</span>', t('cohorts.phelp_c_approval')) +
        row('<span class="cdx-leg-word">' + esc(t('access.col_validation')) + '</span>', t('cohorts.phelp_c_validation')) +
        row('<span class="cdx-leg-word">' + esc(t('access.col_access')) + '</span>', t('cohorts.phelp_c_access')) +
        note('cohorts.phelp_c_note') +

        // Aprovação: an approved person shows WHERE it came from; anyone else shows the state.
        head('cohorts.phelp_origin_h') +
        row(badge('lista'), t('cohorts.phelp_lista')) +
        row(badge('janela'), t('cohorts.phelp_janela')) +
        row(badge('manual'), t('cohorts.phelp_manual')) +
        row(badge('emergencia'), t('cohorts.phelp_emergencia')) +
        row(stateBadge('cdx-badge-task', 'access.state_pending'), t('cohorts.phelp_pending')) +
        row(stateBadge('cdx-badge-danger', 'access.state_denied'), t('cohorts.phelp_denied')) +
        note('cohorts.phelp_approved_note') +

        // Validação: possession of the inbox. Alone it grants NOTHING — it only sets the duration.
        head('cohorts.phelp_val_h') +
        row('<span class="cdx-pl-val--ok">' + esc(t('access.validated')) + '</span>', t('cohorts.phelp_validado')) +
        row('<span class="cdx-pl-val--no">' + esc(t('access.unvalidated')) + '</span>', t('cohorts.phelp_nao_validado')) +

        // Acesso: the live session. It has a deadline and it expires.
        head('cohorts.phelp_acc_h') +
        row('<span class="cdx-pl-acc--ok">12d</span>', t('cohorts.phelp_acc_live')) +
        row('<span class="cdx-pl-acc--soon">8h</span>', t('cohorts.phelp_acc_soon')) +
        row('<span class="cdx-pl-acc--off">' + esc(t('access.lapsed')) + '</span>', t('cohorts.phelp_acc_lapsed')) +
        row('<span class="cdx-pl-acc--off">' + esc(t('access.never')) + '</span>', t('cohorts.phelp_acc_never')) +

        // The marks. These are the ones nobody reconstructs from memory.
        head('cohorts.phelp_marks_h') +
        // The fractions and the caret only exist where a person can hold more than one turma.
        (turmaScope ? '' :
          row('<span class="cdx-leg-word">2/2</span>', t('cohorts.phelp_frac')) +
          row('<span class="cdx-pl-caret">▸</span>', t('cohorts.phelp_caret'))) +
        row('<span class="cdx-pl-plus">+</span>', t('cohorts.phelp_plus')) +
        row('<span class="cdx-prow-conn ok">✓</span>', t('cohorts.phelp_connected')) +
        row('<span class="cdx-prow-conn no">✕</span>', t('cohorts.phelp_never')) +
        note('cohorts.phelp_hover_note') +

      '</div>' +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-phelp-close">' + esc(t('cohorts.close')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html);
  bd.querySelector('#cdx-phelp-close').addEventListener('click', () => closeModal(bd));
  return bd;
}
