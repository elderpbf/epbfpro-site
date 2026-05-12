/* =========================================================
   Question Bank — shared module
   Used by classpulse/host.html and classpulse/index.html.

   Depends on globals defined by each host page:
     callWorker(params)  — Worker API fetch helper
     AUTH_TOKEN          — auth string from localStorage

   Usage:
     QuestionBank.init({ setSelect, questionList, generateBtn,
       improveBtn, errorEl, onSelect, getFormState,
       canDelete, canCreateSet });
   ========================================================= */

var QuestionBank = (function () {
  'use strict';

  var opts = null;

  // -------------------------------------------------------
  // Public API
  // -------------------------------------------------------

  function init(options) {
    opts = options;
    bindEvents();
  }

  function loadSets() {
    var sel = opts.setSelect;
    sel.innerHTML = '<option value="">Carregando...</option>';

    callWorker({ action: 'list_question_sets' })
      .then(function (data) {
        var sets = data.banks || [];
        sel.innerHTML = '<option value="">Escolha um conjunto...</option>';
        sets.forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s.list_name;
          opt.textContent = s.list_name + (s.count ? ' (' + s.count + ')' : '');
          sel.appendChild(opt);
        });
        if (opts.canCreateSet) {
          var newOpt = document.createElement('option');
          newOpt.value = '__new__';
          newOpt.textContent = 'Novo conjunto...';
          sel.appendChild(newOpt);
        }
      })
      .catch(function () {
        sel.innerHTML = '<option value="">Erro ao carregar</option>';
      });
  }

  function loadQuestions(name) {
    var listEl = opts.questionList;
    if (!name || name === '__new__') {
      listEl.innerHTML = '<div class="qb-msg">Selecione um conjunto acima.</div>';
      return;
    }

    listEl.innerHTML = '<div class="qb-msg">Carregando...</div>';

    callWorker({ action: 'get_questions', list_name: name })
      .then(function (data) {
        var qs = data.questions || [];
        listEl.innerHTML = '';

        if (!qs.length) {
          listEl.innerHTML = '<div class="qb-msg">Nenhuma questão neste conjunto.</div>';
          return;
        }

        qs.forEach(function (q) {
          var item = document.createElement('div');
          item.className = 'qb-item';

          var typeBadge = document.createElement('span');
          typeBadge.className = 'qb-type-badge';
          var typeLabels = { mc: 'ME', tf: 'FV', poll: 'ENQ', open: 'ABE', wordcloud: 'NUV', rating: 'AVA', numeric: 'NUM' };
          typeBadge.textContent = typeLabels[q.type] || (q.type || 'ME');
          item.appendChild(typeBadge);

          var textSpan = document.createElement('span');
          textSpan.style.flex = '1';
          var full = q.question || '';
          textSpan.textContent = full.length > 80 ? full.slice(0, 80) + '…' : full;
          textSpan.title = full;
          item.appendChild(textSpan);

          if (opts.onSelect) {
            var editBtn = document.createElement('button');
            editBtn.className = 'qb-edit-btn';
            editBtn.textContent = 'Editar';
            editBtn.title = 'Editar questão';
            editBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              opts.onSelect(q);
            });
            item.appendChild(editBtn);
          }

          if (opts.onLaunch) {
            var launchBtn = document.createElement('button');
            launchBtn.className = 'qb-launch-btn';
            launchBtn.textContent = 'Lançar';
            launchBtn.title = 'Lançar questão';
            launchBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              opts.onLaunch(q, launchBtn);
            });
            item.appendChild(launchBtn);
          }

          if (opts.canDelete) {
            var delBtn = document.createElement('button');
            delBtn.className = 'qb-del-btn';
            delBtn.textContent = '×';
            delBtn.title = 'Excluir questão';
            delBtn.addEventListener('click', function (e) {
              e.stopPropagation();
              deleteQuestion(name, q.question);
            });
            item.appendChild(delBtn);
          }

          listEl.appendChild(item);
        });
      })
      .catch(function (e) {
        listEl.innerHTML = '<div class="qb-msg" style="color:#ef4444">Erro: ' + escHtml(e.message) + '</div>';
      });
  }

  function generate() {
    var state = opts.getFormState();
    var topic = state.text;
    var errEl = opts.errorEl;
    errEl.textContent = '';

    if (!topic) {
      errEl.textContent = 'Escreva uma instrução ou tópico no campo de texto antes de gerar.';
      return;
    }

    var btn = opts.generateBtn;
    var origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Gerando...';

    var qType = state.type || 'mc';
    var maxSel = (state.max_select !== undefined && state.max_select !== null) ? parseInt(state.max_select) : 1;
    AIClient.generate({ prompt: topic, type: qType, max_select: maxSel })
      .then(function (result) {
        if (result) opts.onSelect(normalizeAiResult(result, qType, maxSel));
      })
      .catch(function (e) {
        errEl.textContent = 'Erro: ' + e.message;
      })
      .finally(function () {
        btn.disabled = false;
        btn.innerHTML = origHTML;
      });
  }

  function improve() {
    var state = opts.getFormState();
    var errEl = opts.errorEl;
    errEl.textContent = '';

    if (!state.text) {
      errEl.textContent = 'Escreva a pergunta antes de melhorar.';
      return;
    }

    var qType = state.type || 'mc';
    var btn = opts.improveBtn;
    var origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Melhorando...';

    var maxSel = (state.max_select !== undefined && state.max_select !== null) ? parseInt(state.max_select) : 1;
    AIClient.generate({ improve_from: state.text, type: qType, max_select: maxSel })
      .then(function (result) {
        if (result) opts.onSelect(normalizeAiResult(result, qType, maxSel));
      })
      .catch(function (e) {
        errEl.textContent = 'Erro: ' + e.message;
      })
      .finally(function () {
        btn.disabled = false;
        btn.innerHTML = origHTML;
      });
  }

  // -------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------

  function deleteQuestion(setName, questionText) {
    if (!confirm('Excluir esta questão?')) return;
    callWorker({ action: 'delete_question', auth_token: AUTH_TOKEN, list_name: setName, question: questionText })
      .then(function () {
        loadQuestions(opts.setSelect.value);
      })
      .catch(function (e) {
        opts.errorEl.textContent = 'Erro ao excluir: ' + e.message;
      });
  }

  function bindEvents() {
    if (opts.setSelect) {
      opts.setSelect.addEventListener('change', function () {
        loadQuestions(this.value);
      });
    }
    if (opts.generateBtn) opts.generateBtn.addEventListener('click', generate);
    if (opts.improveBtn)  opts.improveBtn.addEventListener('click', improve);
  }

  // Worker returns { ok, ai: { question, type, options: [...], correct: 0|[0,2]|null } }
  // Normalize to { question, type, options (JSON string), correct_answer, correct_answers, max_select }
  function normalizeAiResult(result, requestedType, maxSel) {
    var ai = result.ai || result;
    var optArr = ai.options || [];
    var maxSelect = (maxSel !== undefined && maxSel !== null) ? parseInt(maxSel) : 1;
    var isMulti = maxSelect !== 1;
    var correctAnswers = [];
    var correctAnswer = '';
    if (Array.isArray(ai.correct)) {
      correctAnswers = ai.correct.map(Number).filter(Number.isInteger);
      correctAnswer = JSON.stringify(correctAnswers);
    } else if (typeof ai.correct === 'number') {
      correctAnswers = [ai.correct];
      correctAnswer = isMulti ? JSON.stringify(correctAnswers) : String(ai.correct);
    }
    return {
      question: ai.question || '',
      type: requestedType || ai.type || 'mc',
      options: JSON.stringify(optArr),
      correct_answer: correctAnswer,
      correct_answers: correctAnswers,
      max_select: maxSelect
    };
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // -------------------------------------------------------
  // Expose
  // -------------------------------------------------------

  return {
    init: init,
    loadSets: loadSets,
    loadQuestions: loadQuestions,
    generate: generate,
    improve: improve
  };
})();
