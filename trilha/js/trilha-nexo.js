'use strict';

// Trilha-side PensoNexo surfacer. Polls cp_get_active_for_turma every 15s
// (paused via Page Visibility API when the tab is hidden) and paints one of
// three states into a single floating root:
//
//   - no open session            → nothing rendered
//   - open session, no question  → small pending pill (bottom-right)
//   - open session + question    → fullscreen takeover overlay
//
// The takeover currently shows the question text plus an "Abrir sessão"
// button that lands on /go/?code=<session_code> for the actual answer flow.
// A future iteration will inline the answer UI directly here.

(function () {
  var POLL_MS         = 15000;
  var POLL_MS_BACKOFF = 60000;   // when there's no open session, slow down
  var ROOT_ID         = 'nx-root';

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
  var _lastState = { sessionCode: null, questionId: null };

  function init() {
    if (!_clientSlug || !_turmaSlug) return; // trilha will surface its own error
    _ensureRoot();
    _tick();
    document.addEventListener('visibilitychange', _onVisibilityChange);
  }

  function _ensureRoot() {
    if (document.getElementById(ROOT_ID)) return;
    var root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'nx-root';
    document.body.appendChild(root);
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

  function _render(data) {
    var root = document.getElementById(ROOT_ID);
    if (!root) return;

    var session = data && data.session;
    var question = data && data.current_question;

    var nextCode = session ? session.code : null;
    var nextQid  = question ? question.id : null;

    // No-op if state didn't change. The overlay survives across ticks so its
    // option highlights and any future inline answer affordances aren't
    // re-rendered every 15s.
    if (nextCode === _lastState.sessionCode && nextQid === _lastState.questionId) return;
    _lastState = { sessionCode: nextCode, questionId: nextQid };

    if (!session) {
      root.innerHTML = '';
      document.body.classList.remove('nx-overlay-open');
      return;
    }

    if (!question) {
      // Session open, no question yet — quiet floating pill.
      root.innerHTML =
        '<div class="nx-pending-pill" role="status">' +
          '<span class="nx-pill-dot" aria-hidden="true"></span>' +
          '<span class="nx-pill-text">Aguardando pergunta ao vivo</span>' +
        '</div>';
      document.body.classList.remove('nx-overlay-open');
      return;
    }

    // Active question — fullscreen takeover. Body class freezes scroll.
    var optsHtml = '';
    if (Array.isArray(question.options) && question.options.length) {
      optsHtml = '<ul class="nx-overlay-opts">' +
        question.options.map(function (o, i) {
          return '<li class="nx-overlay-opt">' +
                   '<span class="nx-overlay-opt-letter">' + _letter(i) + '</span>' +
                   '<span class="nx-overlay-opt-text">' + _esc(o) + '</span>' +
                 '</li>';
        }).join('') +
      '</ul>';
    }

    var goHref = '/go/?code=' + encodeURIComponent(session.code);

    root.innerHTML =
      '<div class="nx-overlay" role="dialog" aria-modal="true" aria-labelledby="nx-overlay-title">' +
        '<div class="nx-overlay-card">' +
          '<div class="nx-overlay-eyebrow">' +
            '<span class="nx-pill-dot" aria-hidden="true"></span>' +
            'Pergunta ao vivo' +
          '</div>' +
          '<h2 id="nx-overlay-title" class="nx-overlay-title">' + _esc(question.text || '') + '</h2>' +
          optsHtml +
          '<a class="nx-overlay-cta" href="' + goHref + '">Responder agora</a>' +
          '<p class="nx-overlay-hint">' + _esc(session.title || 'Sessão ao vivo') + '</p>' +
        '</div>' +
      '</div>';
    document.body.classList.add('nx-overlay-open');
  }

  function _letter(i) {
    return String.fromCharCode(65 + i); // A, B, C, ...
  }

  function _esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Expose a stop hook for tests / cleanup; not used by trilha itself.
  window.TrilhaNexo = {
    stop: function () { _stopped = true; clearTimeout(_timer); }
  };

  document.addEventListener('DOMContentLoaded', init);
})();
