'use strict';

// ClassPulse Live host — mount module.
// Bundle L Item 2: lets the Perguntas tab embed the host live UI inline in its
// panel-live container instead of forcing a full-page navigation to host.html.
// For now this is a thin iframe wrapper around the standalone host.html. A
// future bundle (Bundle M+) can replace the iframe with a real inline mount
// once the host engine is fully extracted into this module — the public API
// (mount/unmount) stays stable.
//
// Public API:
//   CPHost.mount(containerEl, { sessionCode })  – embed the live UI in container
//   CPHost.unmount()                            – tear down the embedded UI
//
// Also injects the result-bar (.rb-track / .rb-fill) styles so they are
// available wherever the host is mounted, with the Bundle L Item 5 neutral
// track colors that give the teal fill clear hue contrast in both themes.

window.CPHost = (function() {

  var _iframe = null;
  var _stylesInjected = false;
  var STYLE_ID = 'cp-host-styles';

  function _injectStyles() {
    if (_stylesInjected) return;
    if (document.getElementById(STYLE_ID)) { _stylesInjected = true; return; }
    var style = document.createElement('style');
    style.id = STYLE_ID;
    // Result bars: neutral grey track in both themes so the teal fill pops via
    // hue contrast (Bundle L Item 5). Geometry stays in sync with host.html.
    style.textContent = ''
      + '.rb-track { height: 7px; background: rgba(0, 0, 0, 0.08); border-radius: 4px; overflow: hidden; }'
      + '[data-theme="dark"] .rb-track { background: rgba(255, 255, 255, 0.08); }'
      + '.rb-fill { height: 100%; background: var(--primary); border-radius: 4px; transition: width .5s ease; }';
    document.head.appendChild(style);
    _stylesInjected = true;
  }

  function mount(containerEl, opts) {
    _injectStyles();
    if (!containerEl) return;
    opts = opts || {};
    var code = (opts.sessionCode || '').toString();
    if (_iframe && _iframe.parentNode) {
      _iframe.parentNode.removeChild(_iframe);
    }
    _iframe = document.createElement('iframe');
    _iframe.className = 'cp-host-frame';
    _iframe.src = '/backstage/classpulse/host.html' + (code ? '?code=' + encodeURIComponent(code) : '');
    _iframe.style.cssText = 'width:100%; height:100%; min-height:100%; border:0; display:block; background:var(--background, transparent);';
    _iframe.setAttribute('title', 'ClassPulse Live');
    containerEl.appendChild(_iframe);
  }

  function unmount() {
    if (_iframe && _iframe.parentNode) {
      _iframe.parentNode.removeChild(_iframe);
    }
    _iframe = null;
  }

  return {
    mount: mount,
    unmount: unmount
  };

})();
