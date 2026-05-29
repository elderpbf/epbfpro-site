// content/labs.js
// Codex Content tab, Labs sub-tab. DEFERRED-GLOBAL WRAPPER (not a full native
// port): the lab on/off grid is the legacy window.CTLabsPanel, kept as a global
// and mounted behind this thin native mount/unmount. Full nativization (cdx-
// styling, t(), no global) is tracked debt in manifest/FUTURE.md, to be done
// alongside Lessons, which also consumes the lab registry.
//
// Why caching, not re-render: CTLabsPanel.mount() targets a fixed #panel-labs
// element, paints once (an internal _mounted guard), and wires its own click /
// change listeners onto that node. It exposes no re-render hook. So we paint it
// once into a cached element and re-attach that same (already-wired) node on
// every subsequent mount, detaching (not destroying) it on unmount. Lab on/off
// state lives in localStorage, so nothing is lost across navigation.
//
// Globals (shared Backstage scripts, loaded before the module boot):
//   window.CTLabsPanel  (../backstage/classtrail/js/ct-labs-panel.js)  the grid
//   window.CVLabs       (../backstage/classvault/js/cv-labs.js)        registry
//   window.CVLabViewer  (../backstage/js/cv-lab-viewer.js)             preview
import { t } from '../js/i18n.js';

let _viewEl = null;
let _panelEl = null;   // the #panel-labs node CTLabsPanel painted; cached across mounts

export function mount(viewEl) {
  _viewEl = viewEl;
  if (!window.CTLabsPanel || typeof window.CTLabsPanel.mount !== 'function') {
    viewEl.innerHTML = '<div class="cdx-empty">' + t('labs.unavailable') + '</div>';
    return;
  }
  if (!_panelEl) {
    // CTLabsPanel.mount() looks up #panel-labs, so give it one, then let it
    // paint + wire itself. We keep the node afterwards.
    _panelEl = document.createElement('div');
    _panelEl.id = 'panel-labs';
    _panelEl.className = 'cdx-labs-host';
    viewEl.appendChild(_panelEl);
    window.CTLabsPanel.mount();
  } else {
    viewEl.appendChild(_panelEl);   // re-attach the already-painted, already-wired panel
  }
}

export function unmount() {
  // Detach (do not destroy) so the once-painted panel + its listeners survive
  // for the next mount; CTLabsPanel cannot be re-mounted.
  if (_panelEl && _panelEl.parentNode) _panelEl.parentNode.removeChild(_panelEl);
  if (_viewEl) _viewEl.innerHTML = '';
  _viewEl = null;
}
