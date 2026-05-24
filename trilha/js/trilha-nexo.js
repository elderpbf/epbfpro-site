'use strict';

// Trilha-side ClassPulse orchestrator. Polls cp_get_active_for_turma every
// 15s (paused via Page Visibility API when the tab is hidden). When the
// turma's session is OPEN (regardless of whether a question is live), it
// hides trilha's hero / tabs / tab-content / footer and mounts the full
// /go answer experience inline via NexoAnswer.mount(). Trilha's chrome
// (pensoia-header, WhatsApp pill, A−/A+) stays visible.
//
// When the session closes (session: null), the answer is unmounted and the
// trilha content is restored. /go/index.html is intentionally untouched and
// keeps working as its own standalone surface.

(function () {
  var POLL_MS         = 15000;
  var POLL_MS_BACKOFF = 60000; // when there's no open session, slow down
  var HOST_ID         = 'nx-answer-host';
  var HIDDEN_CLS      = 'is-hidden-by-nexo';
  var HIDE_SELECTORS  = ['.tr-hero', '.tr-tabs', '.tr-tab-content', '.tr-footer'];

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

  var _timer        = null;
  var _stopped      = false;
  var _isMounted    = false;
  var _lastCode     = null;

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
        _silent: true,
      });
    } catch (_) {
      // Network blip; try again on next tick at normal cadence.
      _schedule(POLL_MS);
      return;
    }
    _apply(data || {});
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

  // Trigger: session.is_open. cp_get_active_for_turma returns session=null
  // when the session is not OPEN, so a truthy session object is the trigger.
  function _apply(data) {
    var session = data && data.session;
    if (session) {
      var code = session.code || '';
      if (_isMounted && code === _lastCode) return; // already showing
      _mount(code);
    } else {
      if (_isMounted) _unmount();
    }
  }

  function _mount(sessionCode) {
    if (!window.NexoAnswer || typeof window.NexoAnswer.mount !== 'function') {
      // Module not loaded; leave trilha visible and try again next tick.
      return;
    }

    // Hide trilha body chrome (NOT the pensoia-header).
    HIDE_SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.classList.add(HIDDEN_CLS);
      });
    });

    // Create / reuse host container under tr-main (or fall back to body).
    var host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      var main = document.getElementById('tr-main') || document.body;
      main.appendChild(host);
    }

    window.NexoAnswer.mount(host, { sessionCode: sessionCode });
    _isMounted = true;
    _lastCode  = sessionCode;
  }

  function _unmount() {
    if (window.NexoAnswer && typeof window.NexoAnswer.unmount === 'function') {
      try { window.NexoAnswer.unmount(); } catch (_) {}
    }
    var host = document.getElementById(HOST_ID);
    if (host && host.parentNode) host.parentNode.removeChild(host);

    HIDE_SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        el.classList.remove(HIDDEN_CLS);
      });
    });

    _isMounted = false;
    _lastCode  = null;
  }

  // Expose a small surface for tests and external cleanup.
  window.TrilhaNexo = {
    stop: function () { _stopped = true; clearTimeout(_timer); },
    _tickForTest: _tick,
    _isMountedForTest: function () { return _isMounted; },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
