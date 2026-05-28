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
      document.getElementById('active-q-panel').style.display = 'none';
      document.getElementById('active-standard').style.display = '';
      document.getElementById('active-student-qa').style.display = 'none';
      return;
    }

    S.activeQId = q.id;
    S.activeQType = q.type || 'mc';

    if (S.activeQType === 'student_qa') {
      S.activeStudentQuestionId = q.student_question_id || null;
      CPHost.SQA.renderStudentQaActive(q);
      document.getElementById('active-standard').style.display = 'none';
      document.getElementById('active-student-qa').style.display = '';
      document.getElementById('active-q-panel').style.display = 'block';
      return;
    }

    S.activeStudentQuestionId = null;
    document.getElementById('active-student-qa').style.display = 'none';
    document.getElementById('active-standard').style.display = '';

    document.getElementById('aq-text').textContent = q.text;
    if (S.visToggle) S.visToggle.syncFromQuestion(q);

    var T = CPQuestionTypes.get(q.type || 'mc');
    var total = 0;
    if (T.usesTextAnswers) {
      total = (q.text_answers || []).length;
    } else {
      var counts = q.answer_counts || [];
      total = counts.reduce(function (a, b) { return a + b; }, 0);
    }
    document.getElementById('aq-tally').textContent = total + ' resposta' + (total !== 1 ? 's' : '');

    // Polling: keep the checkbox enabled-state in sync with the type, but DO
    // NOT overwrite the user's checked-state. Stomping it every 3s is Bundle
    // J's headline bug (unchecked checkmarks re-checking themselves).
    CPHost.Composer.syncChk('chk-reveal-answer', T.canReveal);
    CPHost.Composer.syncChk('chk-show-results',  T.canShowResults);

    document.getElementById('active-q-panel').style.display = 'block';
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
      Topbar.renderSubTabsInto(document.getElementById('live-bar-subtabs'), 'perguntas', 'ao-vivo');
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

    // Redirect-on-missing-code: if the page is opened with no ?code=, kick
    // back to the sessions list (mirrors the legacy inline boot).
    if (!CPHost.State.urlCode) {
      location.href = '/backstage/classpulse/';
      return;
    }

    var cpqEl = document.getElementById('cpq');
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

  // host.html loads these scripts at the end of body, so DCL has not fired
  // yet by the time this IIFE executes. Defer init to DOMContentLoaded so
  // tests (which run in a vm sandbox with a stub addEventListener) can call
  // init() manually.
  document.addEventListener('DOMContentLoaded', init);
})();
