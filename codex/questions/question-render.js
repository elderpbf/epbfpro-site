// questions/question-render.js
// Codex-owned, faithful port of the legacy ClassPulse question renderer
// (backstage/js/question-renderer.js). Shared render surface for all 7 question
// types across host / student / display contexts. Native ES module: no window
// globals (escHtml / LETTERS / stripOptPrefix are vendored here), every
// user-facing string through t(), legacy `qr-` classes renamed to `cdx-qr-`.
//
// Usage:
//   renderInput(q, container, opts)              student input UI
//   renderResults(q, counts, container, opts)    results display
//   renderDisplay(q, counts, container, opts)    text heading + results
// opts.mode: 'display' | 'student' | 'host'
import { t } from '../js/i18n.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripOptPrefix(s) {
  return typeof s === 'string' ? s.replace(/^[A-Da-d][.)]\s*/, '') : s;
}

// `N respostas` / `1 resposta`, pluralized through the dictionary.
function answersLabel(n) {
  return n + ' ' + (n === 1 ? t('questions.qr_answer') : t('questions.qr_answers'));
}

// ── TYPE REGISTRY ─────────────────────────────────────────────
const TYPES = {
  mc:        { label: 'questions.type_mc',        defaults: { optionCount: 4 } },
  tf:        { label: 'questions.type_tf',        defaults: { labelTrue: 'Verdadeiro', labelFalse: 'Falso' } },
  poll:      { label: 'questions.type_poll',      defaults: { maxOptions: 6 } },
  open:      { label: 'questions.type_open',      defaults: { maxChars: 500 } },
  wordcloud: { label: 'questions.type_wordcloud', defaults: { maxWords: 3 } },
  rating:    { label: 'questions.type_rating',    defaults: { min: 1, max: 5 } },
  numeric:   { label: 'questions.type_numeric',   defaults: { min: 0, max: 100 } },
};

export function getTypeLabel(typeCode) {
  const entry = TYPES[typeCode];
  return entry ? t(entry.label) : typeCode;
}

export function getTypeConfig(type) {
  const entry = TYPES[type];
  if (!entry) return {};
  const cfg = {};
  for (const key in entry.defaults) {
    let stored = null;
    try { stored = (typeof localStorage !== 'undefined') ? localStorage.getItem('cp_cfg_' + type + '_' + key) : null; } catch (_) { stored = null; }
    cfg[key] = stored !== null ? stored : entry.defaults[key];
  }
  return cfg;
}

// ── INTERNAL: Bar chart ───────────────────────────────────────
// Renders option bars into container. In-place mutation when the structure
// already matches (stable DOM identity -> smooth width tween + no flicker on the
// student's "mine" highlight), full rebuild on structural change. Faithful to
// the legacy Bundle J behavior.
function renderBarChart(options, counts, container, opts) {
  const showResults    = opts.showResults !== false;
  const revealAnswer   = opts.revealAnswer === true;
  const correctAnswers = Array.isArray(opts.correctAnswers) ? opts.correctAnswers
                       : (opts.correctAnswer !== undefined && opts.correctAnswer !== null ? [opts.correctAnswer] : []);
  const myAnswerIndices = Array.isArray(opts.myAnswerIndices) ? opts.myAnswerIndices
                        : (opts.myAnswerIndex !== undefined && opts.myAnswerIndex !== null ? [opts.myAnswerIndex] : []);
  const voterCount = (opts.voterCount !== undefined && opts.voterCount > 0) ? opts.voterCount : null;

  const total = (counts || []).reduce((a, b) => a + b, 0);
  const denominator = voterCount !== null ? voterCount : total;
  const opts2 = options || [];

  const derived = { showResults, revealAnswer, correctAnswers, myAnswerIndices, denominator };

  const existingBars = container.querySelectorAll('.cdx-qr-bar');
  if (existingBars.length === opts2.length && opts2.length > 0) {
    for (let i = 0; i < opts2.length; i++) updateBar(existingBars[i], opts2[i], i, counts, derived);
    return;
  }

  let html = '';
  opts2.forEach((opt, i) => {
    const count     = (counts && counts[i] !== undefined) ? counts[i] : 0;
    const pct       = showResults && denominator > 0 ? Math.round(count / denominator * 100) : 0;
    const isCorrect = revealAnswer && correctAnswers.indexOf(i) !== -1;
    const isMine    = myAnswerIndices.indexOf(i) !== -1;
    const fillClass = isCorrect ? 'correct' : (isMine ? 'mine' : '');

    html +=
      '<div class="cdx-qr-bar ' + (isCorrect ? 'is-correct' : '') + '">' +
        '<div class="cdx-qr-bar-letter">' + escHtml(LETTERS[i] || String(i + 1)) + '</div>' +
        '<div class="cdx-qr-bar-body">' +
          '<div class="cdx-qr-bar-label">' +
            '<span class="cdx-qr-bar-text">' + escHtml(stripOptPrefix(opt)) + '</span>' +
            '<span class="cdx-qr-bar-pct">' + (showResults ? pct + '%' : '') + '</span>' +
          '</div>' +
          '<div class="cdx-qr-bar-track">' +
            '<div class="cdx-qr-bar-fill ' + fillClass + '" style="width:' + (showResults ? pct : 0) + '%"></div>' +
          '</div>' +
        '</div>' +
        '<div class="cdx-qr-bar-count">' + (showResults ? count : '') + '</div>' +
      '</div>';
  });

  container.innerHTML = html;
}

function updateBar(bar, opt, i, counts, derived) {
  const { showResults, revealAnswer, correctAnswers, myAnswerIndices, denominator } = derived;
  const count     = (counts && counts[i] !== undefined) ? counts[i] : 0;
  const pct       = showResults && denominator > 0 ? Math.round(count / denominator * 100) : 0;
  const isCorrect = revealAnswer && correctAnswers.indexOf(i) !== -1;
  const isMine    = myAnswerIndices.indexOf(i) !== -1;

  bar.classList.toggle('is-correct', isCorrect);

  const textEl = bar.querySelector('.cdx-qr-bar-text');
  if (textEl) {
    const nextText = stripOptPrefix(opt);
    if (textEl.textContent !== nextText) textEl.textContent = nextText;
  }
  const pctEl = bar.querySelector('.cdx-qr-bar-pct');
  if (pctEl) pctEl.textContent = showResults ? pct + '%' : '';
  const countEl = bar.querySelector('.cdx-qr-bar-count');
  if (countEl) countEl.textContent = showResults ? String(count) : '';

  const fill = bar.querySelector('.cdx-qr-bar-fill');
  if (fill) {
    fill.classList.toggle('correct', isCorrect);
    fill.classList.toggle('mine', !isCorrect && isMine);
    fill.style.width = (showResults ? pct : 0) + '%';
  }
}

// ── INTERNAL: Word cloud ──────────────────────────────────────
function renderWordCloud(question, container) {
  const textAnswers = question.text_answers || [];
  const freq = {};
  textAnswers.forEach((ans) => {
    let val = typeof ans === 'string' ? ans : (ans && ans.value ? String(ans.value) : '');
    val = val.normalize('NFD').replace(/[̀-ͯ]/g, '');
    val.toLowerCase().trim().split(/\s+/).filter(Boolean).forEach((w) => { freq[w] = (freq[w] || 0) + 1; });
  });
  let words = Object.keys(freq);
  if (!words.length) {
    container.innerHTML = '<p class="cdx-qr-wc-empty">' + escHtml(t('questions.qr_waiting_answers')) + '</p>';
    return;
  }
  const max = Math.max.apply(null, words.map((w) => freq[w]));
  words.sort((a, b) => freq[b] - freq[a]);
  words = words.slice(0, 30);

  const colors = ['#14b8a6', '#6366f1', '#3b82f6', '#7c3aed', '#c026d3', '#16a34a', '#0284c7'];
  let html = '<div class="cdx-qr-wordcloud">';
  words.forEach((w, i) => {
    const sz = (0.9 + (freq[w] / max) * 2.1).toFixed(2);
    const color = colors[i % colors.length];
    html += '<span class="cdx-qr-word" style="font-size:' + sz + 'em; color:' + color + '">' + escHtml(w) + '</span>';
  });
  html += '</div>';
  container.innerHTML = html;
}

// ── INTERNAL: Text feed ───────────────────────────────────────
function renderTextFeed(question, container, opts) {
  const textAnswers = question.text_answers || [];
  if (!textAnswers.length) {
    container.innerHTML = '<div class="cdx-qr-feed-empty">' + escHtml(t('questions.qr_waiting_answers')) + '</div>';
    return;
  }
  let html = '<div class="cdx-qr-text-feed">';
  textAnswers.forEach((ans) => {
    html += '<div class="cdx-qr-feed-card">';
    html += '<div class="cdx-qr-feed-name">' + escHtml(ans.name || t('questions.qr_anonymous')) + '</div>';
    html += '<div class="cdx-qr-feed-text">' + escHtml(ans.value || '') + '</div>';
    if (typeof opts.onRemoveAnswer === 'function') {
      html += '<button class="cdx-qr-feed-remove" data-id="' + escHtml(ans.id) + '" aria-label="x">×</button>';
    }
    html += '</div>';
  });
  html += '</div>';
  container.innerHTML = html;

  if (typeof opts.onRemoveAnswer === 'function') {
    container.querySelectorAll('.cdx-qr-feed-remove').forEach((btn) => {
      btn.addEventListener('click', () => opts.onRemoveAnswer(btn.dataset.id, btn.closest('.cdx-qr-feed-card')));
    });
  }
}

// ── INTERNAL: Rating results ──────────────────────────────────
function renderRatingResults(question, container, opts) {
  const qOpts = question.options || {};
  const min = qOpts.min !== undefined ? qOpts.min : 1;
  const max = qOpts.max !== undefined ? qOpts.max : 5;
  const textAnswers = question.text_answers || [];
  const countsObj = {};
  for (let i = min; i <= max; i++) countsObj[i] = 0;

  let sum = 0, total = 0;
  textAnswers.forEach((ans) => {
    const val = parseInt(ans.value, 10);
    if (!isNaN(val) && val >= min && val <= max) { countsObj[val]++; sum += val; total++; }
  });

  if (opts.showResults === false) {
    container.innerHTML = '<div class="cdx-qr-rating-summary"><div class="cdx-qr-rating-total">' + answersLabel(total) + '</div></div>';
    return;
  }

  const avg = total > 0 ? (sum / total).toFixed(1) : '0.0';
  const labels = [], countsArr = [];
  for (let k = min; k <= max; k++) { labels.push(String(k)); countsArr.push(countsObj[k]); }

  container.innerHTML =
    '<div class="cdx-qr-rating-summary">' +
      '<div class="cdx-qr-rating-avg">' + avg + '</div>' +
      '<div class="cdx-qr-rating-total">' + answersLabel(total) + '</div>' +
    '</div><div class="cdx-qr-rating-bars"></div>';

  const subOpts = Object.assign({}, opts, { showResults: true });
  renderBarChart(labels, countsArr, container.querySelector('.cdx-qr-rating-bars'), subOpts);
}

// ── INTERNAL: Numeric results ─────────────────────────────────
function renderNumericResults(question, container, opts) {
  if (opts.showResults === false) {
    const total = (question.text_answers || []).length;
    container.innerHTML = '<div class="cdx-qr-numeric-summary"><div>' + escHtml(t('questions.qr_total')) + ': <strong>' + total + '</strong></div></div>';
    return;
  }
  const textAnswers = question.text_answers || [];
  const vals = [];
  textAnswers.forEach((ans) => { const val = parseFloat(ans.value); if (!isNaN(val)) vals.push(val); });
  const total = vals.length;
  if (!total) {
    container.innerHTML = '<div class="cdx-qr-feed-empty">' + escHtml(t('questions.qr_waiting_answers')) + '</div>';
    return;
  }

  const sum = vals.reduce((a, b) => a + b, 0);
  const avg = (sum / total).toFixed(1);
  const dataMin = Math.min.apply(null, vals);
  const dataMax = Math.max.apply(null, vals);

  container.innerHTML =
    '<div class="cdx-qr-numeric-summary">' +
      '<div>' + escHtml(t('questions.qr_average')) + ': <strong>' + avg + '</strong></div>' +
      '<div>' + escHtml(t('questions.qr_min')) + ': <strong>' + dataMin + '</strong> | ' + escHtml(t('questions.qr_max')) + ': <strong>' + dataMax + '</strong></div>' +
      '<div>' + escHtml(t('questions.qr_total')) + ': <strong>' + total + '</strong></div>' +
    '</div><div class="cdx-qr-numeric-bars"></div>';

  const labels = [], countsArr = [];
  if (dataMin === dataMax) {
    labels.push(String(dataMin));
    countsArr.push(total);
  } else {
    const buckets = 5, range = dataMax - dataMin;
    let step = range / buckets;
    if (step === 0) step = 1;
    const bucketCounts = [0, 0, 0, 0, 0];
    vals.forEach((val) => {
      let b = Math.floor((val - dataMin) / step);
      if (b >= buckets) b = buckets - 1;
      bucketCounts[b]++;
    });
    for (let j = 0; j < buckets; j++) {
      const rMin = dataMin + j * step, rMax = rMin + step;
      labels.push(rMin.toFixed(1) + ' - ' + rMax.toFixed(1));
      countsArr.push(bucketCounts[j]);
    }
  }
  const subOpts = Object.assign({}, opts, { showResults: true });
  renderBarChart(labels, countsArr, container.querySelector('.cdx-qr-numeric-bars'), subOpts);
}

// ── INTERNAL: Button grid (student input) ─────────────────────
function renderButtonGrid(options, container, opts) {
  const isMulti   = opts.multi === true;
  const maxSelect = (opts.maxSelect !== undefined) ? parseInt(opts.maxSelect) : 1;
  const onSelect  = opts.onSelect || function () {};

  let html = '';
  (options || []).forEach((opt, i) => {
    html +=
      '<button class="cdx-qr-option-btn" data-index="' + i + '" type="button">' +
        '<span class="cdx-qr-option-letter">' + escHtml(LETTERS[i] || String(i + 1)) + '</span>' +
        '<span>' + escHtml(stripOptPrefix(opt)) + '</span>' +
      '</button>';
  });

  if (isMulti) {
    const limitLabel = maxSelect === 0
      ? t('questions.qr_select_all')
      : (maxSelect === 1
          ? t('questions.qr_select_up_to_one')
          : t('questions.qr_select_up_to_many').replace('{n}', maxSelect));
    html += '<p class="cdx-qr-multi-hint">' + escHtml(limitLabel) + '</p>';
    html += '<button class="cdx-qr-submit-btn" type="button" disabled>' + escHtml(t('questions.qr_submit')) + '</button>';
  }

  container.innerHTML = html;

  if (!isMulti) {
    container.querySelectorAll('.cdx-qr-option-btn').forEach((btn) => {
      btn.addEventListener('click', () => onSelect(parseInt(btn.dataset.index), btn));
    });
    return;
  }

  const selected = new Set();
  const submitBtn = container.querySelector('.cdx-qr-submit-btn');
  container.querySelectorAll('.cdx-qr-option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.index);
      if (selected.has(idx)) {
        selected.delete(idx);
        btn.classList.remove('is-selected');
      } else {
        const atMax = maxSelect !== 0 && selected.size >= maxSelect;
        if (atMax) return;
        selected.add(idx);
        btn.classList.add('is-selected');
      }
      submitBtn.disabled = selected.size === 0;
    });
  });
  submitBtn.addEventListener('click', () => {
    if (selected.size === 0) return;
    if (typeof opts.onSubmitIndices === 'function') opts.onSubmitIndices(Array.from(selected));
  });
}

// ── INTERNAL: Free-form inputs (student) ──────────────────────
function renderOpenInput(question, container, opts) {
  opts = opts || {};
  const cfg = getTypeConfig('open');
  const maxChars = cfg.maxChars || 500;
  container.innerHTML =
    '<div class="cdx-qr-open-form">' +
      '<textarea class="cdx-qr-open-textarea" maxlength="' + maxChars + '" placeholder="' + escHtml(t('questions.qr_open_placeholder')) + '"></textarea>' +
      '<div class="cdx-qr-input-row">' +
        '<span class="cdx-qr-char-counter">0 / ' + maxChars + '</span>' +
        '<button class="cdx-qr-submit-btn" type="button">' + escHtml(t('questions.qr_submit')) + '</button>' +
      '</div>' +
    '</div>';
  const ta = container.querySelector('.cdx-qr-open-textarea');
  const counter = container.querySelector('.cdx-qr-char-counter');
  const btn = container.querySelector('.cdx-qr-submit-btn');
  ta.addEventListener('input', () => { counter.textContent = ta.value.length + ' / ' + maxChars; });
  btn.addEventListener('click', () => { if (ta.value.trim() && typeof opts.onSubmit === 'function') opts.onSubmit(ta.value.trim()); });
}

function renderWordcloudInput(question, container, opts) {
  opts = opts || {};
  const cfg = getTypeConfig('wordcloud');
  const maxWords = cfg.maxWords || 3;
  container.innerHTML =
    '<div class="cdx-qr-wc-form">' +
      '<input type="text" class="cdx-qr-wc-input" maxlength="50" placeholder="' + escHtml(t('questions.qr_wc_placeholder')) + '">' +
      '<div class="cdx-qr-input-row">' +
        '<span class="cdx-qr-wc-hint">' + escHtml(t('questions.qr_wc_hint').replace('{n}', maxWords)) + '</span>' +
        '<button class="cdx-qr-submit-btn" type="button">' + escHtml(t('questions.qr_submit')) + '</button>' +
      '</div>' +
    '</div>';
  const input = container.querySelector('.cdx-qr-wc-input');
  const btn = container.querySelector('.cdx-qr-submit-btn');
  input.addEventListener('input', () => {
    const words = input.value.trim().split(/\s+/).filter(Boolean);
    if (words.length > maxWords) input.value = words.slice(0, maxWords).join(' ') + ' ';
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
  btn.addEventListener('click', () => { if (input.value.trim() && typeof opts.onSubmit === 'function') opts.onSubmit(input.value.trim()); });
}

function renderRatingInput(question, container, opts) {
  opts = opts || {};
  const qOpts = question.options || {};
  const min = qOpts.min !== undefined ? qOpts.min : 1;
  const max = qOpts.max !== undefined ? qOpts.max : 5;
  let html = '<div class="cdx-qr-rating-row">';
  for (let i = min; i <= max; i++) html += '<button class="cdx-qr-rating-btn" data-val="' + i + '" type="button">' + i + '</button>';
  html += '</div>';
  container.innerHTML = html;
  container.querySelectorAll('.cdx-qr-rating-btn').forEach((btn) => {
    btn.addEventListener('click', () => { if (typeof opts.onSubmit === 'function') opts.onSubmit(btn.dataset.val); });
  });
}

function renderNumericInput(question, container, opts) {
  opts = opts || {};
  const qOpts = question.options || {};
  const minAttr = qOpts.min !== undefined ? ' min="' + qOpts.min + '"' : '';
  const maxAttr = qOpts.max !== undefined ? ' max="' + qOpts.max + '"' : '';
  container.innerHTML =
    '<div class="cdx-qr-numeric-form">' +
      '<input type="number" class="cdx-qr-numeric-input"' + minAttr + maxAttr + ' placeholder="' + escHtml(t('questions.qr_numeric_placeholder')) + '">' +
      '<button class="cdx-qr-submit-btn" type="button">' + escHtml(t('questions.qr_submit')) + '</button>' +
    '</div>';
  const input = container.querySelector('.cdx-qr-numeric-input');
  const btn = container.querySelector('.cdx-qr-submit-btn');
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
  btn.addEventListener('click', () => { if (input.value.trim() !== '' && typeof opts.onSubmit === 'function') opts.onSubmit(input.value.trim()); });
}

// ── PUBLIC: renderInput ───────────────────────────────────────
export function renderInput(question, container, opts) {
  opts = opts || {};
  const type = question.type || 'mc';
  const maxSel = (question.max_select !== undefined) ? parseInt(question.max_select) : 1;

  switch (type) {
    case 'mc':
    case 'poll': {
      const isMulti = maxSel !== 1;
      renderButtonGrid(question.options || [], container, Object.assign({}, opts, { multi: isMulti, maxSelect: maxSel }));
      break;
    }
    case 'tf':       renderButtonGrid(question.options || [], container, opts); break;
    case 'open':     renderOpenInput(question, container, opts); break;
    case 'wordcloud': renderWordcloudInput(question, container, opts); break;
    case 'rating':   renderRatingInput(question, container, opts); break;
    case 'numeric':  renderNumericInput(question, container, opts); break;
    default:         container.innerHTML = '';
  }
}

// ── PUBLIC: renderDisplay ─────────────────────────────────────
export function renderDisplay(question, counts, container, opts) {
  const resultsEl = (typeof document !== 'undefined') ? document.createElement('div') : null;
  let html = '';
  if (question.text) html += '<div class="cdx-qr-question-text-display">' + escHtml(question.text) + '</div>';
  container.innerHTML = html;
  if (resultsEl) {
    resultsEl.className = 'cdx-qr-display';
    container.appendChild(resultsEl);
    renderResults(question, counts, resultsEl, opts);
  }
}

// ── PUBLIC: renderResults ─────────────────────────────────────
export function renderResults(question, counts, container, opts) {
  opts = opts || {};
  const type = question.type || 'mc';
  const showResults = opts.showResults !== false;

  const mergedOpts = Object.assign({}, opts);
  if (!mergedOpts.correctAnswers && question.correct_answers) mergedOpts.correctAnswers = question.correct_answers;
  if (mergedOpts.voterCount === undefined && question.voter_count !== undefined) mergedOpts.voterCount = question.voter_count;

  switch (type) {
    case 'mc':
    case 'tf':
    case 'poll':
      renderBarChart(question.options || [], counts, container, mergedOpts);
      break;
    case 'wordcloud':
      if (!showResults) {
        const total = (question.text_answers || []).length;
        container.innerHTML = '<div class="cdx-qr-feed-empty">' + answersLabel(total) + ' ' + escHtml(t('questions.qr_results_hidden')) + '</div>';
        return;
      }
      renderWordCloud(question, container);
      break;
    case 'open':
      if (!showResults) {
        const total = (question.text_answers || []).length;
        container.innerHTML = '<div class="cdx-qr-feed-empty">' + answersLabel(total) + ' ' + escHtml(t('questions.qr_results_hidden')) + '</div>';
        return;
      }
      renderTextFeed(question, container, opts);
      break;
    case 'rating':  renderRatingResults(question, container, opts); break;
    case 'numeric': renderNumericResults(question, container, opts); break;
    case 'student_qa':
      container.innerHTML = '';
      break;
    default:
      container.innerHTML = '';
  }
}

// Namespace bundle for callers that prefer a single import (the render element
// imports `* as QR`). Same functions, grouped.
export const QR = { renderInput, renderResults, renderDisplay, getTypeLabel, getTypeConfig };
export default QR;
