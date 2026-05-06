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
//       exitable
//       theme-storage-key="bs_theme_public">
//   </pensoia-header>
//
// Attributes are reactive: setAttribute('code', ...) updates
// the button and modal live.
//
// Emits:
//   ph-exit    when the exit button is clicked (student mode)
//
// Public API:
//   el.openModal()  / el.closeModal()
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
          '<button class="ph-code-btn" type="button" aria-label="Mostrar codigo de acesso">' +
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
      '</header>' +
      '<div class="ph-modal" hidden>' +
        '<div class="ph-modal-backdrop"></div>' +
        '<div class="ph-modal-card" role="dialog" aria-modal="true">' +
          '<button class="ph-modal-close" type="button" aria-label="Fechar">\u00d7</button>' +
          '<div class="ph-modal-label">Para entrar na sess\u00e3o</div>' +
          '<img class="ph-modal-qr" alt="QR Code">' +
          '<div class="ph-modal-info">' +
            '<div class="ph-modal-code"></div>' +
            '<div class="ph-modal-url"></div>' +
          '</div>' +
        '</div>' +
      '</div>'
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
      return ['mode', 'code', 'session-title', 'exitable'];
    }

    constructor() {
      super();
      this._initialized = false;
      this._escHandler  = null;
    }

    connectedCallback() {
      if (this._initialized) return;
      this._initialized = true;

      this.innerHTML = buildHtml();

      this._titleEl       = this.querySelector('.ph-title');
      this._codeBtn       = this.querySelector('.ph-code-btn');
      this._codeText      = this.querySelector('.ph-code-text');
      this._themeBtn      = this.querySelector('.ph-theme-btn');
      this._themeIconEl   = this.querySelector('.ph-theme-icon');
      this._exitBtn       = this.querySelector('.ph-exit-btn');
      this._modal         = this.querySelector('.ph-modal');
      this._modalCard     = this.querySelector('.ph-modal-card');
      this._modalQr       = this.querySelector('.ph-modal-qr');
      this._modalCodeEl   = this.querySelector('.ph-modal-code');
      this._modalUrl      = this.querySelector('.ph-modal-url');
      this._modalCloseBtn = this.querySelector('.ph-modal-close');
      this._modalBackdrop = this.querySelector('.ph-modal-backdrop');
      this._zoomBtns      = this.querySelectorAll('.ph-zoom-btn');

      // Code button opens the info modal
      this._codeBtn.addEventListener('click', () => this.openModal());

      // Modal dismissal (backdrop click + close button)
      this._modalCloseBtn.addEventListener('click', () => this.closeModal());
      this._modalBackdrop.addEventListener('click', () => this.closeModal());
      // Prevent clicks inside the card from bubbling to the backdrop
      this._modalCard.addEventListener('click', (e) => e.stopPropagation());

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
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (!this._initialized) return;
      if (oldVal === newVal) return;
      if (name === 'session-title') this._syncTitle();
      else if (name === 'code')      this._syncCode();
      else if (name === 'mode' && newVal === 'display') applyZoom();
    }

    // ---- internals ----

    _syncTitle() {
      this._titleEl.textContent = this.getAttribute('session-title') || '';
    }

    _syncCode() {
      var code = (this.getAttribute('code') || '').toUpperCase();
      this._codeText.textContent  = code;
      this._modalCodeEl.textContent = code;

      if (code) {
        var joinUrl = buildJoinUrl(code);
        this._modalQr.src         = buildQrSrc(joinUrl);
        this._modalUrl.textContent = 'pensoia.com/go';
      } else {
        this._modalQr.removeAttribute('src');
        this._modalUrl.textContent = '';
        // Close modal if code cleared while open
        if (!this._modal.hidden) this.closeModal();
      }
    }

    // ---- public API ----

    openModal() {
      if (!this.getAttribute('code')) return;
      this._modal.hidden = false;
      this._escHandler = (e) => { if (e.key === 'Escape') this.closeModal(); };
      document.addEventListener('keydown', this._escHandler);
    }

    closeModal() {
      this._modal.hidden = true;
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
    }
  }

  if (!customElements.get('pensoia-header')) {
    customElements.define('pensoia-header', PensoiaHeader);
  }

  // Expose for external use if ever needed
  window.PensoiaHeader = PensoiaHeader;

})();
