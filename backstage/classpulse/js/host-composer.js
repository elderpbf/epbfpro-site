'use strict';

// CPHost.Composer -- the launch-question form (left column). Owns the
// question-type UI dispatch, poll-row builder, checkbox sync, clearForm,
// the launch + close-question handlers, and the QuestionBank panel wiring.

(function () {
  var CPHost = window.CPHost = window.CPHost || {};

  function buildPollRow(idx) {
    var letters = (typeof LETTERS !== 'undefined') ? LETTERS : ['A', 'B', 'C', 'D', 'E', 'F'];
    var row = document.createElement('div');
    row.className = 'opt-row';
    row.innerHTML = '<div class="opt-letter">' + letters[idx] + '</div>' +
      '<input class="host-input" type="text" placeholder="Opção ' + letters[idx] + '">';
    return row;
  }

  function initPollRows(count) {
    var container = document.getElementById('poll-rows');
    container.innerHTML = '';
    for (var i = 0; i < count; i++) container.appendChild(buildPollRow(i));
  }

  // Seed a checkbox to its default for the active question type. Called when
  // the user picks a new type or clears the launch form; called once on boot.
  function resetChk(id, supported) {
    var S = CPHost.State;
    CPCheckboxSync.reset({
      chk: document.getElementById(id),
      supported: supported,
      defaultChecked: !!S.CHK_DEFAULTS[id],
    });
  }

  // Sync a checkbox's enabled state without touching its checked state. Called
  // from the cpq-data poll handler so a user's local toggle survives the next
  // poll tick.
  function syncChk(id, supported) {
    CPCheckboxSync.sync({
      chk: document.getElementById(id),
      supported: supported,
    });
  }

  function buildFormEls() {
    return {
      textInput:    document.getElementById('q-text'),
      mcPanel:      document.getElementById('q-opts-mc'),
      pollPanel:    document.getElementById('q-opts-poll'),
      ratingPanel:  document.getElementById('q-opts-rating'),
      numericPanel: document.getElementById('q-opts-numeric'),
      optA: document.getElementById('q-opt-a'),
      optB: document.getElementById('q-opt-b'),
      optC: document.getElementById('q-opt-c'),
      optD: document.getElementById('q-opt-d'),
      mcRows:        document.querySelectorAll('#q-opts-mc .opt-row'),
      mcRadios:      document.querySelectorAll('#q-opts-mc .opt-correct-radio'),
      correctRadios: document.querySelectorAll('input[name="correct"]'),
      pollRows:   document.getElementById('poll-rows'),
      ratingMin:  document.getElementById('q-rating-min'),
      ratingMax:  document.getElementById('q-rating-max'),
      numericMin: document.getElementById('q-num-min'),
      numericMax: document.getElementById('q-num-max'),
      mcMaxSelect:   document.getElementById('q-mc-max-select'),
      pollMaxSelect: document.getElementById('q-poll-max-select'),
      initPollRows: initPollRows,
    };
  }

  function applyTypeUI(qType) {
    var S = CPHost.State;
    var T = CPQuestionTypes.get(qType);
    CPQuestionTypes.applyVisibility(S.formEls, T);
    resetChk('chk-reveal-answer', T.canReveal);
    resetChk('chk-show-results',  T.canShowResults);
    document.getElementById('q-generate-btn').style.display = T.aiGenSupported ? '' : 'none';
    document.getElementById('q-improve-btn').style.display  = T.aiGenSupported ? '' : 'none';
  }

  function clearForm() {
    var S = CPHost.State;
    document.getElementById('q-text').value = '';
    CPQuestionTypes.list().forEach(function (t) {
      CPQuestionTypes.get(t).clearForm(S.formEls);
    });
    document.getElementById('q-type').value = 'mc';
    applyTypeUI('mc');
  }

  async function launchFromBank(q, btn) {
    var S = CPHost.State;
    btn.disabled = true;
    btn.textContent = 'Lançando...';
    try {
      var qType = q.type || 'mc';
      var T = CPQuestionTypes.get(qType);
      var opts = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
      var ca = (q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer !== '')
        ? q.correct_answer : null;
      var payload = {
        action: 'launch_question', auth_token: S.AUTH_TOKEN,
        session_code: S.sessionCode,
        type: qType,
        text: q.question,
        options: opts,
        correct_answer: ca,
      };
      if (T && T.canMultiSelect) {
        payload.max_select = (q.max_select !== undefined && q.max_select !== null) ? parseInt(q.max_select) : 1;
      } else if (T && T.usesTextAnswers) {
        // See Composer.launch for the rationale: worker default-to-1 plus
        // options.length=0 trips the validation for text-answer types.
        payload.max_select = 0;
      }
      var res = await callWorker(payload);
      S.activeQId = res.id;
      CPHost.Session.onQuestionLaunched();
      CPHost.Utils.clearAlert();
    } catch (e) {
      CPHost.Utils.showAlert('error', 'Erro ao lançar: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Lançar';
    }
  }

  function prefillForm(q) {
    var S = CPHost.State;
    document.getElementById('q-text').value = CPHost.Utils.stripHtml(q.question || '');
    var qType = q.type || 'mc';
    document.getElementById('q-type').value = qType;
    applyTypeUI(qType);
    var parsedOpts;
    if (typeof q.options === 'string') {
      try { parsedOpts = JSON.parse(q.options); } catch (_) { parsedOpts = []; }
    } else {
      parsedOpts = q.options || [];
    }
    var correctAnswers = Array.isArray(q.correct_answers) ? q.correct_answers
      : (q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer !== ''
          ? [parseInt(q.correct_answer)] : []);
    CPQuestionTypes.get(qType).restoreForm(S.formEls, {
      options: parsedOpts,
      correct_answers: correctAnswers,
      correct_answer: q.correct_answer,
      max_select: q.max_select !== undefined ? q.max_select : 1,
    });
  }

  function init() {
    var S = CPHost.State;
    S.formEls = buildFormEls();

    document.getElementById('q-mc-max-select').addEventListener('change', function () {
      CPQuestionTypes.get('mc').setupForm(S.formEls);
    });

    document.getElementById('q-type').addEventListener('change', function () {
      applyTypeUI(this.value);
      document.querySelectorAll('input[name="correct"]').forEach(function (r) { r.checked = false; });
    });

    document.getElementById('poll-add-btn').addEventListener('click', function () {
      var container = document.getElementById('poll-rows');
      if (container.children.length >= S.MAX_POLL_OPTS) return;
      container.appendChild(buildPollRow(container.children.length));
    });

    document.getElementById('launch-btn').addEventListener('click', async function () {
      var qType = document.getElementById('q-type').value;
      var text  = document.getElementById('q-text').value.trim();
      if (!text) return CPHost.Utils.showAlert('error', 'Escreva a pergunta.');

      var T = CPQuestionTypes.get(qType);
      var read = T.readForm(S.formEls);
      if (read.error) return CPHost.Utils.showAlert('error', read.error);

      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Lançando...';

      try {
        // max_select handling per type:
        //   - mc/poll: readForm returned one; use it
        //   - tf: omit; worker default of 1 is correct for single-select V/F
        //   - text-answer types (open/wordcloud/rating/numeric): send 0.
        //     The worker defaults to 1 when omitted and rejects max_select >
        //     options.length, but options.length=0 for these types (either []
        //     or a non-array {min,max} object). max_select is semantically
        //     unused for text answers; 0 bypasses the check.
        var payload = {
          action: 'launch_question', auth_token: S.AUTH_TOKEN,
          session_code: S.sessionCode, type: qType, text: text,
          options: read.options, correct_answer: read.correct_answer,
        };
        if (read.max_select !== undefined) {
          payload.max_select = read.max_select;
        } else if (T.usesTextAnswers) {
          payload.max_select = 0;
        }
        var res = await callWorker(payload);
        S.activeQId = res.id;
        CPHost.Session.onQuestionLaunched();
        if (S.visToggle) S.visToggle.reset();
        CPHost.Utils.clearAlert();
        clearForm();
      } catch (e) {
        CPHost.Utils.showAlert('error', 'Erro: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Lançar pergunta';
      }
    });

    document.getElementById('close-question-btn').addEventListener('click', async function () {
      if (!S.activeQId) return;
      var showResults  = document.getElementById('chk-show-results').checked;
      var revealAnswer = document.getElementById('chk-reveal-answer').checked;
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Encerrando...';
      try {
        await callWorker({
          action: 'close_question', auth_token: S.AUTH_TOKEN,
          id: S.activeQId, session_code: S.sessionCode,
          show_results: showResults, reveal_answer: revealAnswer,
        });
        S.activeQId = null;
        document.getElementById('active-q-panel').style.display = 'none';
        if (S.visToggle) S.visToggle.reset();
        CPHost.Utils.clearAlert();
      } catch (e) {
        CPHost.Utils.showAlert('error', 'Erro: ' + e.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Encerrar pergunta';
      }
    });

    document.getElementById('clear-form-btn').addEventListener('click', clearForm);

    // QuestionBank panel
    document.getElementById('bank-toggle-btn').addEventListener('click', function () {
      var panel = document.getElementById('bank-panel');
      var isOpen = panel.classList.toggle('open');
      this.classList.toggle('open', isOpen);
      if (isOpen && typeof QuestionBank !== 'undefined') QuestionBank.loadSets();
    });

    if (typeof QuestionBank !== 'undefined') {
      QuestionBank.init({
        setSelect:    document.getElementById('bank-set-select'),
        questionList: document.getElementById('bank-q-list'),
        generateBtn:  document.getElementById('q-generate-btn'),
        improveBtn:   document.getElementById('q-improve-btn'),
        errorEl:      document.getElementById('q-error'),
        canDelete:    false,
        canCreateSet: false,
        onSelect: function (q) { prefillForm(q); },
        onLaunch: function (q, btn) { launchFromBank(q, btn); },
        getFormState: function () {
          var qType = document.getElementById('q-type').value;
          var maxSelEl = qType === 'mc' ? document.getElementById('q-mc-max-select')
                       : qType === 'poll' ? document.getElementById('q-poll-max-select') : null;
          return {
            text: document.getElementById('q-text').value.trim(),
            type: qType,
            options: [
              document.getElementById('q-opt-a').value.trim(),
              document.getElementById('q-opt-b').value.trim(),
              document.getElementById('q-opt-c').value.trim(),
              document.getElementById('q-opt-d').value.trim(),
            ],
            max_select: maxSelEl ? parseInt(maxSelEl.value) : 1,
          };
        },
      });
    }

    // Initialize checkbox state on page load
    applyTypeUI(document.getElementById('q-type').value);
  }

  CPHost.Composer = {
    buildPollRow: buildPollRow,
    initPollRows: initPollRows,
    resetChk: resetChk,
    syncChk: syncChk,
    applyTypeUI: applyTypeUI,
    clearForm: clearForm,
    prefillForm: prefillForm,
    launchFromBank: launchFromBank,
    init: init,
  };
})();
