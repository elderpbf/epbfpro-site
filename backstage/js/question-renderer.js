'use strict';

// ============================================================
// ClassPulse Question Renderer
// Shared rendering module for all question types across pages.
// Usage: QR.renderInput(q, container, opts)
//        QR.renderResults(q, counts, container, opts)
// opts.mode: 'display' | 'student' | 'host'
// ============================================================

window.QR = {};

// ── TYPE REGISTRY ────────────────────────────────────────────
QR.TYPES = {
  mc:        { label: 'Multipla Escolha',  defaults: { optionCount: 4 } },
  tf:        { label: 'Verdadeiro/Falso',  defaults: { labelTrue: 'Verdadeiro', labelFalse: 'Falso' } },
  poll:      { label: 'Enquete',           defaults: { maxOptions: 6 } },
  open:      { label: 'Texto Aberto',      defaults: { maxChars: 500 } },
  wordcloud: { label: 'Nuvem de Palavras', defaults: { maxWords: 3 } },
  rating:    { label: 'Avaliacao',         defaults: { min: 1, max: 5 } },
  numeric:   { label: 'Numerico',          defaults: { min: 0, max: 100 } }
};

QR.getTypeLabel = function(typeCode) {
  var entry = QR.TYPES[typeCode];
  return entry ? entry.label : typeCode;
};

QR.getTypeConfig = function(type) {
  var entry = QR.TYPES[type];
  if (!entry) return {};
  var cfg = {};
  for (var key in entry.defaults) {
    var stored = localStorage.getItem('cp_cfg_' + type + '_' + key);
    cfg[key] = stored !== null ? stored : entry.defaults[key];
  }
  return cfg;
};

// ── INTERNAL: Bar chart ───────────────────────────────────────
// Renders option bars into container. Used by renderResults for mc/tf/poll.
// opts: { mode, showResults, revealAnswer, correctAnswers, myAnswerIndices, voterCount }
QR._renderBarChart = function(options, counts, container, opts) {
  var showResults    = opts.showResults !== false;
  var revealAnswer   = opts.revealAnswer === true;
  var correctAnswers = Array.isArray(opts.correctAnswers) ? opts.correctAnswers
                     : (opts.correctAnswer !== undefined && opts.correctAnswer !== null ? [opts.correctAnswer] : []);
  var myAnswerIndices = Array.isArray(opts.myAnswerIndices) ? opts.myAnswerIndices
                      : (opts.myAnswerIndex !== undefined && opts.myAnswerIndex !== null ? [opts.myAnswerIndex] : []);
  var voterCount = (opts.voterCount !== undefined && opts.voterCount > 0) ? opts.voterCount : null;

  var total = (counts || []).reduce(function(a, b) { return a + b; }, 0);
  var denominator = voterCount !== null ? voterCount : total;
  var html  = '';

  (options || []).forEach(function(opt, i) {
    var count     = (counts && counts[i] !== undefined) ? counts[i] : 0;
    var pct       = showResults && denominator > 0 ? Math.round(count / denominator * 100) : 0;
    var isCorrect = revealAnswer && correctAnswers.indexOf(i) !== -1;
    var isMine    = myAnswerIndices.indexOf(i) !== -1;
    var fillClass = isCorrect ? 'correct' : (isMine ? 'mine' : '');

    html +=
      '<div class="qr-bar ' + (isCorrect ? 'is-correct' : '') + '">' +
        '<div class="qr-bar-letter">' + escHtml(LETTERS[i] || String(i + 1)) + '</div>' +
        '<div class="qr-bar-body">' +
          '<div class="qr-bar-label">' +
            '<span class="qr-bar-text">' + escHtml(stripOptPrefix(opt)) + '</span>' +
            '<span class="qr-bar-pct">' + (showResults ? pct + '%' : '') + '</span>' +
          '</div>' +
          '<div class="qr-bar-track">' +
            '<div class="qr-bar-fill ' + fillClass + '" style="width:' + (showResults ? pct : 0) + '%"></div>' +
          '</div>' +
        '</div>' +
        '<div class="qr-bar-count">' + (showResults ? count : '') + '</div>' +
      '</div>';
  });

  container.innerHTML = html;
};

// ── INTERNAL: Word cloud ──────────────────────────────────────
// Renders a frequency word cloud from an array of text answer strings.
QR._renderWordCloud = function(question, container) {
  var textAnswers = question.text_answers || [];
  var freq = {};
  textAnswers.forEach(function(ans) {
    var val = typeof ans === 'string' ? ans : (ans && ans.value ? String(ans.value) : '');
    val = val.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    val.toLowerCase().trim().split(/\s+/).filter(Boolean).forEach(function(w) {
      freq[w] = (freq[w] || 0) + 1;
    });
  });
  var words = Object.keys(freq);
  if (!words.length) {
    container.innerHTML = '<p style="text-align:center;opacity:.5;font-size:0.9em">Aguardando respostas\u2026</p>';
    return;
  }
  var max = Math.max.apply(null, words.map(function(w) { return freq[w]; }));
  words.sort(function(a, b) { return freq[b] - freq[a]; });
  words = words.slice(0, 30);
  
  var colors = ['#14b8a6','#6366f1','#3b82f6','#7c3aed','#c026d3','#16a34a','#0284c7'];

  var html = '<div class="qr-wordcloud">';
  words.forEach(function(w, i) {
    var sz = (0.9 + (freq[w] / max) * 2.1).toFixed(2);
    var color = colors[i % colors.length];
    html += '<span class="qr-word" style="font-size:' + sz + 'em; color:' + color + '">' + escHtml(w) + '</span>';
  });
  html += '</div>';
  container.innerHTML = html;
};

// ── INTERNAL: Text Feed ───────────────────────────────────────
QR._renderTextFeed = function(question, container, opts) {
  var textAnswers = question.text_answers || [];
  if (!textAnswers.length) {
    container.innerHTML = '<div class="qr-feed-empty">Aguardando respostas...</div>';
    return;
  }
  var html = '<div class="qr-text-feed">';
  textAnswers.forEach(function(ans) {
    html += '<div class="qr-feed-card">';
    html += '<div class="qr-feed-name">' + escHtml(ans.name || 'Anonimo') + '</div>';
    html += '<div class="qr-feed-text">' + escHtml(ans.value || '') + '</div>';
    if (typeof opts.onRemoveAnswer === 'function') {
      html += '<button class="qr-feed-remove" data-id="' + escHtml(ans.id) + '">\u00D7</button>';
    }
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;
  
  if (typeof opts.onRemoveAnswer === 'function') {
    container.querySelectorAll('.qr-feed-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        opts.onRemoveAnswer(btn.dataset.id, btn.closest('.qr-feed-card'));
      });
    });
  }
};

// ── INTERNAL: Rating Results ──────────────────────────────────
QR._renderRatingResults = function(question, container, opts) {
  var qOpts = question.options || {};
  var min = qOpts.min !== undefined ? qOpts.min : 1;
  var max = qOpts.max !== undefined ? qOpts.max : 5;
  var textAnswers = question.text_answers || [];
  var countsObj = {};
  for (var i = min; i <= max; i++) countsObj[i] = 0;

  var sum = 0, total = 0;
  textAnswers.forEach(function(ans) {
    var val = parseInt(ans.value, 10);
    if (!isNaN(val) && val >= min && val <= max) { countsObj[val]++; sum += val; total++; }
  });

  if (opts.showResults === false) {
    var html = '<div class="qr-rating-summary">';
    html += '<div class="qr-rating-total">' + total + ' resposta' + (total !== 1 ? 's' : '') + '</div>';
    html += '</div>';
    container.innerHTML = html;
    return;
  }

  var avg = total > 0 ? (sum / total).toFixed(1) : '0.0';

  var labels = [], countsArr = [];
  for (var k = min; k <= max; k++) {
    labels.push(String(k));
    countsArr.push(countsObj[k]);
  }

  var html = '<div class="qr-rating-summary">';
  html += '<div class="qr-rating-avg">' + avg + '</div>';
  html += '<div class="qr-rating-total">' + total + ' resposta' + (total !== 1 ? 's' : '') + '</div>';
  html += '</div><div class="qr-rating-bars"></div>';
  container.innerHTML = html;
  
  var subOpts = { showResults: true };
  for (var p in opts) if (opts.hasOwnProperty(p)) subOpts[p] = opts[p];
  QR._renderBarChart(labels, countsArr, container.querySelector('.qr-rating-bars'), subOpts);
};

// ── INTERNAL: Numeric Results ─────────────────────────────────
QR._renderNumericResults = function(question, container, opts) {
  if (opts.showResults === false) {
    var total = (question.text_answers || []).length;
    var html = '<div class="qr-numeric-summary">';
    html += '<div>Total: <strong>' + total + '</strong></div>';
    html += '</div>';
    container.innerHTML = html;
    return;
  }
  var textAnswers = question.text_answers || [];
  var vals = [];
  textAnswers.forEach(function(ans) {
    var val = parseFloat(ans.value);
    if (!isNaN(val)) vals.push(val);
  });
  var total = vals.length;
  if (!total) {
    container.innerHTML = '<div class="qr-feed-empty">Aguardando respostas...</div>';
    return;
  }
  
  var sum = vals.reduce(function(a, b) { return a + b; }, 0);
  var avg = (sum / total).toFixed(1);
  var dataMin = Math.min.apply(null, vals);
  var dataMax = Math.max.apply(null, vals);
  
  var html = '<div class="qr-numeric-summary">';
  html += '<div>Media: <strong>' + avg + '</strong></div>';
  html += '<div>Min: <strong>' + dataMin + '</strong> | Max: <strong>' + dataMax + '</strong></div>';
  html += '<div>Total: <strong>' + total + '</strong></div>';
  html += '</div><div class="qr-numeric-bars"></div>';
  container.innerHTML = html;
  
  var labels = [], countsArr = [];
  if (dataMin === dataMax) {
    labels.push(String(dataMin));
    countsArr.push(total);
  } else {
    var buckets = 5, range = dataMax - dataMin, step = range / buckets;
    if (step === 0) step = 1;
    var bucketCounts = [0, 0, 0, 0, 0];
    vals.forEach(function(val) {
      var b = Math.floor((val - dataMin) / step);
      if (b >= buckets) b = buckets - 1;
      bucketCounts[b]++;
    });
    for (var j = 0; j < buckets; j++) {
      var rMin = dataMin + j * step, rMax = rMin + step;
      labels.push(rMin.toFixed(1) + ' - ' + rMax.toFixed(1));
      countsArr.push(bucketCounts[j]);
    }
  }
  var subOpts = { showResults: true };
  for (var prop in opts) if (opts.hasOwnProperty(prop)) subOpts[prop] = opts[prop];
  QR._renderBarChart(labels, countsArr, container.querySelector('.qr-numeric-bars'), subOpts);
};

// ── INTERNAL: Button grid ─────────────────────────────────────
// Renders clickable option buttons into container. Used by renderInput for mc/tf/poll.
// opts: { onSelect(index, btn), multi, maxSelect, onSubmitIndices(indices) }
QR._renderButtonGrid = function(options, container, opts) {
  var isMulti   = opts.multi === true;
  var maxSelect = (opts.maxSelect !== undefined) ? parseInt(opts.maxSelect) : 1;
  var onSelect  = opts.onSelect || function() {};

  var html = '';
  (options || []).forEach(function(opt, i) {
    html +=
      '<button class="qr-option-btn" data-index="' + i + '">' +
        '<span class="qr-option-letter">' + escHtml(LETTERS[i] || String(i + 1)) + '</span>' +
        '<span>' + escHtml(stripOptPrefix(opt)) + '</span>' +
      '</button>';
  });

  if (isMulti) {
    var limitLabel = maxSelect === 0
      ? 'Selecione todas que se aplicam'
      : 'Selecione até ' + maxSelect + ' opç' + (maxSelect === 1 ? 'ão' : 'ões');
    html += '<p class="qr-multi-hint">' + limitLabel + '</p>';
    html += '<button class="qr-submit-btn" disabled>Enviar</button>';
  }

  container.innerHTML = html;

  if (!isMulti) {
    container.querySelectorAll('.qr-option-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        onSelect(parseInt(btn.dataset.index), btn);
      });
    });
    return;
  }

  // Multi-select logic
  var selected = new Set();
  var submitBtn = container.querySelector('.qr-submit-btn');

  container.querySelectorAll('.qr-option-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(btn.dataset.index);
      if (selected.has(idx)) {
        selected.delete(idx);
        btn.classList.remove('is-selected');
      } else {
        var atMax = maxSelect !== 0 && selected.size >= maxSelect;
        if (atMax) return; // blocked -- hint text already explains limit
        selected.add(idx);
        btn.classList.add('is-selected');
      }
      submitBtn.disabled = selected.size === 0;
    });
  });

  submitBtn.addEventListener('click', function() {
    if (selected.size === 0) return;
    if (typeof opts.onSubmitIndices === 'function') opts.onSubmitIndices(Array.from(selected));
  });
};

// ── INTERNAL: Open Input ──────────────────────────────────────
QR._renderOpenInput = function(question, container, opts) {
  opts = opts || {};
  var cfg = QR.getTypeConfig('open');
  var maxChars = cfg.maxChars || 500;
  var html = '<div class="qr-open-form">';
  html += '<textarea class="qr-open-textarea" maxlength="' + maxChars + '" placeholder="Sua resposta..."></textarea>';
  html += '<div style="display:flex; justify-content:space-between; align-items:center;">';
  html += '<span class="qr-char-counter">0 / ' + maxChars + '</span>';
  html += '<button class="qr-submit-btn">Enviar</button></div></div>';
  container.innerHTML = html;
  
  var ta = container.querySelector('.qr-open-textarea');
  var counter = container.querySelector('.qr-char-counter');
  var btn = container.querySelector('.qr-submit-btn');
  
  ta.addEventListener('input', function() { counter.textContent = ta.value.length + ' / ' + maxChars; });
  btn.addEventListener('click', function() {
    if (ta.value.trim() && typeof opts.onSubmit === 'function') opts.onSubmit(ta.value.trim());
  });
};

// ── INTERNAL: Wordcloud Input ─────────────────────────────────
QR._renderWordcloudInput = function(question, container, opts) {
  opts = opts || {};
  var cfg = QR.getTypeConfig('wordcloud');
  var maxWords = cfg.maxWords || 3;
  var html = '<div class="qr-wc-form">';
  html += '<input type="text" class="qr-wc-input" maxlength="50" placeholder="Suas palavras (separadas por espaco)">';
  html += '<div style="display:flex; justify-content:space-between; align-items:center;">';
  html += '<span class="qr-wc-hint">Max ' + maxWords + ' palavras</span>';
  html += '<button class="qr-submit-btn">Enviar</button></div></div>';
  container.innerHTML = html;
  
  var input = container.querySelector('.qr-wc-input');
  var btn = container.querySelector('.qr-submit-btn');
  
  input.addEventListener('input', function() {
    var words = input.value.trim().split(/\s+/).filter(Boolean);
    if (words.length > maxWords) input.value = words.slice(0, maxWords).join(' ') + ' ';
  });
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') btn.click(); });
  btn.addEventListener('click', function() {
    if (input.value.trim() && typeof opts.onSubmit === 'function') opts.onSubmit(input.value.trim());
  });
};

// ── INTERNAL: Rating Input ────────────────────────────────────
QR._renderRatingInput = function(question, container, opts) {
  opts = opts || {};
  var qOpts = question.options || {};
  var min = qOpts.min !== undefined ? qOpts.min : 1;
  var max = qOpts.max !== undefined ? qOpts.max : 5;
  var html = '<div class="qr-rating-row">';
  for (var i = min; i <= max; i++) html += '<button class="qr-rating-btn" data-val="' + i + '">' + i + '</button>';
  html += '</div>';
  container.innerHTML = html;
  container.querySelectorAll('.qr-rating-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (typeof opts.onSubmit === 'function') opts.onSubmit(btn.dataset.val);
    });
  });
};

// ── INTERNAL: Numeric Input ───────────────────────────────────
QR._renderNumericInput = function(question, container, opts) {
  opts = opts || {};
  var qOpts = question.options || {};
  var minAttr = qOpts.min !== undefined ? ' min="' + qOpts.min + '"' : '';
  var maxAttr = qOpts.max !== undefined ? ' max="' + qOpts.max + '"' : '';
  var html = '<div class="qr-numeric-form">';
  html += '<input type="number" class="qr-numeric-input"' + minAttr + maxAttr + ' placeholder="Digite um numero">';
  html += '<button class="qr-submit-btn" style="margin-left: 10px;">Enviar</button></div>';
  container.innerHTML = html;
  var input = container.querySelector('.qr-numeric-input');
  var btn = container.querySelector('.qr-submit-btn');
  input.addEventListener('keydown', function(e) { if (e.key === 'Enter') btn.click(); });
  btn.addEventListener('click', function() {
    if (input.value.trim() !== '' && typeof opts.onSubmit === 'function') opts.onSubmit(input.value.trim());
  });
};

// ── PUBLIC: renderInput ───────────────────────────────────────
// Renders student-facing input UI for the given question type.
// opts: { mode, onSelect(index, btn), onSubmitIndices(indices) }
QR.renderInput = function(question, container, opts) {
  opts = opts || {};
  var type = question.type || 'mc';
  var maxSel = (question.max_select !== undefined) ? parseInt(question.max_select) : 1;

  switch (type) {
    case 'mc':
    case 'poll': {
      var isMulti = maxSel !== 1;
      var gridOpts = Object.assign({}, opts, { multi: isMulti, maxSelect: maxSel });
      QR._renderButtonGrid(question.options || [], container, gridOpts);
      break;
    }
    case 'tf':
      QR._renderButtonGrid(question.options || [], container, opts);
      break;
    case 'open':
      QR._renderOpenInput(question, container, opts);
      break;
    case 'wordcloud':
      QR._renderWordcloudInput(question, container, opts);
      break;
    case 'rating':
      QR._renderRatingInput(question, container, opts);
      break;
    case 'numeric':
      QR._renderNumericInput(question, container, opts);
      break;
    default:
      container.innerHTML = '';
  }
};

// ── PUBLIC: renderDisplay ─────────────────────────────────────
// Renders question text + results into container for display/embed contexts.
// Mirrors the pattern in go/display.html: text heading above QR results.
// opts: same as renderResults
QR.renderDisplay = function(question, counts, container, opts) {
  var resultsEl = document.createElement('div');
  resultsEl.className = 'qr-display';
  var html = '';
  if (question.text) {
    html += '<div class="question-text-display">' + escHtml(question.text) + '</div>';
  }
  container.innerHTML = html;
  container.appendChild(resultsEl);
  QR.renderResults(question, counts, resultsEl, opts);
};

// ── PUBLIC: renderResults ─────────────────────────────────────
// Renders results display for the given question type.
// opts: { mode, showResults, revealAnswer, correctAnswers, myAnswerIndices, voterCount }
QR.renderResults = function(question, counts, container, opts) {
  opts = opts || {};
  var type = question.type || 'mc';
  var showResults = opts.showResults !== false;

  // Merge question-level correct_answers and voter_count into opts if not already set
  var mergedOpts = Object.assign({}, opts);
  if (!mergedOpts.correctAnswers && question.correct_answers) mergedOpts.correctAnswers = question.correct_answers;
  if (mergedOpts.voterCount === undefined && question.voter_count !== undefined) mergedOpts.voterCount = question.voter_count;

  switch (type) {
    case 'mc':
    case 'tf':
    case 'poll':
      QR._renderBarChart(question.options || [], counts, container, mergedOpts);
      break;
    case 'wordcloud':
      if (!showResults) {
        var total = (question.text_answers || []).length;
        container.innerHTML = '<div class="qr-feed-empty">' + total + ' resposta' + (total !== 1 ? 's' : '') + ' (resultados ocultos)</div>';
        return;
      }
      QR._renderWordCloud(question, container);
      break;
    case 'open':
      if (!showResults) {
        var total = (question.text_answers || []).length;
        container.innerHTML = '<div class="qr-feed-empty">' + total + ' resposta' + (total !== 1 ? 's' : '') + ' (resultados ocultos)</div>';
        return;
      }
      QR._renderTextFeed(question, container, opts);
      break;
    case 'rating':
      QR._renderRatingResults(question, container, opts);
      break;
    case 'numeric':
      QR._renderNumericResults(question, container, opts);
      break;
    case 'student_qa':
      // student_qa questions are rendered by host/student/display pages directly (not via QR).
      container.innerHTML = '';
      break;
    default:
      if (typeof showToastError === 'function') {
        showToastError('Tipo de questao nao suportado: ' + type);
      }
      container.innerHTML = '';
  }
};
