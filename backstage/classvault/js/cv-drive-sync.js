'use strict';

// cv-drive-sync.js — ClassVault Drive mirror.
// Phase 5 refactor: delegates all OAuth / token management to window.BS_GOOGLE.
// This module owns: Drive folder fetching, MIME mapping, item synthesis.
// Public API: window.CVDriveSync = { init, syncNow, connect, getItems, isAuthed, isPending }

const CV_DRIVE_ROOT_FOLDER_ID = '1zR2ugAYShUmN_E5scM7om6Qy1y0iE2Mi';

const CV_ITEMS_KEY    = 'cv_drive_items_v1';
const CV_ITEMS_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Internal state
let _syncing = false;

// ── Items cache (sessionStorage, ClassVault-specific) ────────────────────────

function _getCachedItems() {
  try {
    const raw = sessionStorage.getItem(CV_ITEMS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (Date.now() - parsed.ts > CV_ITEMS_TTL_MS) return null;
    return parsed.items;
  } catch (_) {
    return null;
  }
}

function _storeCachedItems(items) {
  try {
    sessionStorage.setItem(CV_ITEMS_KEY, JSON.stringify({ items, ts: Date.now() }));
  } catch (_) {}
}

function _clearCache() {
  try { sessionStorage.removeItem(CV_ITEMS_KEY); } catch (_) {}
}

// ── MIME mapping (ClassVault-specific) ───────────────────────────────────────

// Icons use text-presentation Unicode glyphs (not emoji) so they inherit the
// zone color via CSS. Keeps contrast legible across light + dark themes.
function _mimeToMeta(mimeType, fileName) {
  if (mimeType === 'application/vnd.google-apps.presentation') {
    return { type: 'popup_url', label: 'Slides', icon: '▶' };
  }
  if (mimeType === 'application/vnd.google-apps.document') {
    return { type: 'drive_file', label: 'Doc', icon: '¶' };
  }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return { type: 'drive_file', label: 'Planilha', icon: '▦' };
  }
  if (mimeType === 'application/pdf') {
    return { type: 'drive_file', label: 'PDF', icon: '▥' };
  }
  if (mimeType === 'application/vnd.google-apps.folder') {
    return null; // skip; folders become section headers
  }
  if (mimeType === 'text/markdown' || (fileName && fileName.endsWith('.md'))) {
    return { type: 'drive_file', label: 'Markdown', icon: '#' };
  }
  if (mimeType && mimeType.startsWith('image/')) {
    return { type: 'drive_file', label: 'Imagem', icon: '◫' };
  }
  if (mimeType && mimeType.startsWith('video/')) {
    return { type: 'drive_file', label: 'Vídeo', icon: '►' };
  }
  return { type: 'drive_file', label: 'Arquivo', icon: '◆' };
}

// Synthesize a ClassVault item from a raw Drive file object.
function _synthesizeItem(file, subfolderName) {
  const meta = _mimeToMeta(file.mimeType, file.name);
  if (!meta) return null; // folder, skip

  let metaJson = { file_id: file.id, mimeType: file.mimeType, url: file.webViewLink || '' };
  if (meta.type === 'popup_url') {
    metaJson.url = 'https://docs.google.com/presentation/d/' + file.id + '/embed?start=false&loop=false';
  }

  return {
    id: 'drive:' + file.id,
    title: file.name,
    type: meta.type,
    type_label: meta.label,
    type_icon: meta.icon,
    summary: subfolderName || '',
    meta_json: metaJson
  };
}

// Fetch root folder + one level of subfolders. Returns synthesized item list.
async function _fetchDriveItems() {
  const rootFiles = await window.BS_GOOGLE.drive.listFolder(CV_DRIVE_ROOT_FOLDER_ID);

  const subfolders = rootFiles.filter(function(f) {
    return f.mimeType === 'application/vnd.google-apps.folder';
  });
  const rootOnlyFiles = rootFiles.filter(function(f) {
    return f.mimeType !== 'application/vnd.google-apps.folder';
  });

  // Fetch all subfolder contents in parallel.
  const subContents = await Promise.all(
    subfolders.map(function(sf) {
      return window.BS_GOOGLE.drive.listFolder(sf.id).then(function(files) {
        return { folder: sf, files };
      }).catch(function() {
        return { folder: sf, files: [] };
      });
    })
  );

  const items = [];

  for (const file of rootOnlyFiles) {
    const item = _synthesizeItem(file, '');
    if (item) { item._group = '__raiz__'; items.push(item); }
  }

  for (const { folder, files } of subContents) {
    for (const file of files) {
      const item = _synthesizeItem(file, folder.name);
      if (item) { item._group = folder.name; items.push(item); }
    }
  }

  return items;
}

// ── Public API ────────────────────────────────────────────────────────────────

window.CVDriveSync = {

  // Call once after page load. If Google-authed and items cached, pre-populates
  // ClassVault.driveItems. If authed but no cache, fetches silently in background.
  init: function() {
    if (!window.BS_GOOGLE || !window.BS_GOOGLE.isAuthed()) return;

    const cached = _getCachedItems();
    if (cached) {
      window.ClassVault.driveItems = cached;
      if (typeof _renderDriveSectionOnly === 'function') _renderDriveSectionOnly();
      return;
    }

    // Token exists but no cache: fetch silently.
    _fetchDriveItems().then(function(items) {
      _storeCachedItems(items);
      window.ClassVault.driveItems = items;
      if (typeof _renderDriveSectionOnly === 'function') _renderDriveSectionOnly();
    }).catch(function() {
      // Silent: sidebar will show upgrade prompt if needed.
    });
  },

  // Force a re-fetch, bypassing cache. Called by the Sync button.
  syncNow: async function() {
    if (_syncing) return;
    _syncing = true;
    try {
      if (!window.BS_GOOGLE || !window.BS_GOOGLE.isAuthed()) {
        // Not authed via Google — request token in-place (upgrade from password session).
        await window.BS_GOOGLE.requestToken({});
      }
      _clearCache();
      const items = await _fetchDriveItems();
      _storeCachedItems(items);
      window.ClassVault.driveItems = items;
      if (typeof _renderDriveSectionOnly === 'function') _renderDriveSectionOnly();
    } catch (err) {
      const msg = err && err.message;
      if (window.BSToast) BSToast.show('Erro ao sincronizar Drive: ' + (msg || 'erro desconhecido'));
    } finally {
      _syncing = false;
    }
  },

  // Request token via popup and sync. Called by "Conectar para sincronizar Drive"
  // prompt when user is password-authed (upgrades session in-place).
  connect: async function() {
    _syncing = true;
    try {
      await window.BS_GOOGLE.requestToken({ prompt: 'consent' });
      _clearCache();
      const items = await _fetchDriveItems();
      _storeCachedItems(items);
      window.ClassVault.driveItems = items;
      if (typeof _renderDriveSectionOnly === 'function') _renderDriveSectionOnly();
    } catch (err) {
      const msg = err && err.message;
      if (window.BSToast) BSToast.show('Erro ao conectar ao Drive: ' + (msg || 'erro desconhecido'));
    } finally {
      _syncing = false;
    }
  },

  getItems: function() {
    return (window.ClassVault && window.ClassVault.driveItems) || [];
  },

  isAuthed: function() {
    return window.BS_GOOGLE ? window.BS_GOOGLE.isAuthed() : false;
  },

  // No longer pending: OAuth client ID is in BS_GOOGLE, always configured.
  isPending: function() {
    return false;
  }
};
