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
// opts: { mode, showResults, revealAnswer, correctAnswer, myAnswerIndex }
QR._renderBarChart = function(options, counts, container, opts) {
  var mode          = opts.mode || 'student';
  var showResults   = opts.showResults !== false;
  var revealAnswer  = opts.revealAnswer === true;
  var correctAnswer = opts.correctAnswer !== undefined ? opts.correctAnswer : null;
  var myAnswerIndex = opts.myAnswerIndex !== undefined ? opts.myAnswerIndex : null;

  var total = (counts || []).reduce(function(a, b) { return a + b; }, 0);
  var html  = '';

  (options || []).forEach(function(opt, i) {
    var count     = (counts && counts[i] !== undefined) ? counts[i] : 0;
    var pct       = showResults && total > 0 ? Math.round(count / total * 100) : 0;
    var isCorrect = revealAnswer && correctAnswer !== null && i === correctAnswer;
    var isMine    = myAnswerIndex !== null && i === myAnswerIndex;
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
QR._renderWordCloud = function(textAnswers, container) {
  var freq = {};
  (textAnswers || []).forEach(function(ans) {
    (ans || '').toLowerCase().trim().split(/\s+/).filter(Boolean).forEach(function(w) {
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
  var html = '<div class="qr-wordcloud">';
  words.forEach(function(w) {
    var sz = (0.9 + (freq[w] / max) * 2.1).toFixed(2);
    html += '<span class="qr-word" style="font-size:' + sz + 'em">' + escHtml(w) + '</span>';
  });
  html += '</div>';
  container.innerHTML = html;
};

// ── INTERNAL: Button grid ─────────────────────────────────────
// Renders clickable option buttons into container. Used by renderInput for mc/tf/poll.
// opts: { onSelect(index, btn) }
QR._renderButtonGrid = function(options, container, opts) {
  var onSelect = opts.onSelect || function() {};
  var html = '';

  (options || []).forEach(function(opt, i) {
    html +=
      '<button class="qr-option-btn" data-index="' + i + '">' +
        '<span class="qr-option-letter">' + escHtml(LETTERS[i] || String(i + 1)) + '</span>' +
        '<span>' + escHtml(stripOptPrefix(opt)) + '</span>' +
      '</button>';
  });

  container.innerHTML = html;

  container.querySelectorAll('.qr-option-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      onSelect(parseInt(btn.dataset.index), btn);
    });
  });
};

// ── PUBLIC: renderInput ───────────────────────────────────────
// Renders student-facing input UI for the given question type.
// opts: { mode, onSelect(index, btn) }
QR.renderInput = function(question, container, opts) {
  opts = opts || {};
  var type = question.type || 'mc';

  switch (type) {
    case 'mc':
    case 'tf':
    case 'poll':
      QR._renderButtonGrid(question.options || [], container, opts);
      break;
    case 'open':
    case 'wordcloud':
    case 'rating':
    case 'numeric':
      // Handled by the page-level renderer; QR.renderInput is a no-op for these types.
      container.innerHTML = '';
      break;
    default:
      container.innerHTML = '';
  }
};

// ── PUBLIC: renderResults ─────────────────────────────────────
// Renders results display for the given question type.
// opts: { mode, showResults, revealAnswer, correctAnswer, myAnswerIndex }
QR.renderResults = function(question, counts, container, opts) {
  opts = opts || {};
  var type = question.type || 'mc';

  switch (type) {
    case 'mc':
    case 'tf':
    case 'poll':
      QR._renderBarChart(question.options || [], counts, container, opts);
      break;
    case 'wordcloud':
      QR._renderWordCloud(question.text_answers || [], container);
      break;
    default:
      if (typeof showToastError === 'function') {
        showToastError('Tipo de questao nao suportado: ' + type);
      }
      container.innerHTML = '';
  }
};
