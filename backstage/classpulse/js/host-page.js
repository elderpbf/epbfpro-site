'use strict';

// CPHost.Page -- orchestrator. Boots auth, the Codex topbar, then calls
// State.init -> Layout.init -> Composer.init -> SQA.init -> Share.init ->
// Session.init in order, attaches the cpq-data dispatcher, and finally
// kicks loadSession() when ?code= is present.
//
// Auto-init on DOMContentLoaded; tests call CPHost.Page.init() directly.

(function () {
  var CPHost = window.CPHost = window.CPHost || {};

  function _cpqDataHandler(e) {
    var S = CPHost.State;
    var data = e.detail;
    if (!S.sessionCode) return;

    if (S.qaModule) S.qaModule.syncFromState(data);

    CPHost.History.renderHistory(data.history || []);

    var q = data.active_question;
    if (!q) {
      S.activeQId = null;
      S.activeQType = null;
      S.activeStudentQuestionId = null;
      CPHost.$('active-q-panel').style.display = 'none';
      CPHost.$('active-standard').style.display = '';
      CPHost.$('active-student-qa').style.display = 'none';
      return;
    }

    S.activeQId = q.id;
    S.activeQType = q.type || 'mc';

    if (S.activeQType === 'student_qa') {
      S.activeStudentQuestionId = q.student_question_id || null;
      CPHost.SQA.renderStudentQaActive(q);
      CPHost.$('active-standard').style.display = 'none';
      CPHost.$('active-student-qa').style.display = '';
      CPHost.$('active-q-panel').style.display = 'block';
      return;
    }

    S.activeStudentQuestionId = null;
    CPHost.$('active-student-qa').style.display = 'none';
    CPHost.$('active-standard').style.display = '';

    CPHost.$('aq-text').textContent = q.text;
    if (S.visToggle) S.visToggle.syncFromQuestion(q);

    var T = CPQuestionTypes.get(q.type || 'mc');
    var total = 0;
    if (T.usesTextAnswers) {
      total = (q.text_answers || []).length;
    } else {
      var counts = q.answer_counts || [];
      total = counts.reduce(function (a, b) { return a + b; }, 0);
    }
    CPHost.$('aq-tally').textContent = total + ' resposta' + (total !== 1 ? 's' : '');

    // Polling: keep the checkbox enabled-state in sync with the type, but DO
    // NOT overwrite the user's checked-state. Stomping it every 3s is Bundle
    // J's headline bug (unchecked checkmarks re-checking themselves).
    CPHost.Composer.syncChk('chk-reveal-answer', T.canReveal);
    CPHost.Composer.syncChk('chk-show-results',  T.canShowResults);

    CPHost.$('active-q-panel').style.display = 'block';
  }

  function _cpqRemoveAnswerHandler(e) {
    CPHost.SQA.removeAnswer(e.detail.id, e.detail.el);
  }

  function init() {
    // Auth gate
    if (typeof BS_AUTH !== 'undefined' && BS_AUTH && typeof BS_AUTH.guard === 'function') {
      BS_AUTH.guard();
    }

    // Bundle F: host.html is the Sessões sub-tab of Perguntas. Wire the
    // Codex topbar so navigation back to other Codex surfaces works.
    if (typeof Topbar !== 'undefined' && Topbar) {
      Topbar.init({
        title: 'PensoIA',
        subtitle: 'PensoCodex',
        backLink: '/backstage/',
        tabs: Topbar.codexTabs('perguntas'),
      });
      Topbar.renderSubTabsInto(CPHost.$('live-bar-subtabs'), 'perguntas', 'ao-vivo');
    }

    // Order matters: State seeds AUTH_TOKEN + urlCode; Composer builds formEls
    // (consumed by SQA + History via State.formEls); Layout materializes
    // layoutState (read by Session.qaModule.onPromoted).
    CPHost.State.init();
    CPHost.Layout.init();
    CPHost.Composer.init();
    CPHost.SQA.init();
    CPHost.Share.init();
    CPHost.Session.init();

    // Redirect-on-missing-code is for the STANDALONE host.html only. In a
    // mounted sidebar context (State.root set), no code = no session selected
    // yet; just return without bootstrapping. The sidebar will re-mount with
    // a sessionCode when the user picks one.
    if (!CPHost.State.urlCode) {
      if (!CPHost.State.root) {
        location.href = '/backstage/classpulse/';
      }
      return;
    }

    var cpqEl = CPHost.$('cpq');
    if (cpqEl) {
      cpqEl.addEventListener('cpq-data', _cpqDataHandler);
      cpqEl.addEventListener('cpq-remove-answer', _cpqRemoveAnswerHandler);
    }

    // Boot the session load.
    CPHost.Session.loadSession();
  }

  CPHost.Page = {
    init: init,
  };

  // ---------- mount / unmount lifecycle ----------
  // Two ways to bring CPHost online:
  //
  //   1) Standalone host.html: DOMContentLoaded fires `init` below. State.root
  //      stays null, all DOM lookups resolve against `document`. The URL's
  //      ?code= seeds State.urlCode.
  //
  //   2) Sidebar mount: classpulse/index.html (or any consumer) calls
  //      CPHost.mount(rootEl, {sessionCode, authToken}). State.root scopes
  //      every $() lookup to the rootEl. mount() must be paired with unmount()
  //      before mounting a different session, to avoid stacked listeners and
  //      stale state. mount() is idempotent: calling it twice in a row
  //      tears down the previous mount first.

  CPHost.mount = function (rootEl, opts) {
    if (!rootEl) throw new Error('CPHost.mount: rootEl required');
    opts = opts || {};

    // If a previous mount is live, tear it down first.
    if (CPHost.State.root) CPHost.unmount();

    rootEl.classList.add('host-root');
    CPHost.State.root = rootEl;
    CPHost.State.urlCode = opts.sessionCode || null;
    CPHost.State.AUTH_TOKEN = opts.authToken || null;
    init();
  };

  CPHost.unmount = function () {
    var S = CPHost.State;

    // Stop the cpq element's poll loop (it owns its own timer).
    try {
      var cpq = CPHost.$('cpq');
      if (cpq && typeof cpq.stopPolling === 'function') cpq.stopPolling();
    } catch (_) {}

    // Clear the SQA debounce.
    if (S._sqaDebounce) {
      try { clearTimeout(S._sqaDebounce); } catch (_) {}
      S._sqaDebounce = null;
    }

    // Detach any document/window listeners that init paths registered.
    S._docListeners.forEach(function (L) {
      try { L.target.removeEventListener(L.type, L.fn); } catch (_) {}
    });
    S._docListeners = [];

    // Strip mount-only classes from the root.
    if (S.root) {
      try {
        S.root.classList.remove('host-root');
        S.root.classList.remove('is-hosted');
      } catch (_) {}
    }

    // Reset session/active state. layoutState is persisted in localStorage
    // so it survives a mount cycle by design.
    S.root = null;
    S.sessionCode = null;
    S.urlCode = null;
    S.AUTH_TOKEN = null;
    S.activeQId = null;
    S.activeQType = null;
    S.activeStudentQuestionId = null;
    S._sqaLastServerAnswer = null;
    S._sqaDraft = null;
    S._sqaSaving = false;
    S._historyMap = {};
    S._currentSession = null;
    S._trailTurma = null;
    S._trailAllTurmas = [];
    S.visToggle = null;
    S.qaModule = null;
    S.formEls = null;
  };

  // Standalone host.html: on DCL, mount to document.body with opts derived
  // from the URL and BS_AUTH. This routes through the same lifecycle the
  // sidebar uses (sets State.root + host-root class), so CSS rules that key
  // off .host-root work uniformly in both consumers.
  //
  // Sidebar consumers (classpulse/index.html) call CPHost.mount() explicitly
  // on a session click and do not rely on DOMContentLoaded.
  document.addEventListener('DOMContentLoaded', function () {
    // Don't double-mount if a consumer already called CPHost.mount() between
    // script load and DCL (rare but possible).
    if (CPHost.State.root) return;
    CPHost.mount(document.body, {
      sessionCode: new URLSearchParams(location.search).get('code'),
      authToken: (typeof BS_AUTH !== 'undefined' && BS_AUTH) ? BS_AUTH.TOKEN : null,
    });
  });
})();
