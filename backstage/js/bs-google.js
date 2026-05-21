'use strict';

// bs-google.js — Shared Google OAuth module for all Backstage tools.
// Provides window.BS_GOOGLE: init, isAuthed, getEmail, requestToken,
// getAccessToken, signOut, and service namespaces (drive, gmail, ...).
//
// Token storage: localStorage['bs_google_token_v1'] = { token, email, expiresAt }
// Survives tab/browser close. Keyed as localStorage (NOT sessionStorage).

const BS_GOOGLE_CLIENT_ID = '60017317060-le3f1ksschm9vo2qqmt7u9ju8bemqamg.apps.googleusercontent.com';

const BS_GOOGLE_SCOPES = 'openid email https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/presentations';

const BS_GOOGLE_TOKEN_KEY = 'bs_google_token_v1';

// Internal state
let _tokenClient = null;
let _pendingCallback = null;

// ── Token storage ─────────────────────────────────────────────────────────────

function _getStoredEntry() {
  try {
    const raw = localStorage.getItem(BS_GOOGLE_TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.token || !parsed.expiresAt) return null;
    if (Date.now() >= parsed.expiresAt) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function _storeEntry(accessToken, email, expiresIn) {
  try {
    localStorage.setItem(BS_GOOGLE_TOKEN_KEY, JSON.stringify({
      token: accessToken,
      email: email || '',
      expiresAt: Date.now() + (expiresIn - 60) * 1000
    }));
  } catch (_) {}
}

function _clearEntry() {
  try { localStorage.removeItem(BS_GOOGLE_TOKEN_KEY); } catch (_) {}
}

// ── GIS availability ─────────────────────────────────────────────────────────
// GIS script loads async/defer; we poll until it's available.

function _waitForGIS(timeoutMs) {
  return new Promise(function(resolve, reject) {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve();
      return;
    }
    const deadline = Date.now() + (timeoutMs || 8000);
    const timer = setInterval(function() {
      if (window.google && window.google.accounts && window.google.accounts.oauth2) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() > deadline) {
        clearInterval(timer);
        reject(new Error('gis_timeout'));
      }
    }, 100);
  });
}

// ── Token client init ─────────────────────────────────────────────────────────

async function _ensureTokenClient() {
  if (_tokenClient) return;
  await _waitForGIS(8000);
  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: BS_GOOGLE_CLIENT_ID,
    scope: BS_GOOGLE_SCOPES,
    callback: function(resp) {
      if (resp && resp.access_token) {
        // Fetch email via tokeninfo to store alongside token.
        fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + resp.access_token)
          .then(function(r) { return r.json(); })
          .then(function(info) {
            const email = (info && info.email) ? info.email : '';
            _storeEntry(resp.access_token, email, resp.expires_in || 3600);
            if (_pendingCallback) {
              const cb = _pendingCallback;
              _pendingCallback = null;
              cb.resolve(resp.access_token);
            }
          })
          .catch(function() {
            _storeEntry(resp.access_token, '', resp.expires_in || 3600);
            if (_pendingCallback) {
              const cb = _pendingCallback;
              _pendingCallback = null;
              cb.resolve(resp.access_token);
            }
          });
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

// ── Drive namespace ───────────────────────────────────────────────────────────

async function _driveListFolder(folderId) {
  const token = BS_GOOGLE.getAccessToken();
  if (!token) throw new Error('not_authed');
  const q = encodeURIComponent("'" + folderId + "' in parents and trashed=false");
  const fields = encodeURIComponent('files(id,name,mimeType,webViewLink,parents)');
  const url = 'https://www.googleapis.com/drive/v3/files?q=' + q +
    '&fields=' + fields + '&pageSize=200';
  const resp = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }
  });
  if (!resp.ok) {
    const text = await resp.text().catch(function() { return String(resp.status); });
    throw new Error('drive_api_error:' + resp.status + ':' + text.slice(0, 120));
  }
  const json = await resp.json();
  return json.files || [];
}

// Returns plain-text contents of a Drive file. Google Docs route through the
// export endpoint; plain-text files (.txt, .md) come through alt=media.
// Caller is responsible for checking the mime type is text-extractable.
async function _driveGetText(fileId, mimeType) {
  const token = BS_GOOGLE.getAccessToken();
  if (!token) throw new Error('not_authed');
  let url;
  if (mimeType === 'application/vnd.google-apps.document') {
    url = 'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(fileId) + '/export?mimeType=text/plain';
  } else {
    url = 'https://www.googleapis.com/drive/v3/files/' +
      encodeURIComponent(fileId) + '?alt=media';
  }
  const resp = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!resp.ok) {
    const text = await resp.text().catch(function() { return String(resp.status); });
    throw new Error('drive_api_error:' + resp.status + ':' + text.slice(0, 120));
  }
  return await resp.text();
}

async function _driveListChildrenOfFolders(folderIds) {
  const results = new Map();
  await Promise.all(folderIds.map(async function(id) {
    try {
      results.set(id, await _driveListFolder(id));
    } catch (_) {
      results.set(id, []);
    }
  }));
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

window.BS_GOOGLE = {

  // Call once at Backstage boot. If we have a fresh token, returns immediately.
  // If the stored token is missing or expired, attempts a SILENT refresh in case
  // the user is still signed in to Google (token expired but session valid). On
  // silent failure (signed out, never authorized, network), resolves quietly so
  // the caller can fall through to the login screen.
  init: async function() {
    // Pre-warm GIS token client. Without it we can't even attempt silent refresh.
    try { await _ensureTokenClient(); } catch (_) { return; }

    // Fresh token already present, nothing to do.
    if (_getStoredEntry()) return;

    // Stale or absent. Attempt silent refresh.
    await new Promise(function(resolve) {
      if (_pendingCallback) {
        try { _pendingCallback.reject(new Error('superseded')); } catch (_) {}
      }
      _pendingCallback = {
        // Both branches resolve the init() promise. The caller checks isAuthed()
        // after init() to decide login vs app; a failed silent refresh just
        // means isAuthed() returns false, which is the same as never having
        // a token in the first place.
        resolve: function() { resolve(); },
        reject: function() { resolve(); }
      };
      if (!_tokenClient) { resolve(); return; }
      try {
        _tokenClient.requestAccessToken({ prompt: '' });
      } catch (_) {
        resolve();
      }
    });
  },

  isAuthed: function() {
    return !!_getStoredEntry();
  },

  getEmail: function() {
    const entry = _getStoredEntry();
    return entry ? (entry.email || '') : '';
  },

  // Returns cached access token string, or null if not authed / expired.
  getAccessToken: function() {
    const entry = _getStoredEntry();
    return entry ? entry.token : null;
  },

  // Request a token via GIS popup (or silent if the user is still signed in).
  // prompt: 'consent' forces the consent/account-picker screen.
  // prompt: '' (default) tries silent first, shows popup only if needed.
  requestToken: async function(opts) {
    const forceConsent = (opts && opts.prompt === 'consent');
    // Return cached token if still valid and not forcing consent.
    if (!forceConsent) {
      const stored = _getStoredEntry();
      if (stored) return stored.token;
    }
    await _ensureTokenClient();
    return new Promise(function(resolve, reject) {
      // If a previous requestToken is still pending (double-click, concurrent
      // CVDriveSync calls, etc.), reject it cleanly so it doesn't hang forever.
      if (_pendingCallback) {
        try { _pendingCallback.reject(new Error('superseded')); } catch (_) {}
      }
      _pendingCallback = { resolve, reject };
      _tokenClient.requestAccessToken({ prompt: forceConsent ? 'consent' : '' });
    });
  },

  signOut: function() {
    // Grab token before clearing, so we can revoke it.
    const entry = _getStoredEntry();
    _clearEntry();
    // Optionally revoke via GIS (best-effort; do not block).
    if (entry && entry.token && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try {
        google.accounts.oauth2.revoke(entry.token, function() {});
      } catch (_) {}
    }
  },

  drive: {
    listFolder: _driveListFolder,
    listChildrenOfFolders: _driveListChildrenOfFolders,
    getText: _driveGetText
  },

  // Stubs for future service namespaces. Each gets implemented when its first
  // consumer tool ships. Presence of the namespace key lets tools feature-detect
  // without crashing.
  gmail: {},
  calendar: {},
  docs: {},
  sheets: {},
  slides: {}
};
