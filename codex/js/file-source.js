// codex/js/file-source.js
// Shared file-access backend for Codex: a MENU of sources that each hand back a native File,
// so any consumer (Slides insert, Content item editor, ...) stores it however it likes. Each
// consumer picks which sources to expose; new sources (camera, URL, ...) can be added here
// WITHOUT touching consumers, and the Picker/Drive logic lives in exactly one place. Two
// sources today:
//   - pickLocalFile({ accept })            -> the OS file picker
//   - createDriveSource(...).pick({ view }) -> Google Picker (search/thumbnails/folders for
//                                              free), downloads the chosen file's bytes
// The Drive source reuses BS_GOOGLE's OAuth token (drive.readonly, already granted) + a Picker
// API key; it stays inert (available()===false, pick()===null) until the key is configured.

// ---------- local ----------
// Opens the OS file picker and resolves the chosen File (or null if dismissed). `accept` is the
// standard <input accept> string, e.g. 'image/*' or '.pdf,.docx,application/pdf'.
export function pickLocalFile({ accept = '' } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    if (accept) inp.accept = accept;
    inp.style.position = 'fixed';
    inp.style.left = '-9999px';
    let done = false;
    const finish = (f) => { if (done) return; done = true; try { inp.remove(); } catch (_) {} resolve(f || null); };
    inp.onchange = () => finish(inp.files && inp.files[0]);
    document.body.appendChild(inp);
    inp.click();
  });
}

// ---------- Google Drive (Picker) ----------
const PICKER_JS = 'https://apis.google.com/js/api.js';
const APP_ID = '60017317060'; // Google Cloud project number (the client-id prefix in bs-google.js)

// Lazy-load gapi + the picker module exactly once.
let _loading = null;
function loadPicker() {
  if (window.google && window.google.picker) return Promise.resolve();
  if (_loading) return _loading;
  _loading = new Promise((resolve, reject) => {
    const loadModule = () => window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('picker_init_failed')) });
    if (window.gapi) return loadModule();
    const s = document.createElement('script');
    s.src = PICKER_JS; s.async = true; s.defer = true;
    s.onload = loadModule;
    s.onerror = () => reject(new Error('picker_script_failed'));
    document.head.appendChild(s);
  });
  return _loading;
}

// Resolve the Picker view for a logical name, AFTER gapi.picker has loaded (the ViewId enum
// exists only then). 'images' keeps the original image-only browse; 'any' browses every file
// (documents included) so a downloadable can be inserted.
function buildView(view) {
  const P = google.picker;
  const id = view === 'any' ? P.ViewId.DOCS : P.ViewId.DOCS_IMAGES;
  return new P.DocsView(id).setIncludeFolders(true).setSelectFolderEnabled(false);
}

function openPicker(token, apiKey, view) {
  return new Promise((resolve) => {
    const picker = new google.picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setAppId(APP_ID)
      .addView(buildView(view))
      .setCallback((data) => {
        const A = google.picker.Action;
        if (data.action === A.PICKED) resolve((data.docs && data.docs[0]) || null);
        else if (data.action === A.CANCEL) resolve(null);
      })
      .build();
    picker.setVisible(true);
  });
}

// Download the chosen file's bytes via the Drive API (Bearer token) into a File.
async function fetchDriveFile(doc, token) {
  const url = 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(doc.id) + '?alt=media&supportsAllDrives=true';
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!res.ok) throw new Error('drive_download_failed:' + res.status);
  const blob = await res.blob();
  return new File([blob], doc.name || ('drive-' + doc.id), { type: blob.type || doc.mimeType || 'application/octet-stream' });
}

// createDriveSource({ getApiKey, getToken }) -> { available(), pick({ view }) }.
// getApiKey/getToken are read LIVE each call (the key arrives from the Worker in the
// background). pick() opens the Picker, downloads the chosen file, and returns a File (or null
// on cancel / no-auth). `view` is 'images' (default) or 'any'.
export function createDriveSource({ getApiKey, getToken } = {}) {
  const key = () => (typeof getApiKey === 'function' ? getApiKey() : '') || '';
  return {
    /** Is the Drive option wired yet (the Picker key has arrived)? */
    available() { return !!key(); },
    /** Open the Picker and resolve the chosen file as a File (or null on cancel/no-auth). */
    async pick({ view = 'images' } = {}) {
      const apiKey = key();
      if (!apiKey) return null;
      const token = getToken ? await getToken() : null;
      if (!token) return null;
      await loadPicker();
      const doc = await openPicker(token, apiKey, view);
      if (!doc) return null;
      return fetchDriveFile(doc, token);
    },
  };
}
