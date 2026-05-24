'use strict';

// ============================================================
// <pensoia-header>  web component
//
// Shared responsive topbar used by the public pages
// (go/index.html + go/display.html). Light-DOM custom element:
// no Shadow DOM, so theme CSS variables from theme.css apply
// naturally and the existing ThemeManager can hook into it.
//
// Usage:
//   <pensoia-header
//       mode="student"|"display"
//       code="5K78"
//       session-title="Aula 3"
//       join-url="https://pensoia.com/trilha/..."
//       exitable
//       theme-storage-key="bs_theme_public">
//   </pensoia-header>
//
// Attributes are reactive: setAttribute('code', ...) updates
// the button live. setAttribute('join-url', ...) updates the
// QR target URL used by QRShareModal.
//
// Emits:
//   ph-exit    when the exit button is clicked (student mode)
// ============================================================

(function() {

  // QR glyph (lucide 'qr-code' style, currentColor)
  var QR_GLYPH = (
    '<svg class="ph-qr-glyph" xmlns="http://www.w3.org/2000/svg" ' +
      'viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3" y="3" width="7" height="7" rx="1"/>' +
      '<rect x="14" y="3" width="7" height="7" rx="1"/>' +
      '<rect x="3" y="14" width="7" height="7" rx="1"/>' +
      '<path d="M14 14h3v3h-3z"/>' +
      '<path d="M20 14h1v1"/>' +
      '<path d="M14 20h1v1"/>' +
      '<path d="M20 20h1v1"/>' +
      '<path d="M17 17h1"/>' +
      '<path d="M20 17h1"/>' +
      '<path d="M17 20h1"/>' +
    '</svg>'
  );

  // Zoom state (display mode only). Persisted across reloads.
  var ZOOM_KEY   = 'ph_zoom_delta';
  var ZOOM_BASE  = 16; // px
  var ZOOM_STEP  = 2;  // px per click
  var ZOOM_MIN   = -4;
  var ZOOM_MAX   = 12;

  function clampZoom(v) {
    if (isNaN(v)) return 0;
    return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
  }

  function readZoom() {
    return clampZoom(parseInt(localStorage.getItem(ZOOM_KEY) || '0', 10));
  }

  function writeZoom(delta) {
    delta = clampZoom(delta);
    localStorage.setItem(ZOOM_KEY, String(delta));
    applyZoom();
    return delta;
  }

  function applyZoom() {
    var delta = readZoom();
    document.documentElement.style.fontSize = (ZOOM_BASE + delta * ZOOM_STEP) + 'px';
  }

  function buildHtml() {
    return (
      '<header class="ph-bar">' +
        '<div class="ph-left">' +
          '<div class="ph-logo">PensoIA</div>' +
          '<button class="ph-exit-btn" type="button">\u2190 Sair</button>' +
        '</div>' +
        '<div class="ph-title"></div>' +
        '<div class="ph-right">' +
          '<button class="ph-code-btn" type="button" aria-label="Mostrar QR code">' +
            QR_GLYPH +
            '<span class="ph-code-text"></span>' +
          '</button>' +
          '<div class="ph-zoom" role="group" aria-label="Ajuste de texto">' +
            '<button class="ph-zoom-btn" data-delta="-1" type="button" aria-label="Diminuir texto">A\u2212</button>' +
            '<button class="ph-zoom-btn" data-delta="1" type="button" aria-label="Aumentar texto">A+</button>' +
          '</div>' +
          '<button class="ph-theme-btn" type="button" aria-label="Alternar tema">' +
            '<span class="ph-theme-icon"></span>' +
          '</button>' +
        '</div>' +
      '</header>'
    );
  }

  function buildJoinUrl(code) {
    // Always prefer the production host for projector QR codes so a
    // phone scanning it lands somewhere public, even during local dev.
    return 'https://pensoia.com/go/?code=' + encodeURIComponent(code);
  }

  function buildQrSrc(joinUrl) {
    return (
      'https://api.qrserver.com/v1/create-qr-code/' +
      '?size=420x420&margin=4&data=' +
      encodeURIComponent(joinUrl)
    );
  }

  class PensoiaHeader extends HTMLElement {

    static get observedAttributes() {
      return ['mode', 'code', 'session-title', 'exitable', 'join-url'];
    }

    constructor() {
      super();
      this._initialized  = false;
      this._joinUrl      = null;
      this._sessionTitle = null;
    }

    connectedCallback() {
      if (this._initialized) return;
      this._initialized = true;

      this.innerHTML = buildHtml();

      this._titleEl     = this.querySelector('.ph-title');
      this._codeBtn     = this.querySelector('.ph-code-btn');
      this._codeText    = this.querySelector('.ph-code-text');
      this._themeBtn    = this.querySelector('.ph-theme-btn');
      this._themeIconEl = this.querySelector('.ph-theme-icon');
      this._exitBtn     = this.querySelector('.ph-exit-btn');
      this._zoomBtns    = this.querySelectorAll('.ph-zoom-btn');

      // Code button opens QRShareModal if available, else falls back to legacy join URL.
      this._codeBtn.addEventListener('click', () => {
        var url = this._joinUrl || (this.getAttribute('code') ? buildJoinUrl(this.getAttribute('code')) : null);
        if (!url) return;
        if (window.QRShareModal) {
          QRShareModal.open({ joinUrl: url, title: this._sessionTitle || 'Entre na trilha' });
        }
      });

      // Exit button emits a custom event so host pages decide what to do
      this._exitBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('ph-exit', { bubbles: true }));
      });

      // Zoom controls (display mode only, hidden via CSS otherwise)
      this._zoomBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          var step = parseInt(btn.dataset.delta, 10) || 0;
          writeZoom(readZoom() + step);
        });
      });

      // Wire up ThemeManager if present
      if (window.ThemeManager) {
        var key = this.getAttribute('theme-storage-key') || 'bs_theme_public';
        window.ThemeManager.init({
          storageKey: key,
          toggleEl:   this._themeBtn,
          iconEl:     this._themeIconEl
        });
      }

      // Apply saved zoom (only on display mode; student mode keeps root
      // font-size at browser default so mobile users aren't affected)
      if (this.getAttribute('mode') === 'display') {
        applyZoom();
      }

      // Hydrate from attributes
      this._syncTitle();
      this._syncCode();
    }

    disconnectedCallback() {
      // No local ESC handler; QRShareModal owns its own ESC listener.
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (!this._initialized) return;
      if (oldVal === newVal) return;
      if (name === 'session-title') { this._sessionTitle = newVal; this._syncTitle(); }
      else if (name === 'code')      this._syncCode();
      else if (name === 'join-url')  this._joinUrl = newVal || null;
      else if (name === 'mode' && newVal === 'display') applyZoom();
    }

    // ---- internals ----

    _syncTitle() {
      var title = this.getAttribute('session-title') || '';
      this._sessionTitle = title;
      this._titleEl.textContent = title;
    }

    _syncCode() {
      var code = (this.getAttribute('code') || '').toUpperCase();
      this._codeText.textContent = code;
    }
  }

  if (!customElements.get('pensoia-header')) {
    customElements.define('pensoia-header', PensoiaHeader);
  }

  // Expose for external use if ever needed
  window.PensoiaHeader = PensoiaHeader;

})();
