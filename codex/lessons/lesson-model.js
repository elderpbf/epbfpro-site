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
// an optional resolver (idStr -> item) injected by the caller (the labs-registry
// findItem); when absent, lab ids simply do not resolve here.
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
  slide: 'iframe', embed: 'iframe', lab: 'iframe', interativo: 'iframe',
  popup_url: 'popup', drive_folder: 'drive_folder', drive_file: 'drive_file', video: 'video',
};
export function rendererStrategy(type) {
  return _STRATEGY[type] || 'fallback';
}

// ── Items grouped by content type (mirrors the legacy Items section) ─────────
// The Items bucket is sub-grouped by item.type in an opinionated order matching
// how the teacher thinks about a lesson (tasks, then content, then visual aids,
// then the rest). Unknown types are appended in encounter order.
export const TYPE_ORDER = ['tarefa', 'conteudo', 'slide', 'prompt', 'material', 'paper'];
export function groupItemsByType(items) {
  const groups = new Map();
  for (const it of (items || [])) {
    const k = it.type || '__other__';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const ordered = [];
  for (const k of TYPE_ORDER) if (groups.has(k)) ordered.push(k);
  for (const k of groups.keys()) if (ordered.indexOf(k) === -1) ordered.push(k);
  return ordered.map((k) => ({ typeKey: k, items: groups.get(k) }));
}

// Coloured icon "zone" class for an item by type (mirrors classvault _zoneClassFor).
// '' = the default primary-coloured zone. Colours live in lessons.css
// (--task / --llm / --recurso / --material).
export function zoneClassFor(type) {
  switch (type) {
    case 'tarefa':     return 'tarefa';
    case 'prompt':     return 'material';
    case 'guide':      return 'recurso';
    case 'material':   return 'material';
    case 'paper':      return 'recurso';
    case 'model_info': return 'recurso';
    case 'embed':      return 'recurso';
    case 'popup_url':  return 'llm';
    default:           return '';
  }
}

// Iframe types control their own font, so the +A/-A text-resize is off for them;
// any item with body_md (rendered by the Markdown card) is resizable.
const _IFRAME_TYPES = new Set(['slide', 'embed', 'lab', 'interativo', 'video', 'drive_file', 'drive_folder']);
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

// ── Bottom-bar actions (mirrors cv-type-registry.js + the classvault crumb) ──
// The launch URL for the popup ("Abrir em janela") action, by type. slide and
// popup_url use meta_json.url verbatim; drive_file falls back to a /view link
// built from file_id (matching the legacy drive_file registry entry). '' = no
// launch available. meta_json is read as an object, as the cv_get_codex_view
// vault delivers it (same as the legacy renderers).
export function popupUrlFor(item) {
  if (!item) return '';
  const meta = item.meta_json || {};
  if (item.type === 'slide' || item.type === 'popup_url') return meta.url || '';
  if (item.type === 'drive_file') {
    return meta.url || (meta.file_id ? 'https://drive.google.com/file/d/' + meta.file_id + '/view' : '');
  }
  return '';
}

const _POPUP_TYPES = new Set(['slide', 'drive_file', 'popup_url']);
const _NO_ACTION_TYPES = new Set(['llm', 'embed', 'lab', 'video', 'drive_folder']);
// Ordered action descriptors for the item's bottom bar. 'popup' carries its
// resolved url; 'copy' copies body_md (any unregistered type that has body
// content). Editing is wired in Phase 3B, so 'edit' is intentionally not emitted
// here. Drive "Copiar texto" is gated separately by driveItemCanCopyText.
export function crumbActions(item) {
  if (!item) return [];
  if (_POPUP_TYPES.has(item.type)) {
    const url = popupUrlFor(item);
    return url ? [{ id: 'popup', url }] : [];
  }
  if (_NO_ACTION_TYPES.has(item.type)) return [];
  return (item.body_md && String(item.body_md).trim()) ? [{ id: 'copy' }] : [];
}

// ── Text-scale store (localStorage-backed; storage injected for testability) ──
// Mirrors the legacy +A/-A control: clamps to [0.75, 1.6] at 2-decimal
// precision, default 1. Shares the legacy 'cv_content_scale' key so the
// preference carries across the cutover.
export function makeTextScale(storage, key) {
  key = key || 'cv_content_scale';
  // MAX raised to 3.0 (Elder, 2026-06-01): big rooms sometimes need huge text.
  const MIN = 0.75, MAX = 3.0, STEP = 0.1;
  const clamp = (s) => Math.max(MIN, Math.min(MAX, +Number(s).toFixed(2)));
  return {
    MIN, MAX, STEP,
    get() {
      let raw = null;
      try { raw = storage && storage.getItem(key); } catch (_) { /* ignore */ }
      const n = parseFloat(raw);
      return Number.isFinite(n) ? clamp(n) : 1;
    },
    set(v) {
      const c = clamp(v);
      try { if (storage) storage.setItem(key, String(c)); } catch (_) { /* ignore */ }
      return c;
    },
    bump(cur, delta) { return clamp(cur + delta); },
  };
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

// ── Hardcoded LLM launchers (mirror the legacy LLMs section) ─────────────────
// The static web-LLM tools that open in a new tab, shown above any DB llm items.
// Favicons come from Google S2 so we do not depend on each provider's own icon.
export const LLM_LAUNCHERS = [
  { name: 'ChatGPT',    url: 'https://chatgpt.com/',           domain: 'chatgpt.com' },
  { name: 'Claude',     url: 'https://claude.ai/',             domain: 'claude.ai' },
  { name: 'Gemini',     url: 'https://gemini.google.com/',     domain: 'gemini.google.com' },
  { name: 'Grok',       url: 'https://grok.com/',              domain: 'grok.com' },
  { name: 'NotebookLM', url: 'https://notebooklm.google.com/', domain: 'notebooklm.google.com' },
  { name: 'Perplexity', url: 'https://www.perplexity.ai/',     domain: 'perplexity.ai' },
];

// Group Drive items by folder (mirrors the legacy Drive folder subsections).
// Folder name comes from meta_json.folder_name; rootless items fall under '(raiz)'.
export function groupDriveByFolder(items) {
  const map = new Map();
  for (const it of (items || [])) {
    const m = it.meta_json || {};
    const name = (m.folder_name && String(m.folder_name).trim()) || '(raiz)';
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(it);
  }
  return Array.from(map.entries()).map(([folder, list]) => ({ folder, items: list }));
}

// ── Content-WIDTH store (localStorage-backed; storage injected for testability)
// Fraction [0,1]: 0 = the comfortable measure (CONTENT_MIN_PX), 1 = full window.
// Mirrors the monolith's width slider; default sits wider than the minimum.
export const CONTENT_MIN_PX = 760;
export function makeContentWidth(storage, key) {
  key = key || 'cv_content_width';
  const DEFAULT = 0.35;
  const clamp = (f) => Math.max(0, Math.min(1, Number(f)));
  return {
    DEFAULT,
    get() {
      let raw = null;
      try { raw = storage && storage.getItem(key); } catch (_) { /* ignore */ }
      const n = parseFloat(raw);
      return Number.isFinite(n) ? clamp(n) : DEFAULT;
    },
    set(f) {
      const c = clamp(f);
      try { if (storage) storage.setItem(key, String(c)); } catch (_) { /* ignore */ }
      return c;
    },
    // Resolve a fraction to a CSS max-width for an available pixel width.
    // >=0.999 returns null = "full window" (caller drops the cap).
    toMaxWidthPx(f, availPx) {
      if (f >= 0.999) return null;
      const avail = availPx && availPx > CONTENT_MIN_PX ? availPx : CONTENT_MIN_PX;
      return Math.round(CONTENT_MIN_PX + clamp(f) * (avail - CONTENT_MIN_PX));
    },
  };
}
