// content/drive.js
// Codex Content tab, Drive sub-tab. DEFERRED-GLOBAL WRAPPER (not a full native
// port): the Google Drive folder sync + viewer is the legacy window.CVDriveSyncUI
// (and its cv-drive-* helper modules + cv-drive.css), kept as globals and mounted
// behind this thin native mount/unmount. Full nativization (cdx- styling, t(),
// no global) is tracked debt in manifest/FUTURE.md, to be done alongside Lessons,
// which also embeds the Drive viewer.
//
// Unlike Labs, CVDriveSyncUI.mount(container, opts) takes the container and
// returns an instance with destroy(), so each mount paints a fresh instance and
// unmount tears it down cleanly. No caching needed.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.CVDriveSyncUI  (../backstage/js/cv-drive-sync-ui.js + cv-drive-* deps)
import { t } from '../js/i18n.js';

let _viewEl = null;
let _inst = null;

export function mount(viewEl) {
  _viewEl = viewEl;
  if (!window.CVDriveSyncUI || typeof window.CVDriveSyncUI.mount !== 'function') {
    viewEl.innerHTML = '<div class="cdx-empty">' + t('drive.unavailable') + '</div>';
    return;
  }
  const host = document.createElement('div');
  host.className = 'cdx-drive-host';
  viewEl.appendChild(host);
  _inst = window.CVDriveSyncUI.mount(host, {});
}

export function unmount() {
  if (_inst && typeof _inst.destroy === 'function') {
    try { _inst.destroy(); } catch (_) { /* ignore */ }
  }
  _inst = null;
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
