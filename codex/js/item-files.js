// js/item-files.js
// AN ITEM CARRIES AT MOST ONE FILE; MORE FILES ARE ITEMS.
//
// The 2026-08-17 build let one item hold an anonymous LIST of files, and Élder killed it the
// next morning: *"each file added is an item... they are items that should show in the hierarchy
// and have names and descriptions and so on. otherwise i won't be able to view an image without
// downloading it"*. He is right by the system's own doctrine: the moment a file needs a name, a
// description or an inline view, it needs a TYPE, and type lives on items. So: the FIRST file
// attaches to the item itself (the single slot every item always had); every further file
// becomes a CHILD ITEM through the same members machinery packages use, with its own inferred
// type, title and description.
//
// NO MIGRATION. `meta_json.attachment_url` stays the storage for the one file. Reading tolerates
// the short-lived `attachments` array (staging wrote a few) by folding it into a list; writing
// only ever emits one entry, mirrored into the legacy scalar. Anything old keeps working.
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

// PURE. Which type a file-born child item should get, decided by the file NAME against the
// TYPES that actually exist in the registry (admin-editable, so no slug can be assumed). The
// answer is a PREFILL: the row shows a select and the teacher overrides at will.
//   types: the loaded registry [{slug, family, ...}]
// Falls back down a preference chain and finally to the first item-family type, so it always
// returns something the registry can hold.
export function inferChildType(types, filename) {
  const list = (types || []).filter((ty) => (ty.family || 'item') !== 'bundle');
  const has = (slug) => list.some((ty) => ty.slug === slug);
  const ext = String(filename || '').toLowerCase().split('.').pop();
  let prefs;
  if (/^(png|jpe?g|webp|gif|svg|avif)$/.test(ext)) prefs = ['foto', 'imagem', 'image', 'material'];
  else if (ext === 'zip') prefs = ['skill', 'material', 'documento'];
  else prefs = ['documento', 'material', 'doc'];
  for (const slug of prefs) if (has(slug)) return slug;
  return list.length ? list[0].slug : '';
}

// PURE. The editor's files panel: the item's OWN file (one row), then its children, then the
// files picked this session that will BECOME children on save. Pending-child rows carry an
// editable title and a type select, because renaming there is the whole ceremony (Fable:
// "prefilled, rename if you care").
//   own          {url, name} | null       the stored file
//   pendingOwn   {name} | null            a file picked for the slot, uploads on save
//   children     [{id, title, type_label, iconHtml}]
//   pendingChildren [{name, title, type}]
//   types        the registry, for the type select
//   labels       { remove, pending, childPending, ownLabel, childrenLabel }
export function filesPanelHtml(own, pendingOwn, children, pendingChildren, types, labels) {
  const L = labels || {};
  const rows = [];
  if (own) {
    rows.push('<li class="cdx-file-row">' +
      '<a class="cdx-file-name" href="' + esc(own.url) + '" target="_blank" rel="noopener">' + esc(own.name) + '</a>' +
      '<button type="button" class="cdx-file-del" data-own-del="1" aria-label="' + esc(L.remove || '') + '" title="' + esc(L.remove || '') + '">&times;</button>' +
    '</li>');
  }
  if (pendingOwn) {
    rows.push('<li class="cdx-file-row is-pending">' +
      '<span class="cdx-file-name">' + esc(pendingOwn.name) + '</span>' +
      '<span class="cdx-file-pending">' + esc(L.pending || '') + '</span>' +
      '<button type="button" class="cdx-file-del" data-pending-own-del="1" aria-label="' + esc(L.remove || '') + '" title="' + esc(L.remove || '') + '">&times;</button>' +
    '</li>');
  }
  (children || []).forEach((c) => {
    rows.push('<li class="cdx-file-row is-child" data-child-id="' + esc(c.id) + '">' +
      '<span class="cdx-file-icon">' + (c.iconHtml || '') + '</span>' +
      '<span class="cdx-file-name">' + esc(c.title) + '</span>' +
      '<span class="cdx-file-type">' + esc(c.type_label || '') + '</span>' +
      '<button type="button" class="cdx-file-del" data-child-del="' + esc(c.id) + '" aria-label="' + esc(L.remove || '') + '" title="' + esc(L.remove || '') + '">&times;</button>' +
    '</li>');
  });
  const opts = (sel) => (types || [])
    .filter((ty) => (ty.family || 'item') !== 'bundle')
    .map((ty) => '<option value="' + esc(ty.slug) + '"' + (ty.slug === sel ? ' selected' : '') + '>' + esc(ty.label || ty.slug) + '</option>')
    .join('');
  (pendingChildren || []).forEach((f, i) => {
    rows.push('<li class="cdx-file-row is-pending is-child" data-pending-child-i="' + i + '">' +
      '<input type="text" class="cdx-file-title" data-pchild-title="' + i + '" value="' + esc(f.title) + '">' +
      '<select class="cdx-file-typesel" data-pchild-type="' + i + '">' + opts(f.type) + '</select>' +
      '<span class="cdx-file-pending">' + esc(L.childPending || '') + '</span>' +
      '<button type="button" class="cdx-file-del" data-pchild-del="' + i + '" aria-label="' + esc(L.remove || '') + '" title="' + esc(L.remove || '') + '">&times;</button>' +
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
