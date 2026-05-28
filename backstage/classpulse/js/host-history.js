'use strict';

// CPHost.History -- closed-questions list. Renders the history card from
// the cpq-data stream and dispatches relaunch / edit clicks back into the
// Session / Composer modules. typeTag is a pure helper for the badge.

(function () {
  var CPHost = window.CPHost = window.CPHost || {};

  function typeTag(type) {
    var S = CPHost.State;
    var label = (S && S.TYPE_LABELS && S.TYPE_LABELS[type]) ? S.TYPE_LABELS[type] : type;
    return '<span class="hi-type-badge hi-type-' + (type || 'mc') + '">' + label + '</span>';
  }

  function renderHistory(closedQs) {
    if (!closedQs.length) {
      CPHost.$('history-card').style.display = 'none';
      return;
    }
    var S = CPHost.State;
    var esc = (typeof escHtml === 'function') ? escHtml : function (s) { return s; };
    var letters = (typeof LETTERS !== 'undefined') ? LETTERS : ['A', 'B', 'C', 'D', 'E', 'F'];
    var strip = (typeof stripOptPrefix === 'function') ? stripOptPrefix : function (s) { return s; };

    S._historyMap = {};
    var html = closedQs.map(function (q) {
      S._historyMap[q.id] = q;

      var resultsHtml = '';
      if (q.options && q.answer_counts && q.options.length > 0) {
        var hTotal = q.answer_counts.reduce(function (a, b) { return a + b; }, 0);
        var hDenom = (q.voter_count && q.voter_count > 0) ? q.voter_count : hTotal;
        var hCorrect = Array.isArray(q.correct_answers) ? q.correct_answers : [];
        resultsHtml = '<div class="hi-results">';
        q.options.forEach(function (opt, i) {
          var pct = hDenom > 0 ? Math.round(q.answer_counts[i] / hDenom * 100) : 0;
          var isCorrect = q.reveal_answer && hCorrect.indexOf(i) !== -1;
          resultsHtml += '<div class="hi-bar">' +
                           '<div class="hi-bar-label">' +
                             '<span class="hi-bar-badge ' + (isCorrect ? 'correct' : '') + '">' +
                               letters[i] + (isCorrect ? ' ✓' : '') +
                             '</span>' +
                             '<span class="hi-bar-text">' + esc(strip(opt)) + '</span>' +
                           '</div>' +
                           '<div class="hi-bar-pct">' + pct + '%</div>' +
                           '<div class="hi-bar-count">' + q.answer_counts[i] + '</div>' +
                         '</div>';
        });
        resultsHtml += '</div>';
      }

      return '<div class="history-item">' +
               '<div style="flex:1;min-width:0">' +
                 '<div class="hi-text">' + esc(q.text || '') + '</div>' +
                 typeTag(q.type || 'mc') +
                 '<div class="hi-meta">' + esc(q.created_at ? new Date(q.created_at).toLocaleString('pt-BR') : '') + '</div>' +
                 resultsHtml +
                 '<div class="hi-actions">' +
                   '<button class="hi-btn hi-btn-primary" data-action="relaunch" data-qid="' + esc(q.id) + '">Reabrir</button>' +
                   '<button class="hi-btn" data-action="edit" data-qid="' + esc(q.id) + '">Editar</button>' +
                 '</div>' +
               '</div>' +
             '</div>';
    }).join('');
    var historyListEl = CPHost.$('history-list');
    historyListEl.innerHTML = html;
    historyListEl.querySelectorAll('.hi-btn[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var q = S._historyMap[btn.dataset.qid];
        if (!q) return;
        if (btn.dataset.action === 'relaunch') relaunchFromHistory(btn, q);
        else if (btn.dataset.action === 'edit') editFromHistory(q);
      });
    });
    CPHost.$('history-card').style.display = 'block';
  }

  async function relaunchFromHistory(btn, q) {
    var S = CPHost.State;
    if (S.activeQId && !confirm('Já existe uma pergunta ativa. Encerrar a atual e lançar esta?')) return;

    var oldText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '...';

    try {
      var res = await callWorker({
        action: 'launch_question', auth_token: S.AUTH_TOKEN,
        session_code: S.sessionCode,
        type: q.type || 'mc',
        text: q.text,
        options: q.options,
        correct_answer: q.correct_answers && q.correct_answers.length
          ? (q.max_select !== 1 ? q.correct_answers : q.correct_answers[0])
          : null,
        max_select: q.max_select || 1,
      });
      S.activeQId = res.id;
      CPHost.Session.onQuestionLaunched();
      if (typeof showToast === 'function') showToast('Pergunta relançada!');
    } catch (e) {
      if (typeof showToastError === 'function') showToastError('Erro ao relançar: ' + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = oldText;
    }
  }

  function editFromHistory(q) {
    var Composer = CPHost.Composer;
    var Utils = CPHost.Utils;
    var S = CPHost.State;
    CPHost.$('q-text').value = Utils.stripHtml(q.text || '');
    var qType = q.type || 'mc';
    CPHost.$('q-type').value = qType;
    Composer.applyTypeUI(qType);
    CPQuestionTypes.get(qType).restoreForm(S.formEls, {
      options: q.options,
      correct_answers: q.correct_answers || [],
      correct_answer: q.correct_answers && q.correct_answers.length === 1 ? q.correct_answers[0] : null,
      max_select: q.max_select || 1,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    CPHost.$('q-text').focus();
  }

  CPHost.History = {
    typeTag: typeTag,
    renderHistory: renderHistory,
    relaunchFromHistory: relaunchFromHistory,
    editFromHistory: editFromHistory,
  };
})();
