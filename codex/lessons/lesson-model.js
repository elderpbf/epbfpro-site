// lessons/lesson-model.js
// Pure, DOM-free, CSS-free logic for the Lessons (Aula) tab. No markup, no styling,
// no window/document access. The Lessons view (lessons.js) and the per-type
// renderers (Phase 3A-ii) consume these; keeping them here makes the renderers
// thin wrappers over tested logic and lets this layer ship independently of the
// layout-contract work. Ported faithfully from the legacy classvault.js +
// cv-type-registry.js helpers.

// ── Vault classification ─────────────────────────────────────────────────────
// Partition a turma's released vault into the sidebar's type buckets. Drive
// files, tarefas and apostila (set membership) win over the generic type checks.
export function classifyVault(items) {
  const bucket = { llm: [], external: [], items: [], apostila: [], tarefas: [], drive: [] };
  for (const it of (items || [])) {
    if (it.type === 'drive_file') bucket.drive.push(it);
    else if (it.type === 'tarefa') bucket.tarefas.push(it);
    else if (it.set_id != null) bucket.apostila.push(it);
    else if (it.type === 'llm') bucket.llm.push(it);
    else if (it.type === 'popup_url') bucket.external.push(it);
    else bucket.items.push(it);
  }
  return bucket;
}

// Ordered, conditional section list for a classified vault. Empty buckets are
// dropped, except "items" which always shows.
export const SECTION_ORDER = ['llm', 'external', 'drive', 'items', 'apostila', 'tarefas'];
export function sidebarSections(buckets) {
  return SECTION_ORDER
    .filter((key) => key === 'items' || (buckets[key] && buckets[key].length))
    .map((key) => ({ key, items: buckets[key] || [] }));
}

// Locate an item across the three id namespaces. 'lab:' / 'drive:' are synthetic;
// numeric ids hit the ct_items vault. Returns { item, source } or null. findLab is
// an optional resolver (idStr -> item) injected by the caller (window.CVLabs).
export function findItem(itemId, ctx) {
  ctx = ctx || {};
  const idStr = String(itemId);
  if (idStr.indexOf('lab:') === 0) {
    const it = typeof ctx.findLab === 'function' ? ctx.findLab(idStr) : null;
    return it ? { item: it, source: 'lab' } : null;
  }
  if (idStr.indexOf('drive:') === 0) {
    const it = (ctx.driveItems || []).find((d) => d.id === idStr);
    return it ? { item: it, source: 'drive' } : null;
  }
  const idNum = Number(itemId);
  const it = (ctx.vault || []).find((x) => Number(x.id) === idNum);
  if (!it) return null;
  // drive_file rows live in ct_items but render through the Drive path.
  if (it.type === 'drive_file') return { item: it, source: 'drive' };
  return { item: it, source: 'vault' };
}

// ── Renderer dispatch (mirrors the legacy ClassVault.renderers registry) ─────
// Returns the strategy key for an item type. 'fallback' renders the Markdown card
// via the shared renderer; the rest are iframe/card embeds (Phase 3A-ii).
const _STRATEGY = {
  slide: 'iframe', embed: 'iframe', lab: 'iframe',
  popup_url: 'popup', drive_folder: 'drive_folder', drive_file: 'drive_file', video: 'video',
};
export function rendererStrategy(type) {
  return _STRATEGY[type] || 'fallback';
}

// Iframe types control their own font, so the +A/-A text-resize is off for them;
// any item with body_md (rendered by the Markdown card) is resizable.
const _IFRAME_TYPES = new Set(['slide', 'embed', 'lab', 'video', 'drive_file', 'drive_folder']);
export function supportsTextResize(item) {
  if (!item) return false;
  if (_IFRAME_TYPES.has(item.type)) return false;
  return !!(item.body_md && String(item.body_md).trim());
}

// ── URL / embed helpers (pure) ───────────────────────────────────────────────
export function extractDriveFolderId(url) {
  const m = String(url || '').match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}
export function extractDriveFileId(url) {
  const m = String(url || '').match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : '';
}
export function driveFolderEmbedUrl(meta) {
  meta = meta || {};
  const id = meta.folder_id || extractDriveFolderId(meta.url || '');
  return id ? 'https://drive.google.com/embeddedfolderview?id=' + encodeURIComponent(id) : '';
}
export function driveFileEmbedUrl(meta) {
  meta = meta || {};
  const id = meta.file_id || extractDriveFileId(meta.url || '');
  return id ? 'https://drive.google.com/file/d/' + encodeURIComponent(id) + '/preview' : '';
}
export function toVideoEmbedUrl(url) {
  const s = String(url || '');
  if (!s) return '';
  let m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|shorts\/|embed\/))([a-zA-Z0-9_-]{11})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1];
  m = s.match(/tiktok\.com\/[^/]+\/video\/(\d+)/);
  if (m) return 'https://www.tiktok.com/embed/v2/' + m[1];
  return '';
}
// A Drive file's text can be copied client-side only for Google Docs / plain text.
export function driveItemCanCopyText(mimeType, fileName) {
  if (mimeType === 'application/vnd.google-apps.document') return true;
  if (mimeType === 'text/plain' || mimeType === 'text/markdown') return true;
  if (fileName && /\.(txt|md)$/i.test(fileName)) return true;
  return false;
}

// ── Favorites store (localStorage-backed; storage injected for testability) ──
// Stored as a JSON array of stringified ids (numeric, 'drive:<id>', 'lab:<key>').
export function makeFavorites(storage, key) {
  key = key || 'cv_favorites_v1';
  const _read = () => {
    try {
      const raw = storage && storage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr.map(String) : []);
    } catch (_) { return new Set(); }
  };
  const _write = (set) => {
    try { if (storage) storage.setItem(key, JSON.stringify(Array.from(set))); } catch (_) { /* ignore */ }
  };
  return {
    has(id) { return _read().has(String(id)); },
    all() { return Array.from(_read()); },
    toggle(id) {
      const set = _read();
      const k = String(id);
      if (set.has(k)) set.delete(k); else set.add(k);
      _write(set);
      return set.has(k);
    },
  };
}
