// codex/trilha/js/actions.js
// Item-action dispatch + button injection. getItemAction() maps an item to its
// right-side action (open / copy / submit / submitted) and is pure (unit-tested);
// injectActionButton / appendFlatActionRow mount it. The tarefa-submit modal is
// the Codex tarefa-submit-modal module (cdx- port).
import { state } from './state.js';
import { esc, copyToClipboard } from './utils.js';
import { openTarefaSubmitModal } from './tarefa-submit-modal.js';
import { isLoggedIn, LOGIN_ENABLED } from './student-session.js';
import { openTrailLogin } from './gate.js';
import { assetUrl } from '../../js/codex-api.js';
import { openModal as openLabViewer } from '../../js/lab-viewer.js';
import { openMenu } from '../../js/menu.js';
import { downloadText, fileNameFromTitle, isDownloadable } from '../../js/item-download.js';
import { downloadZip } from '../../js/item-zip.js';
import { trail } from './api.js';
import * as toast from '../../js/toast.js';

// Stored asset paths (/r2/... attachment/pdf keys) are served by the codex-api
// Worker, not the Pages origin, so an open-action href must go through assetUrl
// (WORKER_URL). Full http(s) urls (external docs) pass through untouched.
function _assetSrc(url) {
  return /^https?:\/\//i.test(url || '') ? url : assetUrl(url || '');
}

export function getMeta(item) {
  if (!item || !item.meta_json) return {};
  if (typeof item.meta_json === 'string') {
    try { return JSON.parse(item.meta_json) || {}; } catch (_) { return {}; }
  }
  return item.meta_json || {};
}

// Todas as ações de um item, em ordem de prioridade. A primeira é a que a linha fechada
// mostrava sozinha antes do track-61, então um item de ação única segue idêntico.
//
// Antes disto isto era uma cadeia com UM `return`, e o efeito era exclusão mútua: um item
// com anexo PERDIA o "Copiar". Prompt + arquivos juntos era irrepresentável.
//
// Lab, interativo e tarefa seguem exclusivos: a ação É o item, não há o que somar.
export function getItemActions(item) {
  const single = _exclusiveAction(item);
  const pack = packageOf(item);
  const packAction = pack
    ? { kind: 'download-project', label: 'Baixar tudo (.zip)', shortLabel: '.zip', project: pack, icon: 'download' }
    : null;

  // A ação exclusiva CONVIVE com o pacote. Uma tarefa que leva documentos dentro (Élder
  // 2026-08-05) precisa das duas: "Entregar" continua sendo o que a tarefa É, e "Baixar
  // tudo" é o que ela carrega. Devolver só a exclusiva esconderia os anexos; devolver só o
  // pacote tiraria a entrega.
  if (single) return packAction ? [single, packAction] : [single];

  // Fora disso, um embalador oferece só ações DO PACOTE. Élder testou e pegou a incoerência:
  // o "Copiar" copiava a frase de apresentação do projeto enquanto o "Baixar" trazia um zip
  // de 3 arquivos, então não dava pra prever o que cada botão faria. O texto do projeto é
  // para LER, na tela.
  if (packAction) return [packAction];

  const meta = getMeta(item);
  const out = [];
  if (meta.pdf_url) out.push({ kind: 'open', label: 'Baixar PDF', url: meta.pdf_url, icon: 'download' });
  if (meta.attachment_url) {
    const isImg = /\.(png|jpe?g|webp|gif)$/i.test(meta.attachment_url);
    out.push({ kind: 'open', label: isImg ? 'Ver imagem' : 'Baixar', url: meta.attachment_url, icon: isImg ? 'external' : 'download' });
  }
  if (meta.doc_url) out.push({ kind: 'open', label: 'Documentação', url: meta.doc_url, icon: 'external' });
  if (item.body_md) {
    out.push({ kind: 'copy', label: 'Copiar', text: item.body_md, icon: 'copy' });
    // Só o texto VERBATIM sai em .md. Quem o aluno vê processado na tela sai em PDF, que é
    // fatia própria: um .md de um texto que ele nunca viu como markdown seria uma surpresa.
    if (isVerbatim(item)) {
      out.push({ kind: 'download-md', label: 'Baixar .md', shortLabel: '.md', text: item.body_md, item, icon: 'download' });
    }
  }
  return out;
}

// Este item embala outros? A fonte é `item.children`, que o Worker devolve a partir de
// `ct_item_members`. Um projeto vazio não oferece pacote.
// O pacote de um item, ACHATADO com o caminho de pasta de cada peça. Um filho que também
// embala vira uma PASTA no zip com o que ele carrega dentro; assim a estrutura que o aluno vê
// na trilha é a mesma que ele abre no descompactador (Élder 2026-08-05).
//
// `items` continua sendo a lista de ids, agora com o `dir` ao lado, porque quem baixa precisa
// dos dois: o id para buscar pelo mesmo ct_get_item_public de sempre, e o dir para nomear.
export function packageOf(item) {
  const kids = item && Array.isArray(item.children) ? item.children : null;
  if (!kids || !kids.length) return null;
  const items = [];
  let skipped = 0;
  (function walk(list, dir) {
    list.forEach((c) => {
      // Lab e interativo ficam de fora do pacote, mas continuam na pasta e na trilha. São
      // CONTADOS, não sumidos: um zip com menos arquivos do que a pasta mostra tem que dizer
      // isso, senão passa por completo (Élder 2026-08-05).
      if (!isDownloadable(c)) skipped++;
      else items.push({ id: c.id, dir });
      const sub = Array.isArray(c.children) ? c.children : null;
      if (sub && sub.length) walk(sub, dir + _dirName(c.title) + '/');
    });
  })(kids, '');
  return { name: String(item.title || 'projeto').replace(/^#+\s*/, ''), items, skipped };
}

// Nome de pasta com a MESMA limpeza do nome de arquivo (acento e `#` de título não
// sobrevivem a sistema de arquivos), só que sem extensão.
function _dirName(title) {
  return fileNameFromTitle(title, 'd').replace(/\.d$/, '');
}

// O texto é literal (não passa por markdown) quando o tipo é `prompt`. Élder: "o prompt
// sempre cru". Isto hoje espelha o dispatchType() do item-render; quando a peça ganhar o
// flag `verbatim` próprio (track-61 §5), a decisão passa a sair do flag e esta função vira
// o único lugar a mudar.
export function isVerbatim(item) {
  return !!item && item.type === 'prompt';
}

export function getItemAction(item) {
  return getItemActions(item)[0] || null;
}

function _exclusiveAction(item) {
  const meta = getMeta(item);
  if (item.type === 'tarefa') {
    // A aba Aulas não entrega nada: ela LEVA pra aba Tarefas, que é a dona do fluxo de entrega
    // (Élder 2026-07-15). Isso também mata um bug vivo: o estado "Resposta enviada" saía do
    // localStorage (`ct_tarefa_submitted_<item>_<turma>`), uma chave SEM o aluno dentro, então
    // era por NAVEGADOR: o segundo aluno a entrar no mesmo aparelho via a tarefa como já
    // entregue e não conseguia enviar. Aqui não se pergunta mais nada ao localStorage, e a aba
    // Tarefas decide pelo `state` que o servidor manda, que é quem sabe a verdade.
    return { kind: 'go-tarefas', label: 'Ir para tarefas', shortLabel: 'Tarefas', icon: 'external', item };
  }
  // A lab is an interactive demo, not a download: its action opens the shared
  // fullscreen viewer (js/lab-viewer.js), keyed by lab_key from meta_json.
  if (item.type === 'lab') {
    const key = meta.lab_key || String((meta.url || '').replace(/^\/codex\/labs\//, '').replace(/\/$/, ''));
    if (key) return { kind: 'lab-open', label: 'Abrir', shortLabel: 'Abrir', key, icon: 'external' };
  }
  // An interativo is a self-contained HTML the student explores: like a lab it opens the
  // shared fullscreen viewer, but keyed by url (meta.url) instead of a lab key. Without
  // this branch a released interativo expands with no way to open it (item-render's own
  // "Abrir" button is suppressed under opts.preview on the Trail).
  if (item.type === 'interativo') {
    const url = meta.url || '';
    if (url) return { kind: 'interativo-open', label: 'Abrir', shortLabel: 'Abrir', url, icon: 'external' };
  }
  return null;
}

// Build the action button element (anchor for 'open', button otherwise). The
// caller wires the click handler.
function makeActionBtn(action, extraClass) {
  let btn;
  if (action.kind === 'open') {
    btn = document.createElement('a');
    btn.href = _assetSrc(action.url);
    btn.target = '_blank';
    btn.rel = 'noopener';
  } else {
    btn = document.createElement('button');
    btn.type = 'button';
  }
  let cls = 'cdx-tr-item-action cdx-btn cdx-btn-primary cdx-btn-sm' + (extraClass || '');
  if (action.kind === 'submitted') cls += ' cdx-tr-item-action--submitted is-done';
  cls.split(/\s+/).forEach((c) => { if (c) btn.classList.add(c); });

  let labelHtml = '<span class="cdx-tr-ia-label-full">' + esc(action.label) + '</span>';
  if (action.shortLabel) labelHtml += '<span class="cdx-tr-ia-label-short">' + esc(action.shortLabel) + '</span>';
  // O glifo vem sempre ANTES do rótulo, chevron incluído: é o lugar dele em todo botão da
  // trilha, e um único botão fora do padrão custa mais que a convenção de dropdown ganha
  // (Élder 2026-08-04, depois de conferir o botão de enviar).
  btn.innerHTML = (state.ICONS[action.icon] || state.ICONS.copy) + labelHtml;
  if (action.kind === 'submitted') btn.disabled = true;
  return btn;
}

// Executa uma ação. Só o caminho 'open' de um botão direto anda sozinho (é um <a>), por
// isso ele não aparece aqui: dentro do menu não há âncora, então abrimos na mão.
function runAction(action, item, sub, opts, btn) {
  if (action.kind === 'copy') copyToClipboard(action.text, btn);
  else if (action.kind === 'download-md') downloadText(action.text, fileNameFromTitle(action.item.title, 'md'));
  else if (action.kind === 'download-project') downloadProject(action.project);
  else if (action.kind === 'submit') openTarefaSubmit(action.item, sub, opts);
  else if (action.kind === 'go-tarefas') goToTarefa(item.id);
  else if (action.kind === 'lab-open') openLabViewer({ key: action.key, title: item.title });
  else if (action.kind === 'interativo-open') openLabViewer({ url: action.url, title: item.title });
}

// Baixa todos os itens do projeto num .zip. Os irmãos vêm pelo MESMO `ct_get_item_public` que
// abrir um item usa, então o controle de acesso da turma vale igual e não há ação nova no
// Worker: um item que o aluno não pode ver falha ali e fica fora do pacote.
export async function downloadProject(project) {
  toast.info('Montando o pacote...');
  const base = {
    client_slug: state.clientSlug, turma_slug: state.turmaSlug,
    token: state.token, session_token: state.sessionToken,
  };
  const got = await Promise.all(project.items.map((p) =>
    trail.itemPublic(Object.assign({ item_id: p.id, _silent: true }, base))
      .then((r) => (r && r.item ? Object.assign({ _dir: p.dir || '' }, r.item) : null))
      .catch(() => null)));
  const entries = got.filter((i) => i && i.body_md).map((i) => ({ title: i.title, text: i.body_md, dir: i._dir }));
  if (!entries.length) { toast.err('Nao foi possivel montar o pacote.'); return; }
  downloadZip(entries, fileNameFromTitle(project.name, 'zip'));
  // Falha parcial é dita em voz alta: um zip com 2 de 3 arquivos passaria por completo. Mas a
  // conta é de itens que NÃO VOLTARAM, não de itens sem corpo: com aninhamento, um agrupador
  // entra na lista só para dar nome à pasta e legitimamente não tem texto próprio. Contar por
  // `entries` acusaria falha num pacote inteiro.
  const failed = got.filter((i) => !i).length;
  if (failed) {
    toast.err('O pacote saiu sem ' + failed + (failed === 1 ? ' arquivo.' : ' arquivos.'));
  }
  // O que não cabe em arquivo é dito, não escondido: um zip com menos itens do que a pasta
  // mostra passaria por completo. Nada entra no lugar deles ("we're not going to add anything
  // to the zip because it makes no sense", Élder 2026-08-05).
  if (project.skipped) {
    toast.info(project.skipped === 1
      ? '1 lab ou interativo não entra no .zip; ele abre na trilha.'
      : project.skipped + ' labs ou interativos não entram no .zip; eles abrem na trilha.');
  }
}

// Monta as ações de um item num container. UMA montagem parametrizada, usada pela linha da
// aba Aulas e pelo corpo dos cards planos (Apostila/Outros), nunca duas fiações.
//
// Uma ação: o botão direto de sempre, byte a byte como antes do track-61. Duas ou mais:
// UM gatilho "Ações" com chevron no lugar do glifo, abrindo o menu compartilhado
// (js/menu.js). N botões teal lado a lado espremeriam o título, e no celular o botão é só
// ícone (mobile.css), então três ícones em fila seriam ilegíveis.
export function mountActions(container, item, opts = {}) {
  if (!container) return;
  container.innerHTML = '';
  const actions = getItemActions(item);
  if (!actions.length) return;
  const extraClass = opts.isTarefa ? ' cdx-tr-item-action--task' : '';
  const sub = opts.sub || null;

  if (actions.length === 1) {
    const action = actions[0];
    const btn = makeActionBtn(action, extraClass);
    btn.addEventListener('click', (e) => {
      if (e && e.stopPropagation) e.stopPropagation();
      if (action.kind === 'open') return; // o <a> abre sozinho
      if (e && e.preventDefault) e.preventDefault();
      runAction(action, item, sub, opts, btn);
    });
    container.appendChild(btn);
    return;
  }

  const trigger = makeActionBtn({ kind: 'menu', label: 'Ações', shortLabel: 'Ações', icon: 'chevron' }, extraClass);
  trigger.addEventListener('click', (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (e && e.preventDefault) e.preventDefault();
    openMenu(trigger, actions.map((action) => ({
      label: action.label,
      onClick: () => {
        if (action.kind === 'open') window.open(_assetSrc(action.url), '_blank', 'noopener');
        else runAction(action, item, sub, opts, trigger);
      },
    })));
  });
  container.appendChild(trigger);
}

export function injectActionButton(sub, item, opts = {}) {
  const actionsEl = sub.querySelector('.cdx-tr-sub-actions');
  if (!actionsEl) return;
  mountActions(actionsEl, item, Object.assign({}, opts, { sub }));
}

// Leva o aluno pra aba Tarefas, JÁ no cartão daquela tarefa. Reusa o deep-focus que o sino de
// notificações usa (focusTarefa): mesmo problema, mesma solução, nada duplicado. Import dinâmico
// porque tarefas.js importa page.js, e um import estático aqui fecharia o ciclo.
export function goToTarefa(itemId) {
  const go = () => { if (typeof location !== 'undefined') location.hash = '#tarefas'; };
  import('./tarefas.js').then((m) => { if (m && m.focusTarefa) m.focusTarefa(itemId); go(); }).catch(go);
}

export function openTarefaSubmit(item, sub, opts) {
  // Persisting a tarefa answer requires a student session: gate the modal behind
  // login, resuming the submit once authenticated. The gate logic is unit-tested
  // (student-login.gate); here we only supply the predicate + the two callbacks.
  const participant = (state.data || {}).participant || {};
  const proceed = () => openTarefaSubmitModal({
    item,
    clientSlug: state.clientSlug,
    turmaSlug: state.turmaSlug,
    token: state.token,
    sessionToken: state.sessionToken, // approved-session token; gated turmas require it
    participantName: participant.name || '',   // ONE name (track-42), the registration name; drops the name field
    onSubmitted: () => injectActionButton(sub, item, opts || {}),
  });
  // Non-gated turmas keep the open anonymous / name-based submit, exactly as before.
  // A gated turma routes an unauthenticated student through login first (the worker
  // also enforces it); a logged-in-but-pending student proceeds and the submit modal
  // surfaces the needs_approval message.
  const access = (state.data || {}).access;
  const gated = !!(access && access.gated);
  if (!LOGIN_ENABLED || !gated || isLoggedIn(state.clientSlug, state.turmaSlug)) {
    proceed();
    return;
  }
  openTrailLogin();
}

export function appendFlatActionRow(body, item) {
  if (!getItemActions(item).length) return;
  const row = document.createElement('div');
  row.className = 'cdx-tr-flat-action-row';
  mountActions(row, item, {});
  body.appendChild(row);
}
