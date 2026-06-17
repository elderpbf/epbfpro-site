// codex/trilha/js/actions.js
// Item-action dispatch + button injection. getItemAction() maps an item to its
// right-side action (open / copy / submit / submitted) and is pure (unit-tested);
// injectActionButton / appendFlatActionRow mount it. The tarefa-submit modal is
// the Codex tarefa-submit-modal module (cdx- port).
import { state } from './state.js';
import { esc, copyToClipboard, hasSubmittedTarefa } from './utils.js';
import { openTarefaSubmitModal } from './tarefa-submit-modal.js';
import { isLoggedIn, LOGIN_ENABLED } from './student-session.js';
import { gate } from './student-login.js';
import { openLoginModal } from './student-login-modal.js';

export function getMeta(item) {
  if (!item || !item.meta_json) return {};
  if (typeof item.meta_json === 'string') {
    try { return JSON.parse(item.meta_json) || {}; } catch (_) { return {}; }
  }
  return item.meta_json || {};
}

export function getItemAction(item) {
  const meta = getMeta(item);
  if (item.type === 'tarefa') {
    if (hasSubmittedTarefa(item.id)) return { kind: 'submitted', label: 'Resposta enviada', shortLabel: 'Enviada', icon: 'check' };
    return { kind: 'submit', label: 'Enviar resposta', shortLabel: 'Enviar', icon: 'send', item };
  }
  if (meta.pdf_url) return { kind: 'open', label: 'Baixar PDF', url: meta.pdf_url, icon: 'download' };
  if (meta.attachment_url) {
    const isImg = /\.(png|jpe?g|webp|gif)$/i.test(meta.attachment_url);
    return { kind: 'open', label: isImg ? 'Ver imagem' : 'Baixar', url: meta.attachment_url, icon: isImg ? 'external' : 'download' };
  }
  if (meta.doc_url) return { kind: 'open', label: 'Documentação', url: meta.doc_url, icon: 'external' };
  if (item.body_md) return { kind: 'copy', label: 'Copiar', text: item.body_md, icon: 'copy' };
  return null;
}

// Build the action button element (anchor for 'open', button otherwise). The
// caller wires the click handler.
function makeActionBtn(action, extraClass) {
  let btn;
  if (action.kind === 'open') {
    btn = document.createElement('a');
    btn.href = action.url;
    btn.target = '_blank';
    btn.rel = 'noopener';
  } else {
    btn = document.createElement('button');
    btn.type = 'button';
  }
  let cls = 'cdx-tr-item-action' + (extraClass || '');
  if (action.kind === 'submitted') cls += ' cdx-tr-item-action--submitted is-done';
  cls.split(/\s+/).forEach((c) => { if (c) btn.classList.add(c); });

  let labelHtml = '<span class="cdx-tr-ia-label-full">' + esc(action.label) + '</span>';
  if (action.shortLabel) labelHtml += '<span class="cdx-tr-ia-label-short">' + esc(action.shortLabel) + '</span>';
  btn.innerHTML = (state.ICONS[action.icon] || state.ICONS.copy) + labelHtml;
  if (action.kind === 'submitted') btn.disabled = true;
  return btn;
}

export function injectActionButton(sub, item, opts = {}) {
  const actionsEl = sub.querySelector('.cdx-tr-sub-actions');
  if (!actionsEl) return;
  actionsEl.innerHTML = '';
  const action = getItemAction(item);
  if (!action) return;

  const btn = makeActionBtn(action, opts.isTarefa ? ' cdx-tr-item-action--task' : '');
  btn.addEventListener('click', (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (action.kind === 'copy') { if (e && e.preventDefault) e.preventDefault(); copyToClipboard(action.text, btn); }
    else if (action.kind === 'submit') { if (e && e.preventDefault) e.preventDefault(); openTarefaSubmit(action.item, sub, opts); }
  });
  actionsEl.appendChild(btn);
}

export function openTarefaSubmit(item, sub, opts) {
  // Persisting a tarefa answer requires a student session: gate the modal behind
  // login, resuming the submit once authenticated. The gate logic is unit-tested
  // (student-login.gate); here we only supply the predicate + the two callbacks.
  const proceed = () => openTarefaSubmitModal({
    item,
    clientSlug: state.clientSlug,
    turmaSlug: state.turmaSlug,
    token: state.token,
    sessionToken: state.sessionToken, // approved-session token; gated turmas require it
    onSubmitted: () => injectActionButton(sub, item, opts || {}),
  });
  // Login disabled: submit name-based as before. When the access-control model
  // lands, the gate (unit-tested in student-login.gate) routes through login first.
  if (!LOGIN_ENABLED) { proceed(); return; }
  gate(
    isLoggedIn(state.clientSlug, state.turmaSlug),
    (resume) => openLoginModal({ client: state.clientSlug, turma: state.turmaSlug, k: state.token, onAuthenticated: resume }),
    proceed,
  );
}

export function appendFlatActionRow(body, item) {
  const action = getItemAction(item);
  if (!action) return;
  const row = document.createElement('div');
  row.className = 'cdx-tr-flat-action-row';
  const btn = makeActionBtn(action, '');
  btn.addEventListener('click', (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (action.kind === 'copy') { if (e && e.preventDefault) e.preventDefault(); copyToClipboard(action.text, btn); }
  });
  row.appendChild(btn);
  body.appendChild(row);
}
