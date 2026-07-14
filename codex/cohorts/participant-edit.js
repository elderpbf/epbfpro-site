// cohorts/participant-edit.js
// The ONE person-edit modal (track-28a2). Renders a small form from a field list and calls onSave.
// Two callers, no duplicated modal: the turma Participantes panel edits a participant ROW
// (name/email/cpf -> ct_update_participant); the Alunos roster edits the IDENTITY (name ->
// ct_set_canonical_name, e-mail read-only). Each caller supplies the fields + an async onSave.
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { openModal, closeModal } from '../js/modal.js';
import * as toast from '../js/toast.js';
import * as notice from '../js/notice.js';

// opts:
//   title
//   fields: [{ key, label, value, required, readonly, placeholder, maxlength,
//              onMount(inputEl), validate(val) -> errMsg|null }]
//   onSave(values) -> Promise   (resolve closes the modal; reject shows a notice)
//   savedMsg
export function openPersonEditModal(opts) {
  const o = opts || {};
  const fields = o.fields || [];
  const fieldHtml = fields.map((f) =>
    '<div class="cdx-field"><label>' + esc(f.label) + (f.required ? ' <span class="cdx-required">*</span>' : '') + '</label>' +
      '<input type="text" id="cdx-pe-' + esc(f.key) + '" autocomplete="off" value="' + esc(f.value == null ? '' : f.value) + '"' +
        (f.readonly ? ' readonly' : '') + (f.maxlength ? ' maxlength="' + f.maxlength + '"' : '') +
        (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '></div>'
  ).join('');
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
