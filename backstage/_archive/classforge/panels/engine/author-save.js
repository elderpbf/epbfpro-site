// engine/author-save.js
//
// Author Mode save client. Owns save status state and talks to the
// Backstage Worker (classforge_save_manifest / classforge_save_panel).
// Status lifecycle: 'idle' -> 'saving' -> 'saved' | 'error'

const WORKER_URL = 'https://backstage-api.pensoia.workers.dev';

let _status = 'idle';
let _sha = null;
let _errorMsg = null;
const _listeners = [];

export function getSaveStatus() {
  return { status: _status, sha: _sha, error: _errorMsg };
}

export function subscribeSaveStatus(fn) {
  _listeners.push(fn);
  fn(getSaveStatus());
  return () => {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  };
}

function _notify() { _listeners.forEach(fn => fn(getSaveStatus())); }

function _auth() {
  try { return localStorage.getItem('bs_pw_hash') || ''; } catch (_) { return ''; }
}

async function _call(params) {
  const payload = encodeURIComponent(JSON.stringify({ ...params, auth_token: _auth() }));
  const resp = await fetch(WORKER_URL + '?payload=' + payload, { redirect: 'follow' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const txt = await resp.text();
  if (txt.startsWith('<')) throw new Error('server returned HTML');
  const data = JSON.parse(txt);
  if (data.error) throw new Error(data.error);
  return data;
}

// Commit panel HTML files (must land before manifest so references resolve).
// panelFiles: [{ src, html }]  -- src is a plain filename like "panel-11.html"
async function _savePanels(slug, panelFiles) {
  for (const { src, html } of panelFiles) {
    await _call({ action: 'classforge_save_panel', slug, src, html });
  }
}

// Save manifest.json and any new panel HTML files.
// Callers should fire-and-forget (no await at call site) and read status via
// subscribeSaveStatus to update the UI.
export async function saveManifest(slug, manifestJson, panelFiles = []) {
  _status = 'saving';
  _sha = null;
  _errorMsg = null;
  _notify();
  try {
    if (panelFiles.length > 0) await _savePanels(slug, panelFiles);
    const result = await _call({ action: 'classforge_save_manifest', slug, manifestJson });
    _status = 'saved';
    _sha = result.sha || null;
    _notify();
    return result;
  } catch (err) {
    _status = 'error';
    _errorMsg = err.message;
    _notify();
    throw err;
  }
}
