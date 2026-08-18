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
import { itemFiles, isImageFile } from '../../js/item-files.js';
import { openMenu } from '../../js/menu.js';
import { downloadText, fileNameFromTitle, isDownloadable, isVerbatim } from '../../js/item-download.js';
import { downloadItemPdf, itemPdfBytes } from '../../js/item-pdf.js';
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

// All actions for an item, in priority order. The first is what the closed row used to
// show by itself before track-61, so a single-action item behaves identically.
//
// Before this it was a chain with a SINGLE `return`, and the effect was mutual exclusion:
// an item with an attachment LOST "Copiar" (Copy). Prompt + files together was impossible
// to represent.
//
// Lab, interativo (interactive), and tarefa (task) stay exclusive: the action IS the item,
// there's nothing to add on top of it.
export function getItemActions(item) {
  const single = _exclusiveAction(item);
  const pack = packageOf(item);
  const packAction = pack
    ? { kind: 'download-project', label: 'Baixar tudo (.zip)', shortLabel: '.zip', project: pack, icon: 'download' }
    : null;

  // The exclusive action COEXISTS with the package. A tarefa that carries documents inside
  // it (Elder 2026-08-05) needs both: "Entregar" (Submit) keeps being what the tarefa IS,
  // and "Baixar tudo" (Download all) is what it carries. Returning only the exclusive action
  // would hide the attachments; returning only the package would drop the submission.
  if (single) return packAction ? [single, packAction] : [single];

  const meta = getMeta(item);

  // A parent with children keeps its OWN file beside "Baixar tudo" (§34): a Skill's zip IS the
  // skill, and hiding it behind the bundle zip would make the essential download the awkward
  // one. What stays suppressed for a packager is the TEXT pair (copy / .md / PDF): the body is
  // meant to be read on screen, which is the confusion Elder caught on 2026-08-05 ("Copiar"
  // copied a blurb while "Baixar" brought 3 files).
  if (packAction) {
    const out = [];
    const own = itemFiles(meta)[0];
    if (own) {
      const img = isImageFile(own.name || own.url);
      out.push({ kind: 'open', label: img ? 'Ver imagem' : 'Baixar ' + own.name, shortLabel: own.name, url: own.url, icon: img ? 'external' : 'download' });
    }
    out.push(packAction);
    return out;
  }

  const out = [];
  if (meta.pdf_url) out.push({ kind: 'open', label: 'Baixar PDF', url: meta.pdf_url, icon: 'download' });
  // THE item's file, one slot (§34; the short-lived §28 list still READS as a list of one, so an
  // item staging wrote with the array shape keeps its button).
  const own = itemFiles(meta)[0];
  if (own) {
    const img = isImageFile(own.name || own.url);
    out.push({ kind: 'open', label: img ? 'Ver imagem' : 'Baixar', url: own.url, icon: img ? 'external' : 'download' });
  }
  if (meta.doc_url) out.push({ kind: 'open', label: 'Documentação', url: meta.doc_url, icon: 'external' });
  if (item.body_md) {
    out.push({ kind: 'copy', label: 'Copiar', text: item.body_md, icon: 'copy' });
    // Élder's rule, 2026-08-04: the student who sees the markdown SYMBOLS gets .md, the student
    // who sees it PROCESSED gets a PDF with everything laid out. Verbatim text is a prompt, made
    // to be pasted into an AI character by character; a PDF of it would be useless. The other
    // direction was left unbuilt until now, so every download came out as raw .md, including
    // text nobody ever saw as markdown.
    if (isVerbatim(item)) {
      out.push({ kind: 'download-md', label: 'Baixar .md', shortLabel: '.md', text: item.body_md, item, icon: 'download' });
    } else {
      out.push({ kind: 'download-pdf', label: 'Baixar PDF', shortLabel: 'PDF', item, icon: 'download' });
    }
  }
  return out;
}

// Does this item package others? The source is `item.children`, which the Worker returns
// from `ct_item_members`. An empty project offers no package.
// The item's package, FLATTENED with each piece's folder path. A child that also packages
// becomes a FOLDER in the zip with what it carries inside, so the structure the student
// sees in the trail is the same one they open in the unzip tool (Elder 2026-08-05).
//
// `items` is still the list of ids, now with `dir` alongside it, because whoever downloads
// needs both: the id to fetch via the same ct_get_item_public as always, and the dir to
// name it.
export function packageOf(item) {
  const kids = item && Array.isArray(item.children) ? item.children : null;
  if (!kids || !kids.length) return null;
  const items = [];
  let skipped = 0;
  (function walk(list, dir) {
    list.forEach((c) => {
      // Lab and interativo stay out of the package, but remain in the folder and in the
      // trail. They are COUNTED, not dropped: a zip with fewer files than the folder shows
      // has to say so, otherwise it passes as complete (Elder 2026-08-05).
      if (!isDownloadable(c)) skipped++;
      else items.push({ id: c.id, dir });
      // Only a PACKAGE becomes a folder in the zip. Indentation does NOT: it's display,
      // "just how it's going to appear in the trail" (Elder 2026-08-06). I had done it the
      // other way, mapping indentation to a directory, and that invented folders that don't
      // exist anywhere in the model.
      const sub = Array.isArray(c.children) ? c.children : null;
      if (sub && sub.length) walk(sub, dir + _dirName(c.title) + '/');
    });
  })(kids, '');
  // The parent's OWN file rides at the zip's root (§34): a Skill packing its tutorial must not
  // produce a zip that is missing the skill itself.
  const ownFiles = itemFiles(getMeta(item)).map((f) => f.url);
  return { name: String(item.title || 'pacote').replace(/^#+\s*/, ''), items, skipped, ownFiles };
}

// Folder name with the SAME cleanup as the file name (accents and a title's `#` don't
// survive the file system), just without an extension.
function _dirName(title) {
  return fileNameFromTitle(title, 'd').replace(/\.d$/, '');
}

// Re-exported, not redefined: the "cru" (raw) rule lives in js/item-download.js and now
// comes from an item FLAG, not the type (the comment there explains why). This `export`
// exists only because the trail already imported from here; a second body here is exactly
// how admin and trail would end up disagreeing about what counts as cru.
export { isVerbatim };

export function getItemAction(item) {
  return getItemActions(item)[0] || null;
}

function _exclusiveAction(item) {
  const meta = getMeta(item);
  if (item.type === 'tarefa') {
    // The Aulas (Lessons) tab doesn't deliver anything: it TAKES you to the Tarefas
    // (Tasks) tab, which owns the submission flow (Elder 2026-07-15). This also kills a
    // live bug: the "Resposta enviada" (Answer submitted) state came from localStorage
    // (`ct_tarefa_submitted_<item>_<turma>`), a key WITHOUT the student in it, so it was
    // PER BROWSER: a second student logging in on the same device saw the tarefa as
    // already submitted and couldn't submit. Here nothing is asked of localStorage
    // anymore; the Tarefas tab decides based on the `state` the server sends, which is
    // what actually knows the truth.
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
  // The glyph always comes BEFORE the label, chevron included: that's its place in every
  // button in the trail, and a single off-pattern button costs more than the dropdown
  // convention gains (Elder 2026-08-04, after checking the submit button).
  btn.innerHTML = (state.ICONS[action.icon] || state.ICONS.copy) + labelHtml;
  if (action.kind === 'submitted') btn.disabled = true;
  return btn;
}

// Runs an action. Only a direct button's 'open' path works on its own (it's an <a>),
// which is why it's not handled here: there's no anchor inside the menu, so we open it
// by hand.
function runAction(action, item, sub, opts, btn) {
  if (action.kind === 'copy') copyToClipboard(action.text, btn);
  else if (action.kind === 'download-md') downloadText(action.text, fileNameFromTitle(action.item.title, 'md'));
  // item-pdf.js is a few KB and imported normally; what is heavy is the vendored jsPDF binary,
  // and THAT is fetched by the module on the first call, never on page load. A failure has to
  // be audible: silence here reads as a dead button.
  else if (action.kind === 'download-pdf') {
    downloadItemPdf(action.item).catch((e) => {
      toast.err('Nao foi possivel gerar o PDF.');
      if (window.bsLog) window.bsLog('item pdf failed: ' + (e && e.message), 'error');
    });
  }
  else if (action.kind === 'download-project') downloadProject(action.project);
  else if (action.kind === 'submit') openTarefaSubmit(action.item, sub, opts);
  else if (action.kind === 'go-tarefas') goToTarefa(item.id);
  else if (action.kind === 'lab-open') openLabViewer({ key: action.key, title: item.title });
  else if (action.kind === 'interativo-open') openLabViewer({ url: action.url, title: item.title });
}

// Downloads all of the project's items as a .zip. The siblings come through the SAME
// `ct_get_item_public` that opening an item uses, so the class's access control applies
// the same way and there's no new Worker action: an item the student can't see fails
// there and stays out of the package.
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
  // Same format rule inside the package as outside it. Élder, 2026-08-16: "md has no rich text,
  // that's why I chose pdf; the actual prompts are in md". So a prompt travels as .md, because
  // its whole purpose is to be pasted into an AI character for character, and everything meant
  // to be READ travels as a formatted PDF. This closes track-61 §13.2, which had been left open
  // deliberately rather than decided for him.
  const texts = got.filter((i) => i && i.body_md);
  const entries = [];
  let pdfFailed = 0;
  for (const i of texts) {
    if (isVerbatim(i)) { entries.push({ title: i.title, text: i.body_md, dir: i._dir }); continue; }
    try {
      entries.push({ name: fileNameFromTitle(i.title, 'pdf'), bytes: await itemPdfBytes(i), dir: i._dir });
    } catch (e) {
      // A PDF that fails to render must not swallow the author's text: it goes in as .md and
      // the count says the package is not what it should have been.
      pdfFailed++;
      entries.push({ title: i.title, text: i.body_md, dir: i._dir });
      if (window.bsLog) window.bsLog('zip pdf failed for ' + i.id + ': ' + (e && e.message), 'error');
    }
  }
  // The attached FILES go in too. Until now the zip carried only typed text, so an item with a
  // PDF or a spreadsheet attached went into the package without it and the zip still looked
  // complete. /r2/ answers with Access-Control-Allow-Origin: *, so this is a plain fetch and
  // there is no new Worker action.
  const _fetchAsset = (u, dir) =>
    fetch(_assetSrc(u))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error('HTTP ' + r.status))))
      .then((buf) => ({ name: String(u).split('/').pop(), bytes: new Uint8Array(buf), dir }))
      .catch((e) => {
        if (window.bsLog) window.bsLog('zip asset failed ' + u + ': ' + (e && e.message), 'error');
        return null;
      });
  const fetched = await Promise.all([
    // The parent's own file, at the root (§34).
    ...(project.ownFiles || []).map((u) => _fetchAsset(u, '')),
    ...got.filter(Boolean).flatMap((i) => {
      const meta = getMeta(i);
      return [...itemFiles(meta).map((f) => f.url), meta.pdf_url].filter(Boolean).map((u) => _fetchAsset(u, i._dir));
    }),
  ]);
  const files = fetched.filter(Boolean);
  entries.push(...files);
  const filesFailed = fetched.length - files.length;
  if (!entries.length) { toast.err('Nao foi possivel montar o pacote.'); return; }
  downloadZip(entries, fileNameFromTitle(project.name, 'zip'));
  // Partial failure is stated out loud: a zip with 2 of 3 files would pass as complete.
  // But the count is of items that DID NOT COME BACK, not of items without a body: with
  // nesting, a grouper enters the list only to name the folder and legitimately has no
  // text of its own. Counting by `entries` would flag failure for an entire package.
  const failed = got.filter((i) => !i).length + filesFailed;
  if (failed) {
    toast.err('O pacote saiu sem ' + failed + (failed === 1 ? ' arquivo.' : ' arquivos.'));
  }
  if (pdfFailed) {
    toast.err(pdfFailed === 1
      ? '1 item saiu como .md porque o PDF falhou.'
      : pdfFailed + ' itens sairam como .md porque o PDF falhou.');
  }
  // What doesn't fit in a file is stated, not hidden: a zip with fewer items than the
  // folder shows would pass as complete. Nothing takes their place ("we're not going to
  // add anything to the zip because it makes no sense", Elder 2026-08-05).
  if (project.skipped) {
    toast.info(project.skipped === 1
      ? '1 lab ou interativo não entra no .zip; ele abre na trilha.'
      : project.skipped + ' labs ou interativos não entram no .zip; eles abrem na trilha.');
  }
}

// Mounts an item's actions into a container. ONE parametrized mount, used by the Aulas
// tab row and by the flat cards' body (Apostila/Outros), never two separate wirings.
//
// One action: the same direct button as always, byte for byte like before track-61. Two
// or more: ONE "Ações" (Actions) trigger with a chevron in place of the glyph, opening the
// shared menu (js/menu.js). N teal buttons side by side would squeeze the title, and on
// mobile the button is icon-only (mobile.css), so three icons in a row would be unreadable.
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
      if (action.kind === 'open') return; // the <a> opens on its own
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

// Takes the student to the Tarefas tab, already on that tarefa's card. Reuses the
// deep-focus that the notification bell uses (focusTarefa): same problem, same solution,
// nothing duplicated. Dynamic import because tarefas.js imports page.js, and a static
// import here would close the cycle.
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

// The action of a FLAT card (Apostila / Outros tabs), mounted in the card HEADER, beside the
// chevron, exactly where the Aulas tab puts it.
//
// It used to be appended to the bottom of the expanded body, which is why Élder saw the same
// item behave differently depending on which tab he opened it from: header in a lesson, end of
// the text in Outros. The two slots were already the same shape in CSS (`.cdx-tr-actions` and
// `.cdx-tr-sub-actions` are both a non-shrinking flex row), so this is a change of host, not a
// change of layout.
//
// Cleared before mounting because the header OUTLIVES the body: the body is destroyed on
// collapse and rebuilt on the next open, so mounting without clearing would stack a second
// button on every reopen. The button then stays after collapsing, which is what the Aulas tab
// already does.
export function mountFlatCardAction(card, item) {
  const host = card.querySelector('.cdx-tr-card-header .cdx-tr-actions');
  if (!host) return;
  const previous = host.querySelector('.cdx-tr-flat-action');
  if (previous) previous.remove();
  if (!getItemActions(item).length) return;
  const slot = document.createElement('span');
  slot.className = 'cdx-tr-flat-action';
  // Before the chevron: the chevron is the card's own affordance and stays closest to the edge.
  host.insertBefore(slot, host.firstChild);
  mountActions(slot, item, {});
}
