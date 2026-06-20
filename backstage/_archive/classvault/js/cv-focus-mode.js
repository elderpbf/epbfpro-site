'use strict';

// ClassVault focus mode. Hides topbar + sidebar + bottom action bar; each
// reveals when the mouse approaches its edge (top / left / bottom), then tucks
// itself away again ~1.5s after the cursor leaves. Toggle button is registered
// in the Backstage topbar. State persists across reloads via localStorage. Esc
// exits.
//
// Public API: window.CVFocusMode = { init, enable, disable, toggle }.

window.CVFocusMode = (function () {

  var STORAGE_KEY = 'cv_focus_mode';
  // Reveal zones are intentionally thin so the topbar/sidebar don't slide
  // over breadcrumb/main content as the cursor moves through the upper or
  // left strip of the viewport. User must aim at the very edge to peek.
  var TOP_ZONE = 6;
  var LEFT_ZONE = 6;
  var BOTTOM_ZONE = 6;
  var HIDE_DELAY = 1500;

  var EXPAND_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>';
  var COMPRESS_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/></svg>';

  var _on = false;
  var _btn = null;
  var _topTimer = null;
  var _sideTimer = null;
  var _bottomTimer = null;
  var _overTop = false;
  var _overSide = false;
  var _overBottom = false;

  function init() {
    if (!window.Topbar) return;

    _btn = Topbar.addItem({
      icon: EXPAND_SVG,
      title: 'Modo foco (Esc para sair)',
      onClick: toggle,
    });
    if (_btn) _btn.id = 'cv-focus-btn';

    _createHotZones();
    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('keydown', _onKeyDown);
    _wireBarHover();
    // Focus mode defaults to ON. localStorage opt-out: user explicitly toggles
    // off (stores '0'). Any other state (missing key, '1', stale value) → on.
    var stored = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (stored !== '0') enable();
  }

  // A cross-origin iframe (Google Drive / Slides preview) swallows all pointer
  // events, so document mousemove never sees the cursor reach an edge while a
  // full-bleed embed is showing. These thin fixed strips sit ABOVE the iframe
  // (z below the bars) and capture mouseenter so the reveal still fires. They
  // only capture in focus mode (pointer-events gated by body.cv-focus in CSS).
  function _createHotZones() {
    _makeHotZone('cv-focus-hot cv-focus-hot--top', _showTop);
    _makeHotZone('cv-focus-hot cv-focus-hot--left', _showSide);
    _makeHotZone('cv-focus-hot cv-focus-hot--bottom', _showBottom);
  }
  function _makeHotZone(cls, onEnter) {
    var el = document.createElement('div');
    el.className = cls;
    el.setAttribute('aria-hidden', 'true');
    el.addEventListener('mouseenter', function () { if (_on) onEnter(); });
    document.body.appendChild(el);
  }

  function toggle() { if (_on) disable(); else enable(); }

  function enable() {
    if (_on) return;
    _on = true;
    document.body.classList.add('cv-focus');
    if (_btn) {
      _btn.innerHTML = COMPRESS_SVG;
      _btn.title = 'Sair do modo foco (Esc)';
    }
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch (e) {}
  }

  function disable() {
    if (!_on) return;
    _on = false;
    document.body.classList.remove('cv-focus', 'cv-focus--top', 'cv-focus--side', 'cv-focus--bottom');
    clearTimeout(_topTimer);
    clearTimeout(_sideTimer);
    clearTimeout(_bottomTimer);
    if (_btn) {
      _btn.innerHTML = EXPAND_SVG;
      _btn.title = 'Modo foco (Esc para sair)';
    }
    try { localStorage.setItem(STORAGE_KEY, '0'); } catch (e) {}
  }

  function _onMouseMove(e) {
    if (!_on) return;
    if (e.clientY <= TOP_ZONE) _showTop();
    if (e.clientX <= LEFT_ZONE) _showSide();
    if (e.clientY >= (window.innerHeight - BOTTOM_ZONE)) _showBottom();
  }

  function _showTop() {
    document.body.classList.add('cv-focus--top');
    clearTimeout(_topTimer);
    _topTimer = setTimeout(_maybeHideTop, HIDE_DELAY);
  }
  function _maybeHideTop() {
    if (_overTop) return;
    document.body.classList.remove('cv-focus--top');
  }

  function _showSide() {
    document.body.classList.add('cv-focus--side');
    clearTimeout(_sideTimer);
    _sideTimer = setTimeout(_maybeHideSide, HIDE_DELAY);
  }
  function _maybeHideSide() {
    if (_overSide) return;
    document.body.classList.remove('cv-focus--side');
  }

  function _showBottom() {
    document.body.classList.add('cv-focus--bottom');
    clearTimeout(_bottomTimer);
    _bottomTimer = setTimeout(_maybeHideBottom, HIDE_DELAY);
  }
  function _maybeHideBottom() {
    if (_overBottom) return;
    document.body.classList.remove('cv-focus--bottom');
  }

  function _wireBarHover() {
    var topbar = document.querySelector('.bs-topbar');
    if (topbar) {
      topbar.addEventListener('mouseenter', function () {
        _overTop = true;
        clearTimeout(_topTimer);
      });
      topbar.addEventListener('mouseleave', function () {
        _overTop = false;
        if (_on) {
          clearTimeout(_topTimer);
          _topTimer = setTimeout(_maybeHideTop, HIDE_DELAY);
        }
      });
    }
    var side = document.querySelector('.cv-sm');
    if (side) {
      side.addEventListener('mouseenter', function () {
        _overSide = true;
        clearTimeout(_sideTimer);
      });
      side.addEventListener('mouseleave', function () {
        _overSide = false;
        if (_on) {
          clearTimeout(_sideTimer);
          _sideTimer = setTimeout(_maybeHideSide, HIDE_DELAY);
        }
      });
    }
    var crumb = document.querySelector('.cv-main-crumb');
    if (crumb) {
      crumb.addEventListener('mouseenter', function () {
        _overBottom = true;
        clearTimeout(_bottomTimer);
      });
      crumb.addEventListener('mouseleave', function () {
        _overBottom = false;
        if (_on) {
          clearTimeout(_bottomTimer);
          _bottomTimer = setTimeout(_maybeHideBottom, HIDE_DELAY);
        }
      });
    }
  }

  function _onKeyDown(e) {
    // Ignore when the user is typing into an input.
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable) return;
    if (e.key === 'Escape' && _on) {
      disable();
      return;
    }
    // F toggles focus mode in/out. Plain F only — modifier combos belong to
    // the browser / OS (Ctrl+F find, etc.).
    if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      toggle();
    }
  }

  return { init: init, enable: enable, disable: disable, toggle: toggle };

})();
