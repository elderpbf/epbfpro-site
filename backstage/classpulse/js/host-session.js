'use strict';

// CPHost.Session -- session lifecycle: load the session by URL ?code=, pick
// it (selectSession), and start/stop hosting. Owns the cpq polling kicker
// and Codex topbar dot updates so launched questions surface immediately.

(function () {
  var CPHost = window.CPHost = window.CPHost || {};

  // Bundle L.1 follow-up: cpq + topbar nudges for session lifecycle moments.
  //
  // Why this exists: classpulse-question.min.js (_poll) calls stopPolling()
  // whenever a get_session_state response comes back with status='closed'.
  // The element never restarts on its own, so opening host.html while the
  // session is still closed and then clicking Iniciar would leave cpq stuck.
  //
  // Fix: kick cpq.startPolling() at every transition to open (reopen success,
  // launch success) and light the Codex Perguntas tab dot immediately.
  function _kickCpqPoll() {
    try {
      var cpq = document.getElementById('cpq');
      if (cpq && typeof cpq.startPolling === 'function') cpq.startPolling();
    } catch (_) {}
  }

  function onSessionLive() {
    _kickCpqPoll();
    try { if (window.Topbar) Topbar.setTabDot('perguntas', true); } catch (_) {}
  }

  function onQuestionLaunched() { onSessionLive(); }

  async function loadSession() {
    var S = CPHost.State;
    try {
      var code = S.urlCode.toUpperCase();
      var results = await Promise.allSettled([
        callWorker({ action: 'list_sessions' }),
        callWorker({ action: 'ct_lookup_turma_by_session', auth_token: S.AUTH_TOKEN, session_id: code }),
        callWorker({ action: 'ct_list_all_turmas', auth_token: S.AUTH_TOKEN }),
      ]);
      var data = results[0].status === 'fulfilled' ? results[0].value : { sessions: [] };
      S._trailTurma     = (results[1].status === 'fulfilled' ? results[1].value.turma : null) || null;
      S._trailAllTurmas = (results[2].status === 'fulfilled' ? results[2].value.turmas : null) || [];

      var match = (data.sessions || []).find(function (s) { return s.code === S.urlCode.toUpperCase(); });
      if (!match) {
        if (typeof showToastError === 'function') showToastError('Sessão ' + S.urlCode + ' não encontrada.');
        setTimeout(function () { location.href = '/backstage/classpulse/'; }, 2000);
        return;
      }
      selectSession(match);
    } catch (e) {
      if (typeof showToastError === 'function') showToastError('Erro ao carregar sessão: ' + e.message);
    }
  }

  function selectSession(s) {
    var S = CPHost.State;
    S.sessionCode = s.code;
    S._currentSession = s;

    document.getElementById('session-name-display').textContent = s.title || ('Sessão ' + s.code);
    document.getElementById('display-link').href = '/go/display.html?code=' + encodeURIComponent(s.code);

    CPHost.Utils.clearAlert();
    CPHost.Share.renderTrailLink();
    CPHost.Share.refreshShareSurface();
    CPHost.Share.applyHostedUI(s.status === 'open');

    if (!S.qaModule) {
      S.qaModule = ClassPulseQA.attach({
        sessionCode: s.code,
        authToken:   S.AUTH_TOKEN,
        callWorker:  callWorker,
        containerEl: document.getElementById('qa-section'),
        toggleEl:    null,
        badgeEl:     document.getElementById('qa-badge'),
        feedEl:      document.getElementById('qa-feed'),
        onError:     function (msg) { CPHost.Utils.showAlert('error', msg); },
        onPromoted:  function () {
          // Ensure the center column is visible so the new student_qa active
          // card is in view.
          if (S.layoutState && !S.layoutState.center.visible) {
            S.layoutState.center.visible = true;
            CPHost.Layout.applyLayout();
            CPHost.Layout.saveLayout();
          }
        },
        onClosedActive: function () { /* cpq-data tick will refresh */ },
      });
    } else {
      S.qaModule.setSessionCode(s.code);
    }

    // Always poll session state so history renders even when not hosted.
    document.getElementById('cpq').setAttribute('session', s.code);
  }

  async function doStartHost(force) {
    var S = CPHost.State;
    try {
      await callWorker({ action: 'reopen_session', auth_token: S.AUTH_TOKEN, code: S.sessionCode });
      S._currentSession.status = 'open';
      CPHost.Share.applyHostedUI(true);
      CPHost.Utils.clearAlert();
      onSessionLive();
    } catch (e) {
      if (!force && e.data && e.data.active_code) {
        var name = e.data.active_title || e.data.active_code;
        var msg = 'A sessão "' + name + '" já está aberta. Deseja encerrá-la para iniciar esta?';
        if (confirm(msg)) {
          try {
            await callWorker({ action: 'close_session', auth_token: S.AUTH_TOKEN, code: e.data.active_code });
            await doStartHost(true);
            return;
          } catch (e2) {
            if (typeof showToastError === 'function') showToastError('Erro ao encerrar a sessão ativa: ' + e2.message);
            return;
          }
        }
        return;
      }
      if (typeof showToastError === 'function') showToastError(e.message);
    }
  }

  function init() {
    var S = CPHost.State;

    S.visToggle = CPVisibilityToggle.attach({
      buttonEl:       document.getElementById('toggle-bars-btn'),
      getActiveQId:   function () { return S.activeQId; },
      getSessionCode: function () { return S.sessionCode; },
      authToken:      S.AUTH_TOKEN,
      callWorker:     callWorker,
      onError:        function (msg) { CPHost.Utils.showAlert('error', msg); },
    });

    document.getElementById('start-host-btn').addEventListener('click', async function () {
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Iniciando...';
      try {
        await doStartHost(false);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Iniciar';
      }
    });

    document.getElementById('stop-host-btn').addEventListener('click', async function () {
      if (!confirm('Encerrar a sessão? Os alunos não poderão mais responder.')) return;
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Encerrando...';
      try {
        if (S.activeQId) {
          try {
            await callWorker({
              action: 'close_question', auth_token: S.AUTH_TOKEN,
              id: S.activeQId, session_code: S.sessionCode,
              show_results: false, reveal_answer: false,
            });
          } catch (_) {}
        }
        await callWorker({ action: 'close_session', auth_token: S.AUTH_TOKEN, code: S.sessionCode });
        S._currentSession.status = 'closed';
        CPHost.Share.applyHostedUI(false);
        CPHost.Utils.clearAlert();
      } catch (e) {
        if (typeof showToastError === 'function') showToastError(e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Encerrar';
      }
    });
  }

  CPHost.Session = {
    loadSession: loadSession,
    selectSession: selectSession,
    doStartHost: doStartHost,
    onSessionLive: onSessionLive,
    onQuestionLaunched: onQuestionLaunched,
    init: init,
  };
})();
