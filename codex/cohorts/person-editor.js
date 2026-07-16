// cohorts/person-editor.js
// THE one "edit a person" flow (track-42). Both surfaces call it: the Usuários roster and the turma
// dossiê Participantes panel. Élder: "o modal de edição que aparece em usuários não é o mesmo que
// aparece em participantes dentro do dossiê; eles eram o mesmo até você duplicar."
//
// A person is ONE identity (ct_students), so this edits the IDENTITY from either place: the name is
// the LOCKED canonical (setCanonicalName), the e-mails are the box (setPersonEmails: line 1 is the
// primary, the rest are aliases), and the CPF is the person's, written to every one of their turma
// rows. The dossiê used to edit the participant ROW instead (ct_update_participant); unifying here
// makes both edit the person, which is what "uma pessoa, uma identidade" means.
import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import { openPersonEditModal, linesOf } from './participant-edit.js';
import { cpfValid, emailValid, wireCpfMask } from '../js/person-fields.js';

// PURE. The person's addresses as the box shows them: the primary FIRST, then the aliases. The
// order is the meaning, so it is not sorted (Élder: "o que é o principal é o primeiro da linha").
export function emailBoxValue(person) {
  const p = person || {};
  return [p.email, ...(p.aliases || [])].filter(Boolean).join('\n');
}

// person: a ct_list_people row (identity id + rows + aliases + cpf), the SAME shape both scopes
// hold. opts.onSaved runs after a successful write (the caller reloads its own list).
export function openPersonEditor(person, opts) {
  const o = opts || {};
  const s = person || {};
  openPersonEditModal({
    title: t('alunos.edit_title'),
    fields: [
      { key: 'name', label: t('cohorts.participant_name'), value: s.name || '', required: true,
        validate: (v) => (v ? null : t('cohorts.name_required')) },
      // The e-mail is a BOX, not a field: a person can answer to more than one address, and a single
      // field could not show the aliases they already have.
      { key: 'email', label: t('alunos.emails_label'), value: emailBoxValue(s), required: true,
        multiline: true, rows: 3, hint: t('alunos.emails_hint'),
        placeholder: t('cohorts.participant_email_ph'),
        validate: (v) => {
          const lines = linesOf(v);
          if (!lines.length) return t('cohorts.email_required');
          return lines.every(emailValid) ? null : t('cohorts.email_invalid');
        } },
      { key: 'cpf', label: t('cohorts.participant_cpf'), value: s.cpf || '', maxlength: 14,
        placeholder: t('cohorts.participant_cpf_ph'), onMount: (el) => wireCpfMask(el), secret: true,
        validate: (v) => (!v.replace(/\D/g, '') || cpfValid(v) ? null : t('cohorts.cpf_invalid')) },
    ],
    onSave: async (vals) => {
      await api.setCanonicalName({ student_id: s.id, name: vals.name });
      // One save for the whole box: line 1 is the identity key (rewritten on the identity AND every
      // row at once), the rest are aliases. Unchanged is a no-op server-side; skipping the call
      // keeps a pointless write out of the log.
      const emails = linesOf(vals.email).map((x) => x.toLowerCase());
      if (emails.join('\n') !== emailBoxValue(s).toLowerCase()) {
        const r = await api.setPersonEmails({ student_id: s.id, emails });
        if (r && r.error === 'email_belongs_to_another_person') { notice.warn(t('alunos.email_taken').replace('{email}', r.email || '')); return; }
        if (r && r.error) { notice.internal('pessoa: set e-mails: ' + r.error); return; }
        // Changing the PRIMARY resets validation — they proved a DIFFERENT inbox. Editing only
        // aliases proves nothing new, so the worker leaves the flag alone and this stays quiet.
        if (r && r.revalidation_required) toast.info(t('alunos.email_changed_revalidate'));
      }
      // The CPF is the person's, so it goes to every one of their turma rows, never one.
      const cpf = vals.cpf.replace(/\D/g, '') ? vals.cpf : null;
      if ((s.cpf || null) !== cpf) {
        for (const x of (s.rows || [])) await api.updateParticipant({ id: x.participant_id, cpf });
      }
      if (o.onSaved) await o.onSaved();
    },
    savedMsg: t('cohorts.participant_updated'),
  });
}
