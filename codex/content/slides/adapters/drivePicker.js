// adapters/drivePicker.js — "import from Google Drive" for the image gallery, built on the
// Google Picker API (Google's own hosted file browser: search, thumbnails, folder nav for
// free, so we never hand-roll a Drive browser). It reuses BS_GOOGLE's OAuth token (the
// drive.readonly scope is already granted in bs-google.js) and only needs a Google API key
// with the Picker API enabled to switch on. createDrivePicker() returns { available, pick }:
// pick() opens the Picker, then DOWNLOADS the chosen file's bytes and returns a File, so the
// image flows into our own gallery storage (R2 / data URL) exactly like an upload and no
// longer depends on Drive sharing. Injected as ctx.drivePicker; the vendored core only sees
// app._drivePicker (feature-detected), never this module or the Google globals.

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

// Open the Picker (images, with folder navigation) and resolve the chosen doc, or null.
function openPicker(token, apiKey) {
  return new Promise((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS_IMAGES)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    const picker = new google.picker.PickerBuilder()
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setAppId(APP_ID)
      .addView(view)
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
  return new File([blob], doc.name || ('drive-' + doc.id), { type: blob.type || doc.mimeType || 'image/png' });
}

export function createDrivePicker({ getApiKey, getToken } = {}) {
  // The key is fetched from the Worker in the background, so read it live each time
  // (a sync getter) rather than capturing it once at construction.
  const key = () => (typeof getApiKey === 'function' ? getApiKey() : '') || '';
  return {
    /** Is the Drive option wired yet (the Picker key has arrived)? */
    available() { return !!key(); },
    /** Open the Picker and resolve the chosen image as a File (or null on cancel/no-auth). */
    async pick() {
      const apiKey = key();
      if (!apiKey) return null;
      const token = getToken ? await getToken() : null;
      if (!token) return null;
      await loadPicker();
      const doc = await openPicker(token, apiKey);
      if (!doc) return null;
      return fetchDriveFile(doc, token);
    },
  };
}
