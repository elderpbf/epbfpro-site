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

          var textSpan = document.createElement('span');
          var full = q.question || '';
          textSpan.textContent = full.length > 80 ? full.slice(0, 80) + '…' : full;
          textSpan.title = full;
          item.appendChild(textSpan);

          item.addEventListener('click', function (e) {
            if (e.target.tagName === 'BUTTON') return;
            opts.onSelect(q);
          });

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

    callWorker({ action: 'ai_question', auth_token: AUTH_TOKEN, prompt: topic })
      .then(function (result) {
        opts.onSelect(normalizeAiResult(result));
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

    var options = state.options || [];
    if (!state.text || options.length < 4 || options.some(function (o) { return !o; })) {
      errEl.textContent = 'Preencha a pergunta e todas as 4 opções antes de melhorar.';
      return;
    }

    var btn = opts.improveBtn;
    var origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Melhorando...';

    callWorker({
      action: 'ai_question',
      auth_token: AUTH_TOKEN,
      improve_from: state.text
    })
      .then(function (result) {
        opts.onSelect(normalizeAiResult(result));
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
    opts.setSelect.addEventListener('change', function () {
      loadQuestions(this.value);
    });
    opts.generateBtn.addEventListener('click', generate);
    opts.improveBtn.addEventListener('click', improve);
  }

  // Worker returns { ok, ai: { question, type, options: [...], correct: 0 } }
  // Normalize to { question, type, options (JSON string), correct_answer } for onSelect callbacks
  function normalizeAiResult(result) {
    var ai = result.ai || result;
    var optArr = ai.options || [];
    return {
      question: ai.question || '',
      type: ai.type || 'mc',
      options: JSON.stringify(optArr),
      correct_answer: typeof ai.correct === 'number' ? String(ai.correct) : (ai.correct || '')
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
