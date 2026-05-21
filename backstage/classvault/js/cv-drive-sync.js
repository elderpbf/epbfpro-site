'use strict';

// cv-drive-sync.js — Phase 5: browser-side Drive mirror via GIS token client.
// Public API: window.CVDriveSync = { init, syncNow, getItems, isAuthed }

const CV_DRIVE_CLIENT_ID     = '60017317060-le3f1ksschm9vo2qqmt7u9ju8bemqamg.apps.googleusercontent.com';
const CV_DRIVE_ROOT_FOLDER_ID = '1zR2ugAYShUmN_E5scM7om6Qy1y0iE2Mi';

const CV_DRIVE_SCOPE         = 'https://www.googleapis.com/auth/drive.readonly';
const CV_TOKEN_KEY           = 'cv_drive_token_v1';
const CV_ITEMS_KEY           = 'cv_drive_items_v1';
const CV_ITEMS_TTL_MS        = 5 * 60 * 1000; // 5 minutes

// Internal state
let _tokenClient = null;        // GIS TokenClient instance
let _pendingCallback = null;    // resolve/reject waiting on token popup
let _syncing = false;           // guard against concurrent syncs

// ── Token helpers ────────────────────────────────────────────────

function _getStoredToken() {
  try {
    const raw = sessionStorage.getItem(CV_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.token || !parsed.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt) return null;
    return parsed.token;
  } catch (_) {
    return null;
  }
}

function _storeToken(accessToken, expiresIn) {
  try {
    sessionStorage.setItem(CV_TOKEN_KEY, JSON.stringify({
      token: accessToken,
      expiresAt: Date.now() + (expiresIn - 60) * 1000
    }));
  } catch (_) {}
}

function _clearToken() {
  try { sessionStorage.removeItem(CV_TOKEN_KEY); } catch (_) {}
}

// ── Cache helpers ────────────────────────────────────────────────

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

// ── MIME mapping ─────────────────────────────────────────────────

function _mimeToMeta(mimeType, fileName) {
  if (mimeType === 'application/vnd.google-apps.presentation') {
    return { type: 'popup_url', label: 'Slides', icon: '🎞️' };
  }
  if (mimeType === 'application/vnd.google-apps.document') {
    return { type: 'drive_file', label: 'Doc', icon: '📑' };
  }
  if (mimeType === 'application/vnd.google-apps.spreadsheet') {
    return { type: 'drive_file', label: 'Planilha', icon: '📊' };
  }
  if (mimeType === 'application/pdf') {
    return { type: 'drive_file', label: 'PDF', icon: '📕' };
  }
  if (mimeType === 'application/vnd.google-apps.folder') {
    return null; // skip; folders become section headers
  }
  if (mimeType === 'text/markdown' || (fileName && fileName.endsWith('.md'))) {
    return { type: 'drive_file', label: 'Markdown', icon: '📝' };
  }
  if (mimeType && mimeType.startsWith('image/')) {
    return { type: 'drive_file', label: 'Imagem', icon: '🖼️' };
  }
  if (mimeType && mimeType.startsWith('video/')) {
    return { type: 'drive_file', label: 'Vídeo', icon: '🎬' };
  }
  return { type: 'drive_file', label: 'Arquivo', icon: '📎' };
}

// ── GIS init ─────────────────────────────────────────────────────

function _initTokenClient() {
  if (_tokenClient) return;
  if (CV_DRIVE_CLIENT_ID.startsWith('__')) return; // placeholder, skip GIS init
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) return;
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CV_DRIVE_CLIENT_ID,
    scope: CV_DRIVE_SCOPE,
    callback: function(resp) {
      if (resp && resp.access_token) {
        _storeToken(resp.access_token, resp.expires_in || 3600);
        if (_pendingCallback) {
          const cb = _pendingCallback;
          _pendingCallback = null;
          cb.resolve(resp.access_token);
        }
      } else {
        const err = (resp && resp.error) ? resp.error : 'auth_failed';
        if (_pendingCallback) {
          const cb = _pendingCallback;
          _pendingCallback = null;
          cb.reject(new Error(err));
        }
      }
    }
  });
}

// Request a token (reuses existing stored one if valid).
// Returns a Promise<string> with the access token.
function _requestToken(forceNew) {
  if (!forceNew) {
    const stored = _getStoredToken();
    if (stored) return Promise.resolve(stored);
  }
  if (CV_DRIVE_CLIENT_ID.startsWith('__')) {
    return Promise.reject(new Error('oauth_pending'));
  }
  _initTokenClient();
  if (!_tokenClient) {
    return Promise.reject(new Error('gis_not_ready'));
  }
  return new Promise(function(resolve, reject) {
    _pendingCallback = { resolve, reject };
    _tokenClient.requestAccessToken({ prompt: forceNew ? 'consent' : '' });
  });
}

// ── Drive API fetch ──────────────────────────────────────────────

async function _listFolder(folderId, token) {
  const q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
  const fields = encodeURIComponent('files(id,name,mimeType,webViewLink,parents)');
  const url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
              '&fields=' + fields + '&pageSize=200';
  const resp = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => String(resp.status));
    throw new Error('drive_api_error:' + resp.status + ':' + text.slice(0, 120));
  }
  const json = await resp.json();
  return json.files || [];
}

// Synthesize a synthetic ClassVault item from a Drive file object.
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

// Fetch root folder + one level of subfolders. Returns synthesized item list
// grouped by subfolder, with root-level files under a synthetic "raiz" group.
async function _fetchDriveItems(token) {
  const rootFiles = await _listFolder(CV_DRIVE_ROOT_FOLDER_ID, token);

  const subfolders = rootFiles.filter(f => f.mimeType === 'application/vnd.google-apps.folder');
  const rootOnlyFiles = rootFiles.filter(f => f.mimeType !== 'application/vnd.google-apps.folder');

  // Fetch all subfolder contents in parallel.
  const subContents = await Promise.all(
    subfolders.map(function(sf) {
      return _listFolder(sf.id, token).then(function(files) {
        return { folder: sf, files };
      }).catch(function() {
        return { folder: sf, files: [] };
      });
    })
  );

  const items = [];

  // Root-level files first, under a synthetic group.
  for (const file of rootOnlyFiles) {
    const item = _synthesizeItem(file, '');
    if (item) { item._group = '__raiz__'; items.push(item); }
  }

  // Then one group per subfolder, in folder-appearance order.
  for (const { folder, files } of subContents) {
    for (const file of files) {
      const item = _synthesizeItem(file, folder.name);
      if (item) { item._group = folder.name; items.push(item); }
    }
  }

  return items;
}

// ── Public API ───────────────────────────────────────────────────

window.CVDriveSync = {

  // Call once after page load. If a cached token + item list exist,
  // populates ClassVault.driveItems and triggers a sidebar re-render.
  init: function() {
    if (!CV_DRIVE_CLIENT_ID.startsWith('__')) {
      _initTokenClient();
    }
    const token = _getStoredToken();
    if (!token) return; // not authed, nothing to pre-populate

    const cached = _getCachedItems();
    if (cached) {
      window.ClassVault.driveItems = cached;
      if (typeof _renderDriveSectionOnly === 'function') _renderDriveSectionOnly();
      return;
    }

    // Token exists but no cache: fetch silently in background.
    _fetchDriveItems(token).then(function(items) {
      _storeCachedItems(items);
      window.ClassVault.driveItems = items;
      if (typeof _renderDriveSectionOnly === 'function') _renderDriveSectionOnly();
    }).catch(function() {
      // Silent: user will see "Conectar Drive" and can manually sync.
      _clearToken();
    });
  },

  // Force a re-fetch, bypassing cache. Called by the Sync button.
  syncNow: async function() {
    if (_syncing) return;
    _syncing = true;
    try {
      const token = await _requestToken(false);
      _clearCache();
      const items = await _fetchDriveItems(token);
      _storeCachedItems(items);
      window.ClassVault.driveItems = items;
      if (typeof _renderDriveSectionOnly === 'function') _renderDriveSectionOnly();
    } catch (err) {
      const msg = err && err.message;
      if (msg === 'oauth_pending') {
        if (window.BSToast) BSToast.show('Configuração OAuth pendente. Aguardando Client ID do Google Cloud Console.');
      } else {
        if (window.BSToast) BSToast.show('Erro ao sincronizar Drive: ' + (msg || 'erro desconhecido'));
      }
    } finally {
      _syncing = false;
    }
  },

  // Request token via popup (called by "Conectar Drive" button).
  connect: async function() {
    if (CV_DRIVE_CLIENT_ID.startsWith('__')) {
      if (window.BSToast) BSToast.show('Configuração OAuth pendente. Aguardando Client ID do Google Cloud Console.');
      return;
    }
    _syncing = true;
    try {
      const token = await _requestToken(true);
      _clearCache();
      const items = await _fetchDriveItems(token);
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
    return !!_getStoredToken();
  },

  isPending: function() {
    return CV_DRIVE_CLIENT_ID.startsWith('__');
  }
};
