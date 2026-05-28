'use strict';

// CPHost.SQA -- the student_qa active-question surface. Renders the active
// student question, debounces typed answers to the worker, and handles
// inline answer removal triggered by the cpq-remove-answer event.

(function () {
  var CPHost = window.CPHost = window.CPHost || {};

  function renderStudentQaActive(q) {
    var S = CPHost.State;
    var metaEl    = document.getElementById('sqa-meta');
    var textEl    = document.getElementById('sqa-text');
    var inputEl   = document.getElementById('sqa-response');
    var statusEl  = document.getElementById('sqa-status');

    var when = '';
    try { when = q.student_time ? new Date(q.student_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; } catch (_) {}
    metaEl.textContent = (q.student_name || 'Aluno') + (when ? ' · ' + when : '');
    textEl.textContent = q.text || '';

    var serverAnswer = q.student_answer || '';
    if (document.activeElement !== inputEl) {
      if (serverAnswer !== S._sqaLastServerAnswer) {
        inputEl.value = serverAnswer;
        S._sqaDraft = serverAnswer;
      }
    }
    S._sqaLastServerAnswer = serverAnswer;
    statusEl.textContent = S._sqaSaving ? 'Salvando…' : '';
    statusEl.classList.toggle('is-saving', S._sqaSaving);
  }

  function scheduleSqaSave() {
    var S = CPHost.State;
    if (S._sqaDebounce) clearTimeout(S._sqaDebounce);
    S._sqaDebounce = setTimeout(commitSqaAnswer, 350);
  }

  async function commitSqaAnswer() {
    var S = CPHost.State;
    if (!S.activeStudentQuestionId) return;
    var inputEl = document.getElementById('sqa-response');
    var text = inputEl.value;
    if (text === S._sqaLastServerAnswer) return;
    S._sqaSaving = true;
    document.getElementById('sqa-status').textContent = 'Salvando…';
    document.getElementById('sqa-status').classList.add('is-saving');
    try {
      var res = await callWorker({
        action: 'update_student_question',
        auth_token: S.AUTH_TOKEN,
        id: S.activeStudentQuestionId,
        status: 'pending',
        answer: text,
      });
      if (res && res.ok) {
        S._sqaLastServerAnswer = text;
        document.getElementById('sqa-status').textContent = 'Salvo';
        setTimeout(function () {
          if (!S._sqaSaving) document.getElementById('sqa-status').textContent = '';
        }, 1200);
      }
    } catch (e) {
      CPHost.Utils.showAlert('error', 'Erro ao salvar resposta: ' + e.message);
    } finally {
      S._sqaSaving = false;
      document.getElementById('sqa-status').classList.remove('is-saving');
    }
  }

  async function removeAnswer(answerId, cardEl) {
    var S = CPHost.State;
    var esc = (typeof escHtml === 'function') ? escHtml : function (s) { return s; };
    try {
      await callWorker({ action: 'delete_answer', auth_token: S.AUTH_TOKEN, answer_id: answerId });
      cardEl.remove();
    } catch (e) {
      CPHost.Utils.showAlert('error', 'Erro ao remover resposta: ' + esc(e.message));
    }
  }

  function init() {
    var S = CPHost.State;
    var inputEl = document.getElementById('sqa-response');
    if (inputEl) {
      inputEl.addEventListener('input', function () {
        S._sqaDraft = this.value;
        scheduleSqaSave();
      });
    }

    var closeBtn = document.getElementById('sqa-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', async function () {
        if (!S.activeQId) return;
        if (S._sqaDebounce) { clearTimeout(S._sqaDebounce); S._sqaDebounce = null; }
        await commitSqaAnswer();
        this.disabled = true;
        this.textContent = 'Encerrando...';
        try {
          await callWorker({
            action: 'close_question', auth_token: S.AUTH_TOKEN,
            id: S.activeQId, session_code: S.sessionCode,
            show_results: true, reveal_answer: false,
          });
          S.activeQId = null;
          S.activeQType = null;
          S.activeStudentQuestionId = null;
          document.getElementById('active-q-panel').style.display = 'none';
        } catch (e) {
          CPHost.Utils.showAlert('error', 'Erro: ' + e.message);
        } finally {
          this.disabled = false;
          this.textContent = 'Encerrar pergunta';
        }
      });
    }
  }

  CPHost.SQA = {
    renderStudentQaActive: renderStudentQaActive,
    scheduleSqaSave: scheduleSqaSave,
    commitSqaAnswer: commitSqaAnswer,
    removeAnswer: removeAnswer,
    init: init,
  };
})();
