// codex/trilha/js/tarefa-submit-modal.js
// Student-side tarefa submit modal (cdx- port of the legacy CTTarefaSubmitModal
// global). Emits the SAME tr-modal* / tr-tarefa* markup the Trail's
// tarefa-modal.css already styles, so the modal looks identical; only the code
// shape changed. Backend goes through the Trail facade (trail.submitTarefa),
// never raw callWorker. Instructions preview reuses the Codex item renderer; the
// answer field comes from the Codex tarefa-fields registry.
//
// Public API: openTarefaSubmitModal({ item, clientSlug, turmaSlug, token, onSubmitted, editing })
// `editing` ({ id, answer_json, anon }) switches the modal to EDIT mode for an entrega
// (submission) that already exists: same field, same rules, different verb. Just one modal,
// because it is the same act of answering, a second near-identical modal would mean two
// screens to fix together forever.
// The pure helpers
// (errorMessage / parseMeta) are unit-tested; the modal DOM is verified on staging.
import { renderItem } from '../../js/item-render.js';
import { getField, parseAnswer } from '../../js/tarefa-fields.js';
import { trail } from './api.js';
import { esc } from './utils.js';

const LS_NAME = 'ct_student_name';

// PURE. Map a Worker error code to a student-facing message.
export function errorMessage(code) {
  if (code === 'already_submitted') return 'Você já enviou uma resposta para esta tarefa. Cada aluno só pode enviar uma vez.';
  // The block, right in front of whoever hit it. The text says WHAT HAPPENED and what can
  // still be done: "erro ao salvar" (save error) would send the student to retry forever.
  if (code === 'already_replied') return 'O instrutor já respondeu esta entrega, então ela não pode mais ser editada. Se a tarefa aceitar, envie outra resposta.';
  if (code === 'anon_not_allowed') return 'Esta tarefa exige identificação. Informe seu nome.';
  if (code === 'needs_approval') return 'Seu acesso a esta turma está em análise. Aguarde a liberação para enviar.';
  if (code === 'forbidden') return 'Acesso negado. Recarregue a página e tente novamente.';
  if (code === 'not_a_tarefa') return 'Este item não aceita respostas.';
  if (code === 'not_found') return 'Tarefa não encontrada.';
  return 'Erro ao enviar: ' + code;
}

// PURE. meta_json may be a string or an object.
export function parseMeta(metaJson) {
  if (!metaJson) return {};
  if (typeof metaJson !== 'string') return metaJson || {};
  try { return JSON.parse(metaJson) || {}; } catch (_) { return {}; }
}

// PURE. Decide the modal's identity controls. Students are authenticated now (track-26): when
// we know the participant (a gated turma with a session), the old "Seu nome" field is dead, so
// we drop it and take the name from the session. The anonymous control follows the professor's
// choice FOR THIS TURMA: shown only when this tarefa allows anonymous, and NEVER pre-checked.
// An open (non-gated) turma has no session identity, so it keeps the name field + the
// "identificação obrigatória" hint.
//
// It does not come checked (Élder 2026-07-15: "o usuário deve marcar para ser anônimo").
// It used to, and that inverted consent: whoever arrived identified and just clicked
// "Enviar" would send anonymous WITHOUT MEANING TO, and the entrega would land ownerless
// in the professor's panel, irreversibly, because the name column stays null and there is
// nowhere to recover it from. Anonymity is the opt-in, not the default: whoever wants to
// hide checks the box.
//
// `currentAnon` only exists in EDIT mode: there the checkbox isn't proposing anything, it's
// showing what the entrega IS right now. Coming unchecked over an anonymous entrega would be
// the same consent inversion in reverse, whoever saved a comma fix would get identified
// without noticing, and a name doesn't go back into anonymity once it's appeared.
export function identityConfig(participantName, allowAnon, currentAnon) {
  const authed = !!String(participantName == null ? '' : participantName).trim();
  return {
    authed,
    showNameField: !authed,
    showAnonCheckbox: !!allowAnon,
    anonChecked: !!allowAnon && !!currentAnon,
  };
}

export function openTarefaSubmitModal(opts) {
  if (!opts || !opts.item) return;
  const item = opts.item;
  const clientSlug = opts.clientSlug;
  const turmaSlug = opts.turmaSlug;
  const token = opts.token;
  const sessionToken = opts.sessionToken; // gated turmas require an approved session to submit
  const participantName = String(opts.participantName || '').trim(); // the logged-in student, if any
  const onSubmitted = opts.onSubmitted || (() => {});
  // Edit mode: the SAME entrega goes back into the same field. `anon` is what it is today,
  // not a proposal.
  const editing = opts.editing || null;
  const SEND_LABEL = editing ? 'Salvar alterações' : 'Enviar resposta';

  const meta = parseMeta(item.meta_json);
  const fieldType = meta.field_type || 'text';
  // Comes from the RELEASE (ct_get_item_public returns item.allow_anonymous from the column
  // migration 0036 created), no longer from the DB item's meta_json: there the flag applied to
  // every turma that used the tarefa. One source only, the same one ct_submit_tarefa checks to
  // accept or reject, otherwise the modal would offer what the submit refuses.
  const allowAnon = !!item.allow_anonymous;
  const idCfg = identityConfig(participantName, allowAnon, editing && editing.anon);
  let savedName = '';
  try { savedName = localStorage.getItem(LS_NAME) || ''; } catch (_) { /* noop */ }

  // The identity block: name field only for an anonymous open turma; the anon checkbox only when
  // the tarefa allows it (pre-checked for a logged-in student). When a logged-in student has no
  // anon option, the block is omitted entirely (the name is taken from the session, no control).
  let identityHtml = '';
  if (idCfg.showNameField || idCfg.showAnonCheckbox) {
    identityHtml = '<div class="tr-tarefa-identity">';
    if (idCfg.showNameField) {
      identityHtml +=
        '<label class="tr-tarefa-name-label">Seu nome</label>' +
        '<input type="text" class="tr-tarefa-name" placeholder="Digite seu nome completo" value="' + esc(savedName) + '">';
    }
    if (idCfg.showAnonCheckbox) {
      identityHtml +=
        '<label class="tr-tarefa-anon-row">' +
          '<input type="checkbox" class="tr-tarefa-anon-cb"' + (idCfg.anonChecked ? ' checked' : '') + '>' +
          '<span>Enviar como anônimo</span>' +
        '</label>';
    } else if (idCfg.showNameField) {
      identityHtml += '<p class="tr-tarefa-hint">Identificação obrigatória para esta tarefa.</p>';
    }
    identityHtml += '</div>';
  }

  const bd = document.createElement('div');
  bd.className = 'tr-modal-backdrop tr-tarefa-submit-backdrop';
  bd.innerHTML =
    // This <div>'s class CANNOT be the same as the <button> down below: bd.querySelector
    // ('.tr-tarefa-submit') would match it FIRST (document order), and the modal's
    // "submit button" was actually the whole modal. Real, live consequences: tapping
    // ANYWHERE in the modal (the instructions, the label) submitted the answer; the
    // textContent = 'Enviando...' assignment wiped out the whole modal and left only that
    // word on screen; and .disabled = true did nothing, because a <div> has no disabled
    // (nothing guarded against a double submit). No CSS uses this class: it was dead
    // weight with a trap inside.
    '<div class="tr-modal tr-tarefa-submit-modal">' +
      '<button class="tr-modal-close" type="button" aria-label="Fechar">×</button>' +
      '<h2 class="tr-modal-title">' + esc(item.title) + '</h2>' +
      '<div class="tr-tarefa-instructions"></div>' +
      '<div class="tr-tarefa-form">' +
        '<label class="tr-tarefa-field-label">Sua resposta</label>' +
        '<div class="tr-tarefa-field"></div>' +
        identityHtml +
        '<div class="tr-tarefa-actions">' +
          '<button type="button" class="tr-btn tr-btn-ghost cdx-btn tr-tarefa-cancel">Cancelar</button>' +
          '<button type="button" class="tr-btn tr-btn-primary cdx-btn tr-tarefa-submit">' + SEND_LABEL + '</button>' +
        '</div>' +
        '<div class="tr-tarefa-error" aria-live="polite"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(bd);
  document.body.classList.add('tr-modal-open');

  const instr = bd.querySelector('.tr-tarefa-instructions');
  if (item.body_md) renderItem(item, instr, { preview: true });
  else instr.innerHTML = '';

  const fieldEl = bd.querySelector('.tr-tarefa-field');
  const field = getField(fieldType);
  // Editing starts from what was submitted, not from an empty field: rewriting everything
  // from scratch to change one sentence isn't editing. The registry itself (parseAnswer)
  // unpacks the answer_json, since it's the one that knows the payload's shape.
  field.renderForm(fieldEl, editing ? { initial: parseAnswer(editing.answer_json) } : {});

  const nameInput = bd.querySelector('.tr-tarefa-name');
  const anonCb = bd.querySelector('.tr-tarefa-anon-cb');
  const errorEl = bd.querySelector('.tr-tarefa-error');
  // Explicit 'button.': belt and suspenders with the rename above. Someday someone puts
  // tr-tarefa-submit on a wrapper again, and this will still grab the button.
  const submitBtn = bd.querySelector('button.tr-tarefa-submit');
  const cancelBtn = bd.querySelector('.tr-tarefa-cancel');
  const closeBtn = bd.querySelector('.tr-modal-close');

  function close() {
    if (bd.parentNode) bd.parentNode.removeChild(bd);
    document.body.classList.remove('tr-modal-open');
    document.removeEventListener('keydown', escHandler);
  }
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  bd.addEventListener('click', (e) => { if (e.target === bd) close(); });
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  // Only meaningful when the name field exists (open turma): disable it while "anônimo" is on.
  if (anonCb && nameInput) {
    anonCb.addEventListener('change', () => {
      if (anonCb.checked) { nameInput.disabled = true; nameInput.classList.add('disabled'); }
      else { nameInput.disabled = false; nameInput.classList.remove('disabled'); }
    });
  }

  submitBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    const isAnon = !!(anonCb && anonCb.checked);
    let name;
    if (idCfg.authed) {
      // Logged-in student: the name comes from the session, never a typed field. An anonymous
      // submit sends no name (the worker still stamps participant_id, so the student's own
      // Tarefas tab can match it back while the professor's list stays anonymous).
      name = isAnon ? '' : participantName;
    } else {
      name = isAnon ? '' : (nameInput ? (nameInput.value || '').trim() : '');
      if (!isAnon && !name) {
        errorEl.textContent = 'Informe seu nome ou marque "Enviar como anônimo".';
        return;
      }
    }
    const value = field.readValue(fieldEl);
    const validation = field.validate(value);
    if (validation) { errorEl.textContent = validation; return; }

    submitBtn.disabled = true;
    submitBtn.textContent = editing ? 'Salvando...' : 'Enviando...';
    if (!idCfg.authed && !isAnon && name) {
      try { localStorage.setItem(LS_NAME, name); } catch (_) { /* noop */ }
    }

    try {
      // Editing is not submitting again: that would be a second entrega, and on a
      // single-submission tarefa it would trigger 'already_submitted'. Same row, same id.
      if (editing) {
        await trail.editTarefa({
          client_slug: clientSlug,
          turma_slug: turmaSlug,
          session_token: sessionToken,
          id: editing.id,
          student_name: isAnon ? null : name,
          answer_json: JSON.stringify(value),
          _silent: true,
        });
      } else {
        await trail.submitTarefa({
          client_slug: clientSlug,
          turma_slug: turmaSlug,
          token,
          session_token: sessionToken,
          item_id: item.id,
          student_name: isAnon ? null : name,
          answer_type: fieldType,
          answer_json: JSON.stringify(value),
          _silent: true,
        });
      }
      close();
      onSubmitted();
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = SEND_LABEL;
      const code = e && e.data && e.data.error;
      errorEl.textContent = code
        ? errorMessage(code)
        : (editing
          ? 'Não foi possível salvar a alteração. Verifique sua conexão e tente novamente.'
          : 'Não foi possível enviar a resposta. Verifique sua conexão e tente novamente.');
    }
  });

  setTimeout(() => {
    const first = bd.querySelector('.tr-tarefa-field textarea, .tr-tarefa-field input');
    if (first) first.focus();
  }, 80);
}
