'use strict';

// Trilha-side live-session integration. Polls cp_get_active_for_turma every
// 15s (paused via Page Visibility API when the tab is hidden). When the
// turma's bound ClassPulse session has an active question, the trilha content
// area is replaced by the inline NexoAnswer panel. When the session closes
// (no question, or session closed), the trilha content reappears.
//
// The pensoia-header stays visible at all times. The session code is NEVER
// surfaced on the public page.

(function () {
  var POLL_MS         = 15000;
  var POLL_MS_BACKOFF = 60000; // when there's no open session, slow down
  var ROOT_ID         = 'nx-answer-root';

  var _params     = new URLSearchParams(location.search);
  var _clientSlug = _params.get('c');
  var _turmaSlug  = _params.get('t');

  // Backward-compat fallback: legacy URLs of the form /trilha/<client>/<turma>?k=
  if (!_clientSlug || !_turmaSlug) {
    var parts = location.pathname.replace(/^\/trilha\/?/, '').replace(/\/+$/, '').split('/');
    if (parts.length >= 2) {
      _clientSlug = parts[0];
      _turmaSlug  = parts[1] || null;
    }
  }

  var _timer = null;
  var _stopped = false;
  var _mounted = false; // tracks whether NexoAnswer is currently mounted
  var _lastSessionCode = null;

  function init() {
    if (!_clientSlug || !_turmaSlug) return; // trilha will surface its own error
    _tick();
    document.addEventListener('visibilitychange', _onVisibilityChange);
  }

  function _schedule(ms) {
    if (_stopped) return;
    clearTimeout(_timer);
    _timer = setTimeout(_tick, ms);
  }

  async function _tick() {
    if (document.hidden) return; // pause silently; visibility handler resumes
    var data;
    try {
      data = await callWorker({
        action: 'cp_get_active_for_turma',
        client_slug: _clientSlug,
        turma_slug:  _turmaSlug,
        _silent: true
      });
    } catch (_) {
      // network blip — try again on next tick at normal cadence
      _schedule(POLL_MS);
      return;
    }
    _render(data || {});
    var hasOpen = !!(data && data.session);
    _schedule(hasOpen ? POLL_MS : POLL_MS_BACKOFF);
  }

  function _onVisibilityChange() {
    if (document.hidden) {
      clearTimeout(_timer);
    } else {
      _tick();
    }
  }

  function _getContentArea() {
    // The trilha layout: <main id="tr-main"> contains .tr-hero, .tr-tabs,
    // and .tr-tab-content. We hide tabs+tab-content and inject the answer
    // panel as a sibling. Hero + header stay visible.
    return document.querySelector('#tr-main');
  }

  function _ensureRoot() {
    var root = document.getElementById(ROOT_ID);
    if (root) return root;
    var main = _getContentArea();
    if (!main) return null;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'nx-answer-root';
    // Insert after the hero (or after tabs), so it sits in the content slot.
    var tabContent = main.querySelector('.tr-tab-content');
    if (tabContent && tabContent.parentNode === main) {
      main.insertBefore(root, tabContent);
    } else {
      main.appendChild(root);
    }
    return root;
  }

  function _hideTrilhaContent() {
    var tabs = document.querySelector('.tr-tabs');
    var tabContent = document.querySelector('.tr-tab-content');
    var footer = document.querySelector('.tr-footer');
    if (tabs) tabs.hidden = true;
    if (tabContent) tabContent.hidden = true;
    if (footer) footer.hidden = true;
  }

  function _showTrilhaContent() {
    var tabs = document.querySelector('.tr-tabs');
    var tabContent = document.querySelector('.tr-tab-content');
    var footer = document.querySelector('.tr-footer');
    if (tabs) tabs.hidden = false;
    if (tabContent) tabContent.hidden = false;
    if (footer) footer.hidden = false;
  }

  function _unmountAnswer() {
    if (window.NexoAnswer && typeof window.NexoAnswer.unmount === 'function') {
      try { window.NexoAnswer.unmount(); } catch (_) {}
    }
    var root = document.getElementById(ROOT_ID);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    _mounted = false;
    _lastSessionCode = null;
    _showTrilhaContent();
  }

  function _render(data) {
    var session = data && data.session;
    var question = data && data.current_question;

    // No open session, or session has no live question → show trilha content
    // and tear down the answer panel.
    if (!session || !question) {
      if (_mounted) _unmountAnswer();
      return;
    }

    if (!window.NexoAnswer || typeof window.NexoAnswer.mount !== 'function') {
      // Module not loaded yet — nothing we can do this tick.
      return;
    }

    var root = _ensureRoot();
    if (!root) return;

    // Mount (idempotent inside NexoAnswer when sessionCode unchanged).
    // We intentionally do NOT pass the session code as a visible string;
    // it's only used to drive polling via the classpulse-question element.
    _hideTrilhaContent();
    window.NexoAnswer.mount({
      container:    root,
      sessionCode:  session.code,
      sessionTitle: session.title || '',
      onClose:      _unmountAnswer
    });
    _mounted = true;
    _lastSessionCode = session.code;
  }

  // Expose a stop hook for tests / cleanup; not used by trilha itself.
  window.TrilhaNexo = {
    stop: function () { _stopped = true; clearTimeout(_timer); _unmountAnswer(); }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
