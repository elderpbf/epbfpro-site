(function() {
  'use strict';

  function showRow(el, show) { el.style.display = show ? '' : 'none'; }

  var R = {};

  R.mc = {
    label: 'Múltipla Escolha',
    optionsPanel: 'mc',
    canReveal: true,
    canShowResults: true,
    aiGenSupported: true,
    canMultiSelect: true,
    usesTextAnswers: false,
    setupForm: function(els) {
      els.mcRows.forEach(function(row) { row.style.display = ''; });
      var maxSel = els.mcMaxSelect ? parseInt(els.mcMaxSelect.value) : 1;
      var isMulti = Number.isInteger(maxSel) && maxSel !== 1;
      els.mcRadios.forEach(function(el) {
        el.style.display = '';
        var inp = el.querySelector('input[type="radio"],input[type="checkbox"]');
        if (inp) inp.type = isMulti ? 'checkbox' : 'radio';
      });
    },
    readForm: function(els) {
      var opts = [els.optA.value.trim(), els.optB.value.trim(), els.optC.value.trim(), els.optD.value.trim()].filter(Boolean);
      if (opts.length < 2) return { error: 'Informe pelo menos 2 opções.' };
      var maxSel = els.mcMaxSelect ? parseInt(els.mcMaxSelect.value) : 1;
      if (!Number.isInteger(maxSel) || maxSel < 0) return { error: 'Seleções por aluno inválido.' };
      if (maxSel > opts.length) return { error: 'Seleções por aluno maior que o número de opções.' };
      var isMulti = maxSel !== 1;
      var ca;
      if (isMulti) {
        var checked = Array.prototype.slice.call(document.querySelectorAll('input[name="correct"]:checked'));
        ca = checked.map(function(el) { return ['a','b','c','d'].indexOf(el.value); }).filter(function(i) { return i !== -1 && i < opts.length; });
        if (ca.length === 0) ca = [];
      } else {
        var caEl = document.querySelector('input[name="correct"]:checked');
        ca = caEl ? ['a','b','c','d'].indexOf(caEl.value) : null;
        if (ca !== null && ca >= opts.length) ca = null;
      }
      return { options: opts, correct_answer: ca, max_select: maxSel };
    },
    restoreForm: function(els, q) {
      var opts = q.options || [];
      ['optA','optB','optC','optD'].forEach(function(k, i) { els[k].value = opts[i] || ''; });
      var maxSel = (q.max_select !== undefined && q.max_select !== null) ? parseInt(q.max_select) : 1;
      if (els.mcMaxSelect) els.mcMaxSelect.value = maxSel;
      R.mc.setupForm(els);
      els.correctRadios.forEach(function(r) { r.checked = false; });
      var correctAnswers = Array.isArray(q.correct_answers) ? q.correct_answers
        : (q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer !== '' ? [parseInt(q.correct_answer)] : []);
      correctAnswers.forEach(function(idx) {
        if (idx >= 0 && idx < 4) {
          var inp = document.querySelector('input[name="correct"][value="' + ['a','b','c','d'][idx] + '"]');
          if (inp) inp.checked = true;
        }
      });
    },
    clearForm: function(els) {
      ['optA','optB','optC','optD'].forEach(function(k) { els[k].value = ''; });
      els.correctRadios.forEach(function(r) { r.checked = false; });
      if (els.mcMaxSelect) els.mcMaxSelect.value = 1;
    }
  };

  R.tf = {
    label: 'Verdadeiro / Falso',
    optionsPanel: 'mc',
    canReveal: true,
    canShowResults: true,
    aiGenSupported: true,
    usesTextAnswers: false,
    setupForm: function(els) {
      els.optA.value = 'Verdadeiro';
      els.optB.value = 'Falso';
      els.optC.value = '';
      els.optD.value = '';
      els.mcRows.forEach(function(row, i) { showRow(row, i < 2); });
      els.mcRadios.forEach(function(el, i) { showRow(el, i < 2); });
    },
    readForm: function(els) {
      var caEl = document.querySelector('input[name="correct"]:checked');
      var ca = null;
      if (caEl) {
        var idx = ['a','b','c','d'].indexOf(caEl.value);
        ca = (idx === 0 || idx === 1) ? idx : null;
      }
      return { options: ['Verdadeiro', 'Falso'], correct_answer: ca };
    },
    restoreForm: function(els, q) {
      els.correctRadios.forEach(function(r) { r.checked = false; });
      var ca = q.correct_answer;
      if (ca !== null && ca !== undefined && ca !== '') {
        var idx = parseInt(ca, 10);
        if (idx === 0 || idx === 1) {
          var radio = document.querySelector('input[name="correct"][value="' + ['a','b'][idx] + '"]');
          if (radio) radio.checked = true;
        }
      }
    },
    clearForm: function(els) {
      els.correctRadios.forEach(function(r) { r.checked = false; });
    }
  };

  R.poll = {
    label: 'Enquete',
    optionsPanel: 'poll',
    canReveal: false,
    canShowResults: true,
    aiGenSupported: true,
    canMultiSelect: true,
    usesTextAnswers: false,
    setupForm: function(els) {
      if (els.pollRows.children.length === 0) els.initPollRows(2);
    },
    readForm: function(els) {
      var inputs = els.pollRows.querySelectorAll('.host-input');
      var opts = Array.prototype.map.call(inputs, function(i) { return i.value.trim(); }).filter(Boolean);
      if (opts.length < 2) return { error: 'Informe pelo menos 2 opções.' };
      var maxSel = els.pollMaxSelect ? parseInt(els.pollMaxSelect.value) : 1;
      if (!Number.isInteger(maxSel) || maxSel < 0) return { error: 'Seleções por aluno inválido.' };
      if (maxSel > opts.length) return { error: 'Seleções por aluno maior que o número de opções.' };
      return { options: opts, correct_answer: null, max_select: maxSel };
    },
    restoreForm: function(els, q) {
      var opts = q.options || [];
      els.initPollRows(opts.length || 2);
      var inputs = els.pollRows.querySelectorAll('.host-input');
      Array.prototype.forEach.call(inputs, function(inp, i) { inp.value = opts[i] || ''; });
      var maxSel = (q.max_select !== undefined && q.max_select !== null) ? parseInt(q.max_select) : 1;
      if (els.pollMaxSelect) els.pollMaxSelect.value = maxSel;
    },
    clearForm: function(els) {
      els.pollRows.innerHTML = '';
      if (els.pollMaxSelect) els.pollMaxSelect.value = 1;
    }
  };

  R.open = {
    label: 'Texto Aberto',
    optionsPanel: null,
    canReveal: false,
    canShowResults: false,
    aiGenSupported: true,
    usesTextAnswers: true,
    setupForm: function() {},
    readForm: function() { return { options: [], correct_answer: null }; },
    restoreForm: function() {},
    clearForm: function() {}
  };

  R.wordcloud = {
    label: 'Nuvem de Palavras',
    optionsPanel: null,
    canReveal: false,
    canShowResults: false,
    aiGenSupported: true,
    usesTextAnswers: true,
    setupForm: function() {},
    readForm: function() { return { options: [], correct_answer: null }; },
    restoreForm: function() {},
    clearForm: function() {}
  };

  R.rating = {
    label: 'Avaliação',
    optionsPanel: 'rating',
    canReveal: false,
    canShowResults: true,
    aiGenSupported: true,
    usesTextAnswers: true,
    setupForm: function(els) {
      if (!els.ratingMin.value) els.ratingMin.value = 1;
      if (!els.ratingMax.value) els.ratingMax.value = 5;
    },
    readForm: function(els) {
      var min = parseInt(els.ratingMin.value, 10);
      var max = parseInt(els.ratingMax.value, 10);
      if (!Number.isInteger(min) || !Number.isInteger(max) || min >= max || (max - min) > 10) {
        return { error: 'Avaliação requer min < max e até 11 valores no intervalo.' };
      }
      return { options: { min: min, max: max }, correct_answer: null };
    },
    restoreForm: function(els, q) {
      var qOpts = q.options || {};
      els.ratingMin.value = qOpts.min !== undefined ? qOpts.min : 1;
      els.ratingMax.value = qOpts.max !== undefined ? qOpts.max : 5;
    },
    clearForm: function(els) {
      els.ratingMin.value = 1;
      els.ratingMax.value = 5;
    }
  };

  R.numeric = {
    label: 'Numérico',
    optionsPanel: 'numeric',
    canReveal: false,
    canShowResults: true,
    aiGenSupported: true,
    usesTextAnswers: true,
    setupForm: function() {},
    readForm: function(els) {
      var minStr = (els.numericMin.value || '').trim();
      var maxStr = (els.numericMax.value || '').trim();
      var options = {};
      if (minStr !== '') {
        var min = parseFloat(minStr);
        if (!Number.isFinite(min)) return { error: 'Mínimo numérico inválido.' };
        options.min = min;
      }
      if (maxStr !== '') {
        var max = parseFloat(maxStr);
        if (!Number.isFinite(max)) return { error: 'Máximo numérico inválido.' };
        options.max = max;
      }
      if (options.min !== undefined && options.max !== undefined && options.min >= options.max) {
        return { error: 'Mínimo deve ser menor que o máximo.' };
      }
      return { options: options, correct_answer: null };
    },
    restoreForm: function(els, q) {
      var qOpts = (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) ? q.options : {};
      els.numericMin.value = qOpts.min !== undefined ? qOpts.min : '';
      els.numericMax.value = qOpts.max !== undefined ? qOpts.max : '';
    },
    clearForm: function(els) {
      els.numericMin.value = '';
      els.numericMax.value = '';
    }
  };

  var ALL_PANELS = ['mc', 'poll', 'rating', 'numeric'];

  function applyVisibility(els, T) {
    ALL_PANELS.forEach(function(name) {
      var panel = els[name + 'Panel'];
      if (panel) showRow(panel, T.optionsPanel === name);
    });
    if (typeof T.setupForm === 'function') T.setupForm(els);
  }

  window.CPQuestionTypes = {
    mc: R.mc, tf: R.tf, poll: R.poll, open: R.open, wordcloud: R.wordcloud, rating: R.rating, numeric: R.numeric,
    list: function() { return ['mc','tf','poll','open','wordcloud','rating','numeric']; },
    get:  function(t) { return R[t] || R.mc; },
    applyVisibility: applyVisibility
  };
})();
