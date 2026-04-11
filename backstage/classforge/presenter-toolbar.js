'use strict';

// ============================================================
// Presenter Toolbar
// Auto-hiding bottom bar for in-presentation tools.
// Reveals on mouse proximity (bottom 80px) or T key toggle.
// Hides automatically after 2s of inactivity.
//
// Usage: PresenterToolbar.addItem({ label, href, title })
// Exposes: window.PresenterToolbar = { addItem }
// ============================================================

(function() {
  var TRIGGER_ZONE = 80;
  var HIDE_DELAY   = 2000;
  var items        = [];
  var bar          = null;
  var hideTimer    = null;
  var visible      = false;

  function show() {
    if (!bar) return;
    clearTimeout(hideTimer);
    bar.style.transform = 'translateY(0)';
    bar.style.opacity   = '1';
    visible = true;
  }

  function hide() {
    if (!bar) return;
    bar.style.transform = 'translateY(100%)';
    bar.style.opacity   = '0';
    visible = false;
  }

  function scheduleHide() {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, HIDE_DELAY);
  }

  function onMouseMove(e) {
    if (window.innerHeight - e.clientY <= TRIGGER_ZONE) {
      show();
      scheduleHide();
    }
  }

  function onKeyDown(e) {
    if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (visible) { hide(); } else { show(); scheduleHide(); }
    }
  }

  function renderItems() {
    if (!bar) return;
    bar.innerHTML = '';
    items.forEach(function(item) {
      var a       = document.createElement('a');
      a.className = 'cf-toolbar-item';
      a.href      = item.href;
      a.textContent = item.label;
      if (item.title) a.title = item.title;
      a.target = '_blank';
      a.rel    = 'noopener';
      a.addEventListener('mouseenter', function() { clearTimeout(hideTimer); });
      a.addEventListener('mouseleave', scheduleHide);
      bar.appendChild(a);
    });
  }

  function buildBar() {
    bar    = document.createElement('div');
    bar.id = 'cf-presenter-toolbar';
    bar.setAttribute('role',       'toolbar');
    bar.setAttribute('aria-label', 'Ferramentas do apresentador');
    renderItems();
    document.body.appendChild(bar);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('keydown',   onKeyDown);
    bar.addEventListener('mouseenter', function() { clearTimeout(hideTimer); });
    bar.addEventListener('mouseleave', scheduleHide);
  }

  function addItem(item) {
    items.push(item);
    renderItems();
    // If bar not yet built (DOMContentLoaded not fired), it will render on buildBar
  }

  document.addEventListener('DOMContentLoaded', buildBar);

  window.PresenterToolbar = { addItem: addItem };
}());
