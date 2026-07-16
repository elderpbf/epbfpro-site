// cohorts/participant-edit.js
// The ONE person-edit modal (track-28a2). Renders a small form from a field list and calls onSave.
// Two callers, no duplicated modal: the turma Participantes panel edits a participant ROW
// (name/email/cpf -> ct_update_participant); the Usuários roster edits the IDENTITY (name ->
// ct_set_canonical_name, e-mail box -> ct_set_person_emails). Each caller supplies the fields + an
// async onSave.
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import * as toast from '../js/toast.js';
import * as notice from '../js/notice.js';

// PURE. A `multiline` field's value, as the list it represents: one entry per line, blanks dropped.
// Owned by the field type so every consumer of a box parses it identically — the admin hitting
// Enter twice is not an empty entry, it is an admin hitting Enter twice.
export function linesOf(value) {
  return String(value == null ? '' : value).split('\n').map((s) => s.trim()).filter(Boolean);
}

// opts:
//   title
//   fields: [{ key, label, value, required, readonly, placeholder, maxlength, secret, multiline,
//              rows, hint, onMount(inputEl), validate(val) -> errMsg|null }]
//     secret:    render masked with an eye on the right that toggles visibility (CPF).
//     multiline: render a textarea instead of an input — one value per line (the e-mail box).
//                Mutually exclusive with secret; a masked textarea has no eye to hang on.
//     hint:      a line of help under the field, for a box whose rule is not self-evident.
//   onSave(values) -> Promise   (resolve closes the modal; reject shows a notice)
//   savedMsg
export function openPersonEditModal(opts) {
  const o = opts || {};
  const fields = o.fields || [];
  const fieldHtml = fields.map((f) => {
    const common =
      ' id="cdx-pe-' + esc(f.key) + '" autocomplete="off"' + (f.readonly ? ' readonly' : '') +
      (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') +
      (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '');
    const input = f.multiline
      ? '<textarea class="cdx-pe-lines" rows="' + (f.rows || 3) + '"' + common + '>' + esc(f.value == null ? '' : f.value) + '</textarea>'
      : '<input type="' + (f.secret ? 'password' : 'text') + '"' + common + ' value="' + esc(f.value == null ? '' : f.value) + '">';
    const wrapped = f.secret && !f.multiline
      ? '<div class="cdx-pe-secret">' + input +
          '<button type="button" class="cdx-pe-eye" data-eye="' + esc(f.key) + '" aria-label="' + esc(t('cohorts.toggle_visibility')) + '" title="' + esc(t('cohorts.toggle_visibility')) + '">👁</button>' +
        '</div>'
      : input;
    return '<div class="cdx-field"><label>' + esc(f.label) + (f.required ? ' <span class="cdx-required">*</span>' : '') + '</label>' + wrapped +
      (f.hint ? '<div class="cdx-pe-hint">' + esc(f.hint) + '</div>' : '') + '</div>';
  }).join('');
  const html =
    '<div class="cdx-modal cdx-modal--lg">' +
      '<div class="cdx-modal-title">' + esc(o.title || t('cohorts.participant_edit_title')) + '</div>' +
      fieldHtml +
      '<div class="cdx-modal-actions">' +
        '<button class="cdx-btn" id="cdx-pe-cancel">' + esc(t('cohorts.cancel')) + '</button>' +
        '<button class="cdx-btn cdx-btn-primary" id="cdx-pe-save">' + esc(t('cohorts.save')) + '</button>' +
      '</div>' +
    '</div>';
  const bd = openModal(html, { disableBackdropClose: true });
  fields.forEach((f) => { if (f.onMount) { const el = bd.querySelector('#cdx-pe-' + f.key); if (el) f.onMount(el); } });
  // Eye toggles for the masked fields (CPF): hidden by default, revealed on demand.
  bd.querySelectorAll('[data-eye]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault();
    const el = bd.querySelector('#cdx-pe-' + btn.dataset.eye);
    if (!el) return;
    const show = el.type === 'password';
    el.type = show ? 'text' : 'password';
    btn.classList.toggle('is-on', show);
  }));
  bd.querySelector('#cdx-pe-cancel').addEventListener('click', () => closeModal(bd));
  bd.querySelector('#cdx-pe-save').addEventListener('click', async () => {
    const values = {};
    for (const f of fields) {
      const el = bd.querySelector('#cdx-pe-' + f.key);
      const val = el ? el.value.trim() : '';
      if (f.validate) { const err = f.validate(val); if (err) { toast.err(err); if (el) el.focus(); return; } }
      values[f.key] = val;
    }
    try {
      await o.onSave(values);
      closeModal(bd);
      toast.ok(o.savedMsg || t('cohorts.participant_updated'));
    } catch (err) {
      notice.internal(t('cohorts.error') + ': ' + (err && err.message || err));
    }
  });
  return bd;
}
