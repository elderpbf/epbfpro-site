// Codex-owned, type-dispatched item content renderer.
//
// cdx- port of the legacy backstage CTRenderer global. It emits the SAME .ctr-*
// markup the Trail and admin CSS already style, so the rendered output is
// byte-identical to the legacy renderer; only the code shape changed (IIFE
// window global -> ES module with pure HTML builders + thin DOM glue).
//
// Used by the Trail (sub/flat item cards). The admin live-preview still uses the
// backstage global for now; the legacy ClassTrail/ClassVault keep their frozen
// backstage copy. Markdown types lazy-load marked.js from the CDN, same as before.
//
// Public API:
//   renderItem(item, container, opts)   opts.preview suppresses copy/affordance
// The pure *Html builders + dispatchType are exported for unit tests; the DOM
// application and the marked path are verified on staging.

import { esc } from './dom.js';
import { assetUrl } from './codex-api.js';
import { openModal as _openLabViewer } from './lab-viewer.js';
import { flattenTree } from './item-list.js';
import { isVerbatim } from './item-download.js';
export { esc };

// Resolve a stored asset path to a loadable URL. Attachment/PDF urls are stored as
// worker-relative /r2/... keys, and /r2 is served by the codex-api Worker (NOT the
// Pages site), so they must go through the facade's assetUrl (WORKER_URL) or the
// browser resolves them against the page origin and 404s. Full http(s) urls
// (external docs) pass through untouched.
function _assetSrc(url) {
  return /^https?:\/\//i.test(url || '') ? url : assetUrl(url || '');
}

// meta_json arrives from the worker as a JSON string (ct_get_item does SELECT *, so
// the raw TEXT column comes through unparsed) OR as an already-parsed object. The
// builders below index into it, so normalize to an object once here. Without this a
// string meta silently yields undefined fields (an attachment renders nothing while
// the action button, which parses, still works).
function _meta(item) {
  const m = item && item.meta_json;
  if (!m) return {};
  if (typeof m === 'string') { try { return JSON.parse(m) || {}; } catch (_) { return {}; } }
  return m;
}

// type -> renderer key. Unknown types fall back to plain markdown.
export function dispatchType(type) {
  if (type === 'prompt') return 'prompt';
  if (type === 'guide') return 'guide';
  if (type === 'material') return 'material';
  if (type === 'arquivo') return 'arquivo';
  if (type === 'paper') return 'paper';
  if (type === 'model_info') return 'model_info';
  if (type === 'google_doc') return 'google_doc';
  if (type === 'lab') return 'lab';
  if (type === 'interativo') return 'interativo';
  return 'markdown';
}

// A top-right affordance button (download / docs). Empty in preview or with no url.
function affordanceBtnHtml(url, label, isPreview) {
  return (!isPreview && url)
    ? '<a href="' + esc(_assetSrc(url)) + '" target="_blank" rel="noopener" class="ctr-affordance-btn">' + label + '</a>'
    : '';
}

// ── prompt ───────────────────────────────────────────────────────────────────
// Prompt items are rendered VERBATIM, never parsed as Markdown: every character
// is part of the instruction the student copies into an AI.
export function promptHtml(item, opts = {}) {
  const md = item.body_md || '';
  const copyBtn = opts.preview ? '' : '<button class="ctr-copy-btn">Copiar</button>';
  return '<div class="ctr-prompt-verbatim">' + esc(md) + '</div>' + copyBtn;
}

// ── model_info ───────────────────────────────────────────────────────────────
export function modelInfoHtml(item, opts = {}) {
  const meta = _meta(item);
  const provider = meta.provider || '';
  const modelId = meta.model_id || '';
  const contextWindow = meta.context_window != null ? String(meta.context_window) : '';
  const strengths = Array.isArray(meta.strengths) ? meta.strengths : [];
  const docUrl = meta.doc_url || '';

  const badgesHtml =
    (provider ? '<span class="ctr-badge ctr-badge-provider">' + esc(provider) + '</span>' : '') +
    (modelId ? '<span class="ctr-badge ctr-badge-model">' + esc(modelId) + '</span>' : '');

  const contextHtml = contextWindow
    ? '<span class="ctr-pill ctr-pill-context">Contexto: ' + esc(contextWindow) + '</span>'
    : '';

  const strengthsHtml = strengths.length
    ? '<ul class="ctr-strengths-list">' + strengths.map((s) => '<li>' + esc(s) + '</li>').join('') + '</ul>'
    : '';

  const docLinkHtml = docUrl
    ? '<a href="' + esc(docUrl) + '" target="_blank" rel="noopener" class="ctr-doc-link-btn">Documentação oficial</a>'
    : '';

  return '<div class="ctr-affordance-row">' + affordanceBtnHtml(docUrl, 'Documentação', opts.preview) + '</div>' +
    '<div class="ctr-model-badges">' + badgesHtml + '</div>' +
    (contextHtml ? '<div class="ctr-model-context">' + contextHtml + '</div>' : '') +
    (strengthsHtml ? '<div class="ctr-model-strengths">' + strengthsHtml + '</div>' : '') +
    (docLinkHtml ? '<div class="ctr-model-doc">' + docLinkHtml + '</div>' : '');
}

// ── PDF inline embed (object + a download-link fallback inside) ───────────────
// Shared by the paper shell and the material/arquivo attachment preview so the
// embed markup lives in one place.
export function pdfEmbedHtml(url) {
  if (!url) return '';
  const src = esc(_assetSrc(url));
  return '<div class="ctr-pdf-embed">' +
      '<object data="' + src + '" type="application/pdf" class="ctr-pdf-object">' +
        '<a href="' + src + '" target="_blank" rel="noopener" class="ctr-dl-link">Baixar PDF</a>' +
      '</object>' +
    '</div>';
}

// ── attachment preview (image inline / PDF inline embed / else download) ─────
// The worker only stores image (png/jpg/webp) or PDF, both previewable inline;
// anything else degrades to a plain download link.
export function attachmentHtml(url) {
  if (!url) return '';
  if (/\.(png|jpg|jpeg|webp)$/i.test(url)) {
    return '<div class="ctr-attachment-img"><img src="' + esc(_assetSrc(url)) + '" alt="Anexo"></div>';
  }
  if (/\.pdf$/i.test(url)) return pdfEmbedHtml(url);
  return '<div class="ctr-attachment-link"><a href="' + esc(_assetSrc(url)) + '" target="_blank" rel="noopener" class="ctr-dl-link">Baixar arquivo</a></div>';
}

// ── paper shell (synchronous, markdown-free structure) ───────────────────────
export function paperShellHtml(item, opts = {}) {
  const meta = _meta(item);
  const authors = meta.authors || '';
  const year = meta.year || '';
  const abstract = meta.abstract || '';
  const pdfUrl = meta.pdf_url || '';

  const metaLine = (authors || year)
    ? '<p class="ctr-paper-meta">' + esc(authors) + (authors && year ? ', ' : '') + esc(String(year)) + '</p>'
    : '';
  const abstractHtml = abstract
    ? '<p class="ctr-paper-abstract">' + esc(abstract) + '</p>'
    : '';
  const embedHtml = pdfEmbedHtml(pdfUrl);

  return '<div class="ctr-affordance-row">' + affordanceBtnHtml(pdfUrl, 'Baixar PDF', opts.preview) + '</div>' +
    metaLine + abstractHtml + embedHtml;
}

// ── lab (interactive demo, iframed fullscreen via the shared lab-viewer) ─────
// A lab item is shipped data, not authored content: no body_md, meta_json
// carries { lab_key, url } (written by the backend's ct_ensure_lab_items, see
// architecture/labs.md). The affordance opens the SAME fullscreen viewer the
// admin preview uses (js/lab-viewer.js) -- one viewer, not a Trail-only fork.
export function labHtml(item, opts = {}) {
  const meta = _meta(item);
  const key = meta.lab_key || String((meta.url || '').replace(/^\/codex\/labs\//, '').replace(/\/$/, ''));
  const openBtn = (!opts.preview && key)
    ? '<button type="button" class="ctr-lab-open-btn" data-lab-key="' + esc(key) + '">Abrir</button>'
    : '';
  // A lab card explains itself in three beats (Élder): a one-line "o que é"
  // (summary), a short description, and the objective. All three come from the
  // code registry via the Trail overlay (lab-overlay.js), so they never go stale.
  const oneLine = item.summary ? '<p class="ctr-lab-summary">' + esc(item.summary) + '</p>' : '';
  const desc = item.description ? '<p class="ctr-lab-desc">' + esc(item.description) + '</p>' : '';
  const objective = item.objective
    ? '<p class="ctr-lab-objective"><span class="ctr-lab-obj-label">Objetivo</span>' + esc(item.objective) + '</p>'
    : '';
  return '<div class="ctr-lab-shell">' + oneLine + desc + objective + openBtn + '</div>';
}

// ── interativo (self-contained HTML the student explores, iframed fullscreen) ─
// An interativo item is shipped data like a lab: no body_md, meta_json carries
// { url } (js/interativos-registry.js). It reuses the lab card shell (three beats
// + open button) and the SAME fullscreen viewer, opened by url instead of lab key.
export function interativoHtml(item, opts = {}) {
  const meta = _meta(item);
  const url = meta.url || '';
  const openBtn = (!opts.preview && url)
    ? '<button type="button" class="ctr-lab-open-btn" data-interativo-url="' + esc(url) + '">Abrir</button>'
    : '';
  const oneLine = item.summary ? '<p class="ctr-lab-summary">' + esc(item.summary) + '</p>' : '';
  const desc = item.description ? '<p class="ctr-lab-desc">' + esc(item.description) + '</p>' : '';
  const objective = item.objective
    ? '<p class="ctr-lab-objective"><span class="ctr-lab-obj-label">Objetivo</span>' + esc(item.objective) + '</p>'
    : '';
  return '<div class="ctr-lab-shell">' + oneLine + desc + objective + openBtn + '</div>';
}

// ── lazy marked.js loader (markdown types) ───────────────────────────────────
let _markedLoading = false;
let _markedCallbacks = [];
function _loadMarked(cb) {
  if (window.marked) { cb(); return; }
  _markedCallbacks.push(cb);
  if (_markedLoading) return;
  _markedLoading = true;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
  s.onload = () => { _markedCallbacks.forEach((fn) => fn()); _markedCallbacks = []; };
  document.head.appendChild(s);
}

// ── copy-to-clipboard (prompt / generic markdown copy button) ────────────────
function _copyFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); } catch (_) { /* noop */ }
  document.body.removeChild(ta);
}
function _copyText(text, btn) {
  const flash = () => { btn.textContent = 'Copiado!'; setTimeout(() => { btn.textContent = 'Copiar'; }, 2000); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flash).catch(() => { _copyFallback(text); flash(); });
  } else {
    _copyFallback(text); flash();
  }
}
function _wireCopy(container, md) {
  const btn = container.querySelector('.ctr-copy-btn');
  if (btn) btn.addEventListener('click', () => _copyText(md, btn));
}

// ── DOM-applying renderers (verified on staging) ─────────────────────────────
function renderPrompt(item, container, opts) {
  container.innerHTML = promptHtml(item, opts);
  if (!opts.preview) _wireCopy(container, item.body_md || '');
}

function renderMarkdown(item, container, opts) {
  const md = item.body_md || '';
  container.innerHTML = '<div class="ctr-loading">Carregando...</div>';
  _loadMarked(() => {
    const html = window.marked.parse(md);
    const copyBtn = opts.preview ? '' : '<button class="ctr-copy-btn">Copiar</button>';
    container.innerHTML = '<div class="ctr-prompt-body">' + html + '</div>' + copyBtn;
    if (!opts.preview) _wireCopy(container, md);
  });
}

function renderGuide(item, container, opts) {
  const meta = _meta(item);
  const tabs = meta.platform_tabs || null;
  const tabKeys = tabs ? Object.keys(tabs).filter((k) => tabs[k]) : [];
  const hasMultipleTabs = tabKeys.length > 1;

  container.innerHTML = '<div class="ctr-loading">Carregando...</div>';
  _loadMarked(() => {
    const tabLabels = { windows: 'Windows', mac: 'Mac', linux: 'Linux' };
    if (hasMultipleTabs) {
      const tabNav = tabKeys.map((k, i) =>
        '<button class="ctr-tab-btn' + (i === 0 ? ' ctr-tab-active' : '') + '" data-tab="' + esc(k) + '">' + esc(tabLabels[k] || k) + '</button>',
      ).join('');
      const tabPanels = tabKeys.map((k, i) => {
        const html = window.marked.parse(tabs[k] || '');
        return '<div class="ctr-tab-panel' + (i === 0 ? '' : ' ctr-hidden') + '" data-panel="' + esc(k) + '">' +
          '<div class="ctr-prompt-body">' + html + '</div>' +
          '</div>';
      }).join('');
      container.innerHTML = '<div class="ctr-tab-nav">' + tabNav + '</div>' + tabPanels;

      const btns = container.querySelectorAll('.ctr-tab-btn');
      btns.forEach((btn) => {
        btn.addEventListener('click', () => {
          btns.forEach((b) => b.classList.remove('ctr-tab-active'));
          btn.classList.add('ctr-tab-active');
          const key = btn.getAttribute('data-tab');
          container.querySelectorAll('.ctr-tab-panel').forEach((p) => {
            if (p.getAttribute('data-panel') === key) p.classList.remove('ctr-hidden');
            else p.classList.add('ctr-hidden');
          });
        });
      });
    } else {
      const md = (hasMultipleTabs ? tabs[tabKeys[0]] : item.body_md) || '';
      const html = window.marked.parse(md);
      container.innerHTML = '<div class="ctr-prompt-body">' + html + '</div>';
    }
  });
}

function renderMaterial(item, container, opts) {
  const meta = _meta(item);
  const url = meta.attachment_url || '';
  container.innerHTML = '<div class="ctr-loading">Carregando...</div>';
  _loadMarked(() => {
    const bodyHtml = window.marked.parse(item.body_md || '');
    container.innerHTML =
      '<div class="ctr-affordance-row">' + affordanceBtnHtml(url, 'Baixar arquivo', opts.preview) + '</div>' +
      '<div class="ctr-prompt-body">' + bodyHtml + '</div>' +
      attachmentHtml(url);
  });
}

function renderLab(item, container, opts) {
  container.innerHTML = labHtml(item, opts);
  const btn = container.querySelector('.ctr-lab-open-btn');
  if (btn) btn.addEventListener('click', () => _openLabViewer({ key: btn.getAttribute('data-lab-key'), title: item.title }));
}

function renderInterativo(item, container, opts) {
  container.innerHTML = interativoHtml(item, opts);
  const btn = container.querySelector('.ctr-lab-open-btn');
  if (btn) btn.addEventListener('click', () => _openLabViewer({ url: btn.getAttribute('data-interativo-url'), title: item.title }));
}

function renderPaper(item, container, opts) {
  const md = item.body_md || '';
  if (md) {
    container.innerHTML = '<div class="ctr-loading">Carregando...</div>';
    _loadMarked(() => {
      const suppHtml = window.marked.parse(md);
      container.innerHTML = paperShellHtml(item, opts) +
        '<div class="ctr-paper-supplement ctr-prompt-body">' + suppHtml + '</div>';
    });
  } else {
    container.innerHTML = paperShellHtml(item, opts);
  }
}

// google_doc (legacy fallback): ingested markdown in body_md, rendered exactly
// like 'material' but with no attachment logic.
function renderGoogleDoc(item, container, opts) {
  renderMaterial({ body_md: item.body_md, meta_json: {} }, container, opts);
}

export function renderItem(item, container, opts = {}) {
  if (!item || !container) return;
  // A previa do admin lista os itens DE DENTRO. Élder 2026-08-05: "nos itens, do lado direito
  // ao selecionar o projeto, não lista dos documentos".
  //
  // O flag é `childrenList` e NÃO `preview`, que foi meu erro na primeira versão: `preview`
  // quer dizer "sem os botões de ação" e a trilha o passa em TODA linha, então (a) o painel
  // de Itens, que não passa flag nenhum, nunca mostrava a lista -- o defeito que o Élder
  // continuou vendo -- e (b) na trilha ela saía empilhada em cima da lista de verdade. Quem
  // pede esta lista é quem só quer LER o que tem dentro.
  //
  // Sem `case 'projeto'`: conter itens deixou de ser privilégio de um tipo, então a condição
  // é ter filhos, e uma tarefa com documentos dentro ganha a mesma lista de graça.
  if (opts.childrenList && item.children && item.children.length) {
    const body = document.createElement('div');
    const kids = document.createElement('div');
    kids.className = 'ctr-children';
    kids.innerHTML = childrenListHtml(item.children);
    container.innerHTML = '';
    container.appendChild(body);
    container.appendChild(kids);
    return renderItem(Object.assign({}, item, { children: null }), body, opts);
  }
  // O flag `verbatim` vem ANTES do tipo: quem manda mostrar o texto literal é o item, não o
  // palpite que a IA deu sobre o tipo dele (ver isVerbatim em js/item-download.js). O
  // dispatchType continua puro e por tipo, que é o que os testes dele travam; o que mudou é
  // que existe uma resposta com precedência sobre ele.
  if (isVerbatim(item)) return renderPrompt(item, container, opts);
  switch (dispatchType(item.type)) {
    case 'prompt':     return renderPrompt(item, container, opts);
    case 'guide':      return renderGuide(item, container, opts);
    case 'material':   return renderMaterial(item, container, opts);
    case 'arquivo':    return renderMaterial(item, container, opts);
    case 'paper':      return renderPaper(item, container, opts);
    case 'model_info': return renderModelInfo(item, container, opts);
    case 'google_doc': return renderGoogleDoc(item, container, opts);
    case 'lab':        return renderLab(item, container, opts);
    case 'interativo': return renderInterativo(item, container, opts);
    default:           return renderMarkdown(item, container, opts);
  }
}

// A lista, aninhada, do que um item carrega. Só leitura: quem edita é o bloco do editor.
// Achata pelo MESMO flattenTree que o editor usa, então as duas telas nunca discordam sobre
// o que está dentro de quê.
export function childrenListHtml(children) {
  const rows = flattenTree(children).map((r) => (
    '<li class="ctr-child" style="padding-left:' + (r.depth * 18) + 'px">' +
      '<span class="ctr-child-title">' + esc(r.item.title || ('#' + r.item.id)) + '</span>' +
      '<span class="ctr-child-type">' + esc(r.item.type_label || r.item.type || '') + '</span>' +
    '</li>'
  )).join('');
  return '<ul class="ctr-children-list">' + rows + '</ul>';
}

function renderModelInfo(item, container, opts) {
  container.innerHTML = modelInfoHtml(item, opts);
}
