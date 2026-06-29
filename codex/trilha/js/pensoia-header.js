// codex/trilha/js/pensoia-header.js
// The public <pensoia-header> top bar (cdx- port of the legacy backstage global).
// Emits the SAME .ph-* markup the shared public-header.css styles, so the bar
// looks identical; only the code shape changed (IIFE global -> ES module that
// defines the custom element). Used by the Trail (student mode) + the validar
// page. ThemeManager (shared infra) stays a window global. QRShareModal is now a
// Codex ES module the admin live host imports; it is deliberately NOT loaded on
// the public Trail (students don't generate a join QR), so the code button here
// stays inert via the window-global guard below.
//
// The class is guarded so the module imports cleanly under node (no HTMLElement):
// only buildHeaderHtml() and clampZoom() are unit-tested; the upgraded element is
// verified on staging.
//
// The brand wordmark is the canonical PensoIA glyph-wordmark, rendered as inline
// SVG via the shared js/brand-logos.js (same source the admin topbar uses), in a
// light/dark pair so the mark follows the theme toggle. It links to pensoia.com.

// Globals (set by the Trilha HTML boot, before the module boot):
//   window.ThemeManager (theme toggle), window.QRShareModal (share modal, inert on public Trail)
import { glyphWordmark, stdColors } from '../../js/brand-logos.js';

const QR_GLYPH =
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
  '</svg>';

// Text-zoom bounds. The A−/A+ buttons were removed from the bar (they only served the
// retired GO display page); clampZoom stays as a pure exported helper (still unit-pinned).
const ZOOM_MIN = -4;
const ZOOM_MAX = 12;

// PURE. Clamp a zoom delta into range (NaN -> 0).
export function clampZoom(v) {
  if (isNaN(v)) return 0;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
}

// PURE. The bar markup.
export function buildHeaderHtml() {
  return (
    '<header class="ph-bar">' +
      '<div class="ph-left">' +
        '<a class="ph-logo" href="https://pensoia.com" aria-label="PensoIA, página inicial">' +
          '<span class="ph-logo-mark ph-logo-light" aria-hidden="true">' + glyphWordmark(stdColors('white')) + '</span>' +
          '<span class="ph-logo-mark ph-logo-dark" aria-hidden="true">' + glyphWordmark(stdColors('navy')) + '</span>' +
        '</a>' +
        '<button class="ph-exit-btn" type="button">← Sair</button>' +
      '</div>' +
      '<div class="ph-title"></div>' +
      '<div class="ph-right">' +
        // A−/A+ text zoom — shown on the projector display only (CSS scopes it to mode=display).
        '<div class="ph-zoom">' +
          '<button class="ph-zoom-btn ph-zoom-out" type="button" aria-label="Diminuir texto">A−</button>' +
          '<button class="ph-zoom-btn ph-zoom-in" type="button" aria-label="Aumentar texto">A+</button>' +
        '</div>' +
        '<button class="ph-code-btn" type="button" aria-label="Mostrar QR code">' +
          QR_GLYPH +
        '</button>' +
        '<button class="ph-theme-btn" type="button" aria-label="Alternar tema">' +
          '<span class="ph-theme-icon"></span>' +
        '</button>' +
      '</div>' +
    '</header>'
  );
}

// Base class is HTMLElement in the browser; under node (tests) it falls back to
// a stub so the module imports without a DOM. The element is never instantiated
// in node, only buildHeaderHtml/clampZoom are exercised.
const Base = (typeof HTMLElement !== 'undefined') ? HTMLElement : class {};

export class PensoiaHeader extends Base {
  static get observedAttributes() {
    return ['mode', 'code', 'session-title', 'exitable', 'join-url'];
  }

  constructor() {
    super();
    this._initialized = false;
    this._joinUrl = null;
    this._sessionTitle = null;
  }

  connectedCallback() {
    if (this._initialized) return;
    this._initialized = true;

    this.innerHTML = buildHeaderHtml();

    this._titleEl = this.querySelector('.ph-title');
    this._codeBtn = this.querySelector('.ph-code-btn');
    this._themeBtn = this.querySelector('.ph-theme-btn');
    this._themeIconEl = this.querySelector('.ph-theme-icon');
    this._exitBtn = this.querySelector('.ph-exit-btn');

    // Code button opens QRShareModal. The modal renders a notice when join-url is
    // missing, so the button is never silently dead. On the public Trail
    // QRShareModal is absent, so the button is simply inert.
    this._codeBtn.addEventListener('click', () => {
      if (!window.QRShareModal) return;
      window.QRShareModal.open({ joinUrl: this._joinUrl });
    });

    // Exit button emits a custom event so host pages decide what to do.
    this._exitBtn.addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('ph-exit', { bubbles: true }));
    });

    // A−/A+ text zoom (projector): scale the page via --ph-zoom; each step = 8%, clamped.
    const zoomOut = this.querySelector('.ph-zoom-out');
    const zoomIn = this.querySelector('.ph-zoom-in');
    if (zoomOut && zoomIn) {
      let zoom = 0;
      const apply = () => document.documentElement.style.setProperty('--ph-zoom', String(1 + clampZoom(zoom) * 0.08));
      zoomOut.addEventListener('click', () => { zoom = clampZoom(zoom - 1); apply(); });
      zoomIn.addEventListener('click', () => { zoom = clampZoom(zoom + 1); apply(); });
    }

    // Wire up ThemeManager (shared infra) if present.
    if (window.ThemeManager) {
      const key = this.getAttribute('theme-storage-key') || 'bs_theme_public';
      window.ThemeManager.init({ storageKey: key, toggleEl: this._themeBtn, iconEl: this._themeIconEl });
    }

    this._syncTitle();
  }

  disconnectedCallback() {
    // No local ESC handler; QRShareModal owns its own ESC listener.
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (!this._initialized) return;
    if (oldVal === newVal) return;
    if (name === 'session-title') { this._sessionTitle = newVal; this._syncTitle(); }
    else if (name === 'join-url') this._joinUrl = newVal || null;
  }

  _syncTitle() {
    const title = this.getAttribute('session-title') || '';
    this._sessionTitle = title;
    this._titleEl.textContent = title;
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('pensoia-header')) {
  customElements.define('pensoia-header', PensoiaHeader);
}
if (typeof window !== 'undefined') window.PensoiaHeader = PensoiaHeader;
