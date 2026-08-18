// js/item-files.js
// AN ITEM CARRIES FILES, PLURAL.
//
// Élder, 2026-08-17: *"ele só permite colocar 1 arquivo por vez. Eu tenho que poder colocar
// vários arquivos no mesmo item. O item não é um arquivo, ele é uma ENTIDADE... eu tenho que
// poder adicionar arquivos, substituir arquivo, apagar arquivo, adicionar um novo"*.
//
// It is the same law as §25.3 (the type is what a thing IS, never what it carries) applied to
// the COUNT: allowing exactly one file also confuses the entity with its stamp. And it is not
// the package: a package groups ITEMS, each with its own title, type and release. These are
// files of a single item, with no separate existence.
//
// NO MIGRATION. `meta_json.attachment_url` was a single string and stays readable forever:
// reading normalises it into a list of one, and writing keeps the first file mirrored back into
// it, so anything that still reads the old field (or an old page still cached in a browser)
// keeps working. Same pattern as §11.
import { esc } from './dom.js';

// PURE. The file name a URL ends in, without the R2 key path around it.
export function fileNameFromUrl(url) {
  const s = String(url == null ? '' : url).split('?')[0].split('#')[0];
  const tail = s.split('/').pop() || '';
  try { return decodeURIComponent(tail); } catch (_) { return tail; }
}

// PURE. Every file an item carries, oldest first: [{ url, name }].
// Accepts meta_json as an object or as the JSON string the Worker returns.
export function itemFiles(meta) {
  const m = _asObject(meta);
  if (!m) return [];
  const out = [];
  const seen = new Set();
  const push = (url, name) => {
    const u = String(url || '').trim();
    if (!u || seen.has(u)) return;
    seen.add(u);
    out.push({ url: u, name: String(name || '').trim() || fileNameFromUrl(u) });
  };
  // The list wins where both exist, and the legacy scalar is folded in rather than ignored: an
  // item written by an older page has only the scalar, and one written mid-transition has both.
  if (Array.isArray(m.attachments)) {
    for (const a of m.attachments) {
      if (typeof a === 'string') push(a, '');
      else if (a && typeof a === 'object') push(a.url, a.name);
    }
  }
  push(m.attachment_url, m.attachment_name);
  return out;
}

// PURE. meta_json with `files` as its file list. Writes BOTH shapes on purpose: `attachments` is
// the truth, `attachment_url` mirrors the first one so nothing that still reads the old field
// goes blind. An empty list clears both rather than leaving a stale url behind.
export function withItemFiles(meta, files) {
  const m = Object.assign({}, _asObject(meta) || {});
  const list = (files || [])
    .map((f) => ({ url: String((f && f.url) || '').trim(), name: String((f && f.name) || '').trim() }))
    .filter((f) => f.url)
    .map((f) => ({ url: f.url, name: f.name || fileNameFromUrl(f.url) }));
  if (!list.length) {
    delete m.attachments;
    delete m.attachment_url;
    delete m.attachment_name;
    return m;
  }
  m.attachments = list;
  m.attachment_url = list[0].url;
  m.attachment_name = list[0].name;
  return m;
}

// PURE. Is this file something to LOOK at rather than download? Decides the label and the icon
// on the trail, nothing else.
export function isImageFile(urlOrName) {
  return /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(String(urlOrName || '').split('?')[0]);
}

// PURE. The rows of the editor's file list, ready to paint. `pending` are files chosen in this
// session that have not been uploaded yet, so they have a name and no url.
//   opts: { labels: { remove, pending }, rowClass }
export function fileListHtml(files, pending, labels) {
  const L = labels || {};
  const rows = [];
  (files || []).forEach((f, i) => {
    rows.push('<li class="cdx-file-row" data-file-i="' + i + '">' +
      '<a class="cdx-file-name" href="' + esc(f.url) + '" target="_blank" rel="noopener">' + esc(f.name) + '</a>' +
      '<button type="button" class="cdx-file-del" data-file-del="' + i + '" aria-label="' + esc(L.remove || '') + '" title="' + esc(L.remove || '') + '">&times;</button>' +
    '</li>');
  });
  (pending || []).forEach((f, i) => {
    rows.push('<li class="cdx-file-row is-pending" data-pending-i="' + i + '">' +
      '<span class="cdx-file-name">' + esc(f.name) + '</span>' +
      '<span class="cdx-file-pending">' + esc(L.pending || '') + '</span>' +
      '<button type="button" class="cdx-file-del" data-pending-del="' + i + '" aria-label="' + esc(L.remove || '') + '" title="' + esc(L.remove || '') + '">&times;</button>' +
    '</li>');
  });
  if (!rows.length) return '';
  return '<ul class="cdx-file-list">' + rows.join('') + '</ul>';
}

function _asObject(meta) {
  if (!meta) return null;
  if (typeof meta === 'string') {
    try { return JSON.parse(meta) || null; } catch (_) { return null; }
  }
  return typeof meta === 'object' ? meta : null;
}
