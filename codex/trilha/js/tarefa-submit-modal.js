// codex/trilha/js/tarefa-submit-modal.js
// Student-side tarefa submit modal (cdx- port of the legacy CTTarefaSubmitModal
// global). Emits the SAME tr-modal* / tr-tarefa* markup the Trail's
// tarefa-modal.css already styles, so the modal looks identical; only the code
// shape changed. Backend goes through the Trail facade (trail.submitTarefa),
// never raw callWorker. Instructions preview reuses the Codex item renderer; the
// answer field comes from the Codex tarefa-fields registry.
//
// Public API: openTarefaSubmitModal({ item, clientSlug, turmaSlug, token, onSubmitted, editing })
// `editing` ({ id, answer_json, anon }) troca o modal pro modo EDIÇÃO da entrega que já existe
// (migration 0037): mesmo campo, mesmas regras, outro verbo. Um modal só, porque é o mesmo ato
// de responder — um segundo modal quase igual seria duas telas pra corrigir juntas pra sempre.
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
  // A trava da 0037, na cara de quem esbarrou nela. O texto diz O QUE ACONTECEU e o que ainda
  // dá pra fazer: "erro ao salvar" mandaria o aluno tentar de novo pra sempre.
  if (code === 'already_seen') return 'O instrutor já viu esta resposta, então ela não pode mais ser editada. Se a tarefa aceitar, envie outra resposta.';
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
// Não vem marcado (Élder 2026-07-15: "o usuário deve marcar para ser anônimo"). Vinha, e isso
// invertia o consentimento: quem entrasse identificado e só clicasse "Enviar" mandava anônimo
// SEM QUERER, e a entrega chegava sem dono no painel do professor — irreversível, porque a
// coluna do nome fica nula e não há de onde recuperar. Anonimato é o desvio, não o padrão:
// quem quer se esconder marca.
//
// `currentAnon` só existe na EDIÇÃO: aí a caixa não está propondo nada, está mostrando o que a
// entrega É neste momento. Vir desmarcada sobre uma entrega anônima seria a mesma inversão de
// consentimento ao contrário — quem salvasse uma correção de vírgula se identificaria sem
// perceber, e um nome não volta pra dentro do anonimato depois de aparecer.
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
  // Modo edição (0037): a MESMA entrega volta pro mesmo campo. `anon` é o que ela é hoje, não
  // uma proposta.
  const editing = opts.editing || null;
  const SEND_LABEL = editing ? 'Salvar alterações' : 'Enviar resposta';

  const meta = parseMeta(item.meta_json);
  const fieldType = meta.field_type || 'text';
  // Vem do RELEASE (ct_get_item_public devolve item.allow_anonymous a partir da coluna que a
  // migration 0036 criou), não mais do meta_json do item do BANCO: lá a marca valia pra toda
  // turma que usasse a tarefa. Uma fonte só — a mesma que o ct_submit_tarefa consulta pra
  // aceitar ou recusar — senão o modal oferece o que o envio recusa.
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
    // A classe deste <div> NAO pode ser a mesma do <button> la embaixo: o
    // bd.querySelector('.tr-tarefa-submit') casava com ele PRIMEIRO (ordem do documento) e o
    // "botao de enviar" do modal era, na verdade, o modal inteiro. Consequencias reais, ao vivo:
    // tocar em QUALQUER lugar do modal (o enunciado, o rotulo) enviava a resposta; o
    // textContent = 'Enviando...' apagava o modal inteiro e deixava so a palavra na tela; e o
    // .disabled = true nao fazia nada, porque <div> nao tem disabled (nada segurava um envio
    // duplo). Nenhum CSS usa esta classe: era peso morto com uma armadilha dentro.
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
  // Editar começa do que foi enviado, não de um campo vazio: reescrever tudo do zero pra trocar
  // uma frase não é editar. Quem desempacota o answer_json é o próprio registry (parseAnswer),
  // que é quem conhece a forma do payload.
  field.renderForm(fieldEl, editing ? { initial: parseAnswer(editing.answer_json) } : {});

  const nameInput = bd.querySelector('.tr-tarefa-name');
  const anonCb = bd.querySelector('.tr-tarefa-anon-cb');
  const errorEl = bd.querySelector('.tr-tarefa-error');
  // 'button.' explicito: cinto e suspensorio com o rename la em cima. Um dia alguem poe
  // tr-tarefa-submit num wrapper de novo, e aqui continua pegando o botao.
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
      // Editar não é enviar de novo: seria uma segunda entrega, e numa tarefa de entrega única
      // levaria 'already_submitted'. Mesma linha, mesmo id.
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
