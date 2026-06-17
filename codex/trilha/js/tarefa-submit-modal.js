// codex/trilha/js/tarefa-submit-modal.js
// Student-side tarefa submit modal (cdx- port of the legacy CTTarefaSubmitModal
// global). Emits the SAME tr-modal* / tr-tarefa* markup the Trail's
// tarefa-modal.css already styles, so the modal looks identical; only the code
// shape changed. Backend goes through the Trail facade (trail.submitTarefa),
// never raw callWorker. Instructions preview reuses the Codex item renderer; the
// answer field comes from the Codex tarefa-fields registry.
//
// Public API: openTarefaSubmitModal({ item, clientSlug, turmaSlug, token, onSubmitted })
// The submitted-state key is shared with utils.tarefaSubmittedKey so the action
// button flips to "Resposta enviada" after a successful submit. The pure helpers
// (errorMessage / parseMeta) are unit-tested; the modal DOM is verified on staging.
import { renderItem } from '../../js/item-render.js';
import { getField } from '../../js/tarefa-fields.js';
import { trail } from './api.js';
import { esc, tarefaSubmittedKey } from './utils.js';

const LS_NAME = 'ct_student_name';

// PURE. Map a Worker error code to a student-facing message.
export function errorMessage(code) {
  if (code === 'already_submitted') return 'Você já enviou uma resposta para esta tarefa. Cada aluno só pode enviar uma vez.';
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

export function openTarefaSubmitModal(opts) {
  if (!opts || !opts.item) return;
  const item = opts.item;
  const clientSlug = opts.clientSlug;
  const turmaSlug = opts.turmaSlug;
  const token = opts.token;
  const sessionToken = opts.sessionToken; // gated turmas require an approved session to submit
  const onSubmitted = opts.onSubmitted || (() => {});

  const meta = parseMeta(item.meta_json);
  const fieldType = meta.field_type || 'text';
  const allowAnon = !!meta.allow_anonymous;
  let savedName = '';
  try { savedName = localStorage.getItem(LS_NAME) || ''; } catch (_) { /* noop */ }

  const bd = document.createElement('div');
  bd.className = 'tr-modal-backdrop tr-tarefa-submit-backdrop';
  bd.innerHTML =
    '<div class="tr-modal tr-tarefa-submit">' +
      '<button class="tr-modal-close" type="button" aria-label="Fechar">×</button>' +
      '<h2 class="tr-modal-title">' + esc(item.title) + '</h2>' +
      '<div class="tr-tarefa-instructions"></div>' +
      '<div class="tr-tarefa-form">' +
        '<label class="tr-tarefa-field-label">Sua resposta</label>' +
        '<div class="tr-tarefa-field"></div>' +
        '<div class="tr-tarefa-identity">' +
          '<label class="tr-tarefa-name-label">Seu nome</label>' +
          '<input type="text" class="tr-tarefa-name" placeholder="Digite seu nome completo" value="' + esc(savedName) + '">' +
          (allowAnon
            ? '<label class="tr-tarefa-anon-row">' +
                '<input type="checkbox" class="tr-tarefa-anon-cb">' +
                '<span>Enviar como anônimo</span>' +
              '</label>'
            : '<p class="tr-tarefa-hint">Identificação obrigatória para esta tarefa.</p>'
          ) +
        '</div>' +
        '<div class="tr-tarefa-actions">' +
          '<button type="button" class="tr-btn tr-btn-ghost tr-tarefa-cancel">Cancelar</button>' +
          '<button type="button" class="tr-btn tr-btn-primary tr-tarefa-submit">Enviar resposta</button>' +
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
  field.renderForm(fieldEl, {});

  const nameInput = bd.querySelector('.tr-tarefa-name');
  const anonCb = bd.querySelector('.tr-tarefa-anon-cb');
  const errorEl = bd.querySelector('.tr-tarefa-error');
  const submitBtn = bd.querySelector('.tr-tarefa-submit');
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

  if (anonCb) {
    anonCb.addEventListener('change', () => {
      if (anonCb.checked) { nameInput.disabled = true; nameInput.classList.add('disabled'); }
      else { nameInput.disabled = false; nameInput.classList.remove('disabled'); }
    });
  }

  submitBtn.addEventListener('click', async () => {
    errorEl.textContent = '';
    const isAnon = !!(anonCb && anonCb.checked);
    const name = isAnon ? '' : (nameInput.value || '').trim();
    if (!isAnon && !name) {
      errorEl.textContent = 'Informe seu nome ou marque "Enviar como anônimo".';
      return;
    }
    const value = field.readValue(fieldEl);
    const validation = field.validate(value);
    if (validation) { errorEl.textContent = validation; return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    if (!isAnon && name) {
      try { localStorage.setItem(LS_NAME, name); } catch (_) { /* noop */ }
    }

    try {
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
      try { localStorage.setItem(tarefaSubmittedKey(item.id), String(Date.now())); } catch (_) { /* noop */ }
      close();
      onSubmitted();
    } catch (e) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar resposta';
      const code = e && e.data && e.data.error;
      errorEl.textContent = code
        ? errorMessage(code)
        : 'Não foi possível enviar a resposta. Verifique sua conexão e tente novamente.';
    }
  });

  setTimeout(() => {
    const first = bd.querySelector('.tr-tarefa-field textarea, .tr-tarefa-field input');
    if (first) first.focus();
  }, 80);
}
