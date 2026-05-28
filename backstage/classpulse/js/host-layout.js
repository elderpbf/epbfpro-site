'use strict';

// CPHost.Layout -- three-column dashboard layout (left composer / center
// active question / right Q&A). Loads + persists column widths and visibility,
// wires column-resize handles and the hamburger menu for narrow viewports.

(function () {
  var CPHost = window.CPHost = window.CPHost || {};

  function loadLayout() {
    var S = CPHost.State;
    try {
      var saved = JSON.parse(localStorage.getItem(S.LAYOUT_KEY));
      if (!saved) return JSON.parse(JSON.stringify(S.DEFAULT_LAYOUT));
      ['left', 'center', 'right'].forEach(function (k) {
        if (!saved[k]) saved[k] = JSON.parse(JSON.stringify(S.DEFAULT_LAYOUT[k]));
        if (typeof saved[k].visible !== 'boolean') saved[k].visible = true;
      });
      return saved;
    } catch (e) {
      return JSON.parse(JSON.stringify(S.DEFAULT_LAYOUT));
    }
  }

  function saveLayout() {
    var S = CPHost.State;
    try { localStorage.setItem(S.LAYOUT_KEY, JSON.stringify(S.layoutState)); } catch (e) {}
  }

  function applyLayout() {
    var S = CPHost.State;
    var leftEl   = document.getElementById('hdColLeft');
    var centerEl = document.getElementById('hdColCenter');
    var rightEl  = document.getElementById('hdColRight');
    var rLC      = document.getElementById('hdResizerLC');
    var rCR      = document.getElementById('hdResizerCR');
    if (!leftEl || !centerEl || !rightEl) return;

    leftEl.classList.toggle('is-hidden',   !S.layoutState.left.visible);
    centerEl.classList.toggle('is-hidden', !S.layoutState.center.visible);
    rightEl.classList.toggle('is-hidden',  !S.layoutState.right.visible);

    if (rLC) rLC.classList.toggle('is-hidden', !(S.layoutState.left.visible  && (S.layoutState.center.visible || S.layoutState.right.visible)));
    if (rCR) rCR.classList.toggle('is-hidden', !(S.layoutState.right.visible && (S.layoutState.center.visible || S.layoutState.left.visible)));

    // Clamp persisted widths to the current viewport so a saved layout from a
    // wider monitor doesn't leave the side columns stuck off-screen.
    var maxW = Math.min(600, Math.max(280, window.innerWidth - 320));
    S.layoutState.left.width  = Math.max(260, Math.min(maxW, S.layoutState.left.width  || 360));
    S.layoutState.right.width = Math.max(280, Math.min(maxW, S.layoutState.right.width || 380));
    leftEl.style.width  = S.layoutState.left.width  + 'px';
    rightEl.style.width = S.layoutState.right.width + 'px';

    document.querySelectorAll('[data-toggle-col]').forEach(function (btn) {
      btn.classList.toggle('is-on', !!S.layoutState[btn.dataset.toggleCol].visible);
    });
  }

  function startResize(e, handle) {
    var S = CPHost.State;
    e.preventDefault();
    try { handle.setPointerCapture && handle.setPointerCapture(e.pointerId); } catch (_) {}
    handle.classList.add('dragging');
    var direction = handle.dataset.resize;
    var startX = e.clientX;
    var leftCol = document.getElementById('hdColLeft');
    var rightCol = document.getElementById('hdColRight');
    var startLeftW  = leftCol.offsetWidth;
    var startRightW = rightCol.offsetWidth;

    function onMove(ev) {
      var delta = ev.clientX - startX;
      var maxW = Math.min(600, window.innerWidth - 320);
      if (direction === 'left-center') {
        var w = Math.max(260, Math.min(maxW, startLeftW + delta));
        leftCol.style.width = w + 'px';
        S.layoutState.left.width = w;
      } else {
        var w2 = Math.max(280, Math.min(maxW, startRightW - delta));
        rightCol.style.width = w2 + 'px';
        S.layoutState.right.width = w2;
      }
    }
    function onUp() {
      handle.classList.remove('dragging');
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      saveLayout();
    }
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
  }

  function _initHamburger() {
    var btn = document.getElementById('hostBarMenuBtn');
    var panel = document.getElementById('hostBarMenuPanel');
    if (!btn || !panel) return;

    function _addProxy(sourceEl, label) {
      if (!sourceEl || sourceEl.hidden) return;
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'host-bar-menu-row';
      row.textContent = label || (sourceEl.textContent || sourceEl.getAttribute('aria-label') || '').trim();
      row.addEventListener('click', function () {
        panel.hidden = true;
        if (sourceEl.tagName === 'A' && sourceEl.href) window.location.href = sourceEl.href;
        else sourceEl.click();
      });
      panel.appendChild(row);
    }

    function _rebuildPanel() {
      panel.innerHTML = '';
      var subtabs = document.getElementById('live-bar-subtabs');
      if (subtabs) {
        var sc = subtabs.cloneNode(true);
        sc.removeAttribute('id');
        panel.appendChild(sc);
      }
      _addProxy(document.querySelector('.host-session-bar .view-toggle[data-toggle-col="left"]'),   'Coluna Composer');
      _addProxy(document.querySelector('.host-session-bar .view-toggle[data-toggle-col="center"]'), 'Coluna Pergunta ativa');
      _addProxy(document.querySelector('.host-session-bar .view-toggle[data-toggle-col="right"]'),  'Coluna Q&A');
      _addProxy(document.getElementById('resetLayoutBtn'), 'Restaurar layout');
      _addProxy(document.getElementById('trail-btn'));
      _addProxy(document.getElementById('qr-btn'));
      _addProxy(document.getElementById('display-link'));
    }

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!panel.hidden) { panel.hidden = true; return; }
      _rebuildPanel();
      panel.hidden = false;
    });
    document.addEventListener('click', function (e) {
      if (panel.hidden) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      panel.hidden = true;
    });
  }

  function init() {
    var S = CPHost.State;
    S.layoutState = loadLayout();

    document.querySelectorAll('[data-toggle-col]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var col = btn.dataset.toggleCol;
        S.layoutState[col].visible = !S.layoutState[col].visible;
        var visibleCount = ['left', 'center', 'right'].filter(function (k) { return S.layoutState[k].visible; }).length;
        if (visibleCount === 0) {
          S.layoutState[col].visible = true;
          CPHost.Utils.showAlert('error', 'Pelo menos uma coluna precisa ficar visível.');
          return;
        }
        applyLayout();
        saveLayout();
      });
    });

    var resetBtn = document.getElementById('resetLayoutBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        S.layoutState = JSON.parse(JSON.stringify(S.DEFAULT_LAYOUT));
        applyLayout();
        saveLayout();
      });
    }

    document.querySelectorAll('.hd-resizer').forEach(function (h) {
      h.addEventListener('pointerdown', function (e) { startResize(e, h); });
    });

    applyLayout();
    _initHamburger();
  }

  CPHost.Layout = {
    loadLayout: loadLayout,
    saveLayout: saveLayout,
    applyLayout: applyLayout,
    startResize: startResize,
    init: init,
  };
})();
