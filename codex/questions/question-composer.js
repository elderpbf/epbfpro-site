// questions/question-composer.js
// Reusable, type-aware question composer for the 7 question types (mc, tf, poll,
// open, wordcloud, rating, numeric). The Bank uses it to add/edit bank
// questions; the Q2 live launch form will reuse the SAME composer (built shared
// from day one, not duplicated). buildPayload() is the pure seam that normalizes
// the form to the frozen Worker shape; the facade/Worker serialize from there.
// Strings via t(), no inline handlers, cdx- classes only.
import { t } from '../js/i18n.js';
import { ai } from '../js/codex-api.js';
import * as notice from '../js/notice.js';
import { resolve, isVariable, usedVars } from '../js/audiences.js';

export const TYPES = ['mc', 'tf', 'poll', 'open', 'wordcloud', 'rating', 'numeric'];
const CLASSES = ['generic', 'variable', 'unique'];
const OPTION_TYPES = ['mc', 'tf', 'poll'];

// AI Gerar / Melhorar glyphs (node-for-node from host.html). Owned here so the
// Bank editor and the live-host card render the SAME buttons from ONE source.
const _AI_GEN = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
const _AI_IMP = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>';

// The audience config (variables x audiences matrix) drives the "unique" audience
// picker and the "variable" per-audience preview. The bank/live host load it once
// and push it in here, so every later composer mount has it. Module-scoped on
// purpose, this composer is a singleton-per-mount surface.
let _audienceConfig = null;
export function setAudienceConfig(config) { _audienceConfig = config || null; }

// Pure: form -> frozen Worker question shape (options array + correct_answer +
// max_select). Single-select correct is a scalar index; multi-select is an array.
export function buildPayload(form) {
  const type = form.type || 'mc';
  const out = { type: type, question: String(form.question || '').trim() };
  if (OPTION_TYPES.indexOf(type) !== -1) {
    out.options = (form.options || []).map((o) => String(o));
    const maxSel = (type === 'tf') ? 1 : (form.maxSelect == null ? 1 : Number(form.maxSelect));
    out.max_select = maxSel;
    if (type === 'poll') {
      out.correct_answer = '';
    } else {
      const correct = (form.correct || []).filter((i) => Number.isInteger(i));
      out.correct_answer = (maxSel === 1) ? (correct.length ? correct[0] : '') : correct;
    }
  } else if (type === 'rating' || type === 'numeric') {
    out.options = {
      min: (form.min === '' || form.min == null) ? null : Number(form.min),
      max: (form.max === '' || form.max == null) ? null : Number(form.max),
    };
    out.correct_answer = '';
  } else {
    out.options = [];
    out.correct_answer = '';
  }
  // audience tag: set only for the "unique" class; generic/variable carry null
  // (variable-ness is conveyed by the {{}} tokens in the text, not a stored flag).
  out.audience = (form.audience != null && form.audience !== '') ? form.audience : null;
  return out;
}

// Resolve a STORED question's correct answer into the launch shape (scalar index
// for single-select, array for multi, null for none). Stored questions arrive in
// two shapes: bank rows carry `correct_answer` (scalar / serialized string), live
// history items carry `correct_answers` (array) and NO scalar. Relaunch must read
// BOTH, else relaunching a closed question silently drops its correct answer and
// closing with "reveal" highlights nothing on the display.
export function correctForLaunch(q) {
  if (q && q.correct_answer !== null && q.correct_answer !== undefined && q.correct_answer !== '') {
    return q.correct_answer;
  }
  if (q && Array.isArray(q.correct_answers) && q.correct_answers.length) {
    const maxSel = (q.max_select !== undefined && q.max_select !== null) ? parseInt(q.max_select, 10) : 1;
    return (maxSel === 1) ? q.correct_answers[0] : q.correct_answers;
  }
  return null;
}

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

function _optionRow(value, checked, withCorrect, removable) {
  return '<div class="cdx-comp-optrow">' +
    (withCorrect
      ? '<input type="checkbox" class="cdx-comp-correct" title="' + _esc(t('questions.bank_correct')) + '"' + (checked ? ' checked' : '') + '>'
      : '') +
    '<input type="text" class="cdx-input cdx-comp-opt" value="' + _esc(value) +
      '" placeholder="' + _esc(t('questions.bank_option')) + '">' +
    (removable ? '<button class="cdx-comp-optdel" data-act="del-opt" type="button" aria-label="x">×</button>' : '') +
  '</div>';
}

function _correctSet(initial) {
  const raw = initial && (initial.correct_answers || initial.correct);
  if (Array.isArray(raw)) return new Set(raw.map(Number));
  if (raw != null && raw !== '') { const n = parseInt(raw, 10); return new Set(Number.isInteger(n) ? [n] : []); }
  return new Set();
}

function _renderOpts(optsEl, type, initial) {
  const correct = _correctSet(initial);
  const opts = (initial && Array.isArray(initial.options)) ? initial.options : null;
  if (type === 'mc' || type === 'poll') {
    // New multiple-choice starts with 4 option slots (teacher default); polls keep
    // a leaner 2. Add/remove still allows 2-6. Editing keeps the stored count.
    const fallback = (type === 'mc') ? ['', '', '', ''] : ['', ''];
    const rows = (opts && opts.length) ? opts : fallback;
    const withCorrect = (type === 'mc');
    optsEl.innerHTML =
      '<div class="cdx-comp-optlist">' +
        rows.map((o, i) => _optionRow(o, correct.has(i), withCorrect, true)).join('') +
      '</div>' +
      '<button class="cdx-btn cdx-btn-vazado cdx-comp-addopt" data-act="add-opt" type="button">' +
        t('questions.bank_add_option') + '</button>' +
      '<label class="cdx-comp-field cdx-comp-maxsel-field"><span class="cdx-comp-label">' + t('questions.comp_max_select') + '</span>' +
        '<input type="number" class="cdx-input cdx-comp-maxsel" min="0" step="1" value="' +
        ((initial && initial.max_select != null) ? Number(initial.max_select) : 1) + '">' +
        '<span class="cdx-comp-hint">' + t('questions.comp_max_select_hint') + '</span></label>';
  } else if (type === 'tf') {
    const labels = (opts && opts.length >= 2) ? opts : [t('questions.tf_true'), t('questions.tf_false')];
    optsEl.innerHTML = '<div class="cdx-comp-optlist">' +
      _optionRow(labels[0], correct.has(0), true, false) +
      _optionRow(labels[1], correct.has(1), true, false) + '</div>';
  } else if (type === 'rating' || type === 'numeric') {
    const o = (initial && initial.options && !Array.isArray(initial.options)) ? initial.options : {};
    const dmin = type === 'rating' ? 1 : '';
    const dmax = type === 'rating' ? 5 : '';
    optsEl.innerHTML = '<div class="cdx-comp-scale">' +
      '<label class="cdx-comp-field"><span class="cdx-comp-label">' + t('questions.bank_min') + '</span>' +
        '<input type="number" class="cdx-input cdx-comp-min" value="' + (o.min != null ? o.min : dmin) + '"></label>' +
      '<label class="cdx-comp-field"><span class="cdx-comp-label">' + t('questions.bank_max') + '</span>' +
        '<input type="number" class="cdx-input cdx-comp-max" value="' + (o.max != null ? o.max : dmax) + '"></label>' +
    '</div>';
  } else {
    optsEl.innerHTML = '<div class="cdx-comp-hint">' + t('questions.bank_no_options') + '</div>';
  }
}

// Render the class-specific area below the text: for "unique" an audience picker;
// for "variable" a token hint + a per-audience live preview; plus a non-blocking
// warning when the chosen class and the text disagree.
function _renderClassExtra(extraEl, cls, text, selectedAudience) {
  const auds = (_audienceConfig && _audienceConfig.audiences) || {};
  const audKeys = Object.keys(auds);
  const label = (k) => (auds[k] && auds[k].label) || k;
  let html = '';
  let warn = '';
  if (cls === 'unique') {
    if (!audKeys.length) {
      warn = t('questions.comp_class_warn_no_audiences');
    } else {
      html += '<label class="cdx-comp-field"><span class="cdx-comp-label">' + t('questions.comp_audience') + '</span>' +
        '<select class="cdx-select cdx-comp-audience"><option value="">' + _esc(t('questions.comp_audience_pick')) + '</option>' +
          audKeys.map((k) => '<option value="' + _esc(k) + '"' + (k === selectedAudience ? ' selected' : '') + '>' + _esc(label(k)) + '</option>').join('') +
        '</select></label>';
      if (!selectedAudience) warn = t('questions.comp_class_warn_no_audience');
    }
    if (!warn && isVariable(text)) warn = t('questions.comp_class_warn_has_tokens');
  } else if (cls === 'variable') {
    const vars = usedVars(text);
    html += '<div class="cdx-comp-varhint">' + _esc(t('questions.comp_var_hint')) +
      (vars.length ? ' <code>' + vars.map(_esc).join('</code> <code>') + '</code>' : '') + '</div>';
    if (!isVariable(text)) {
      warn = t('questions.comp_class_warn_no_tokens');
    } else if (audKeys.length) {
      html += '<div class="cdx-comp-preview">' + audKeys.map((k) =>
        '<div class="cdx-comp-preview-row"><span class="cdx-comp-preview-aud">' + _esc(label(k)) + '</span>' +
        '<span class="cdx-comp-preview-text">' + _esc(resolve(text, (auds[k] && auds[k].values) || {})) + '</span></div>').join('') + '</div>';
    }
  } else if (isVariable(text)) {
    warn = t('questions.comp_class_warn_has_tokens');
  }
  if (warn) html += '<div class="cdx-comp-class-warn">' + _esc(warn) + '</div>';
  extraEl.innerHTML = html;
}

// Render an editable composer into `container`. `initial` is an existing question
// (to edit) or null (new). Returns { read(), destroy() }.
export function mountComposer(container, initial) {
  const cleanup = [];
  const init = initial || {};
  const curType = init.type || 'mc';
  const _initText = init.text || init.question || '';
  const curClass = init.audience ? 'unique' : (isVariable(_initText) ? 'variable' : 'generic');
  container.innerHTML =
    '<div class="cdx-comp">' +
      '<div class="cdx-comp-row2">' +
        '<label class="cdx-comp-field"><span class="cdx-comp-label">' + t('questions.bank_type') + '</span>' +
          '<select class="cdx-select cdx-comp-type">' +
            TYPES.map((ty) => '<option value="' + ty + '"' + (ty === curType ? ' selected' : '') + '>' +
              t('questions.type_' + ty) + '</option>').join('') +
          '</select></label>' +
        '<label class="cdx-comp-field"><span class="cdx-comp-label">' + t('questions.comp_class') + '</span>' +
          '<select class="cdx-select cdx-comp-class">' +
            CLASSES.map((c) => '<option value="' + c + '"' + (c === curClass ? ' selected' : '') + '>' +
              t('questions.comp_class_' + c) + '</option>').join('') +
          '</select></label>' +
      '</div>' +
      '<label class="cdx-comp-field"><span class="cdx-comp-label">' + t('questions.bank_question_text') + '</span>' +
        '<textarea class="cdx-input cdx-comp-text" rows="2">' + _esc(_initText) + '</textarea></label>' +
      '<div class="cdx-comp-class-extra" id="cdx-comp-class-extra"></div>' +
      '<div class="cdx-comp-opts" id="cdx-comp-opts"></div>' +
      '<div class="cdx-comp-ai-row">' +
        '<button class="cdx-btn cdx-btn-vazado cdx-comp-ai" data-act="ai-generate" type="button">' + _AI_GEN + ' ' + _esc(t('questions.host_ai_generate')) + '</button>' +
        '<button class="cdx-btn cdx-btn-vazado cdx-comp-ai" data-act="ai-improve" type="button">' + _AI_IMP + ' ' + _esc(t('questions.host_ai_improve')) + '</button>' +
      '</div>' +
    '</div>';
  const typeSel = container.querySelector('.cdx-comp-type');
  const classSel = container.querySelector('.cdx-comp-class');
  const textEl = container.querySelector('.cdx-comp-text');
  const extraEl = container.querySelector('#cdx-comp-class-extra');
  const optsEl = container.querySelector('#cdx-comp-opts');
  _renderOpts(optsEl, curType, init);
  _renderClassExtra(extraEl, classSel.value, textEl.value, init.audience || '');

  const onClassOrText = () => _renderClassExtra(extraEl, classSel.value, textEl.value,
    (extraEl.querySelector('.cdx-comp-audience') || {}).value || init.audience || '');
  classSel.addEventListener('change', onClassOrText);
  textEl.addEventListener('input', onClassOrText);
  extraEl.addEventListener('change', (e) => { if (e.target.classList.contains('cdx-comp-audience')) onClassOrText(); });
  cleanup.push(() => { classSel.removeEventListener('change', onClassOrText); textEl.removeEventListener('input', onClassOrText); });

  const onType = () => _renderOpts(optsEl, typeSel.value, null);
  typeSel.addEventListener('change', onType);
  cleanup.push(() => typeSel.removeEventListener('change', onType));

  const onClick = (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'add-opt') {
      const list = optsEl.querySelector('.cdx-comp-optlist');
      if (list) list.insertAdjacentHTML('beforeend', _optionRow('', false, typeSel.value === 'mc', true));
    } else if (act === 'del-opt') {
      const row = btn.closest('.cdx-comp-optrow');
      if (row) row.remove();
    }
  };
  optsEl.addEventListener('click', onClick);
  cleanup.push(() => optsEl.removeEventListener('click', onClick));

  // ── AI Gerar / Melhorar (shared by Bank + live host) ──────────
  // Class-aware: Codex owns the prompt, we append instructions so "variable"
  // questions come back as {{token}} templates and "unique" ones are tailored to
  // the audience. The Worker action takes {prompt}|{improve_from}, never {mode}.
  function _curMaxSel() { const ms = optsEl.querySelector('.cdx-comp-maxsel'); return ms ? Number(ms.value) : 1; }
  function _augment(cls, audienceKey) {
    const cfg = _audienceConfig;
    if (cls === 'variable' && cfg && Array.isArray(cfg.variables) && cfg.variables.length) {
      return '\n\n' + t('questions.comp_ai_variable_instr');
    }
    if (cls === 'unique' && cfg && cfg.audiences && cfg.audiences[audienceKey]) {
      const a = cfg.audiences[audienceKey];
      const v = a.values || {};
      const ctx = (cfg.variables || []).map((k) => (v[k] && v[k].text) ? (k + '=' + v[k].text) : '').filter(Boolean).join(', ');
      return '\n\n' + t('questions.comp_ai_unique_instr').replace('{label}', a.label || audienceKey).replace('{context}', ctx);
    }
    return '';
  }
  function _applyAi(res, maxSel) {
    const out = (res && res.ai) || res;
    if (!out || !out.question) { notice.error(t('questions.bank_ai_error')); return; }
    textEl.value = out.question;
    const correct = Array.isArray(out.correct) ? out.correct.map(Number)
      : (out.correct !== undefined && out.correct !== null && out.correct !== '' ? [Number(out.correct)] : []);
    _renderOpts(optsEl, typeSel.value, {
      options: Array.isArray(out.options) ? out.options : (out.options || []),
      correct_answers: correct, max_select: maxSel,
    });
    onClassOrText();
  }
  async function _aiFlow(kind) {
    const cls = classSel.value;
    const audienceKey = (extraEl.querySelector('.cdx-comp-audience') || {}).value || '';
    const topic = String(textEl.value || '').trim();
    if (!topic) { notice.info(t(kind === 'improve' ? 'questions.bank_ai_improve_empty' : 'questions.bank_ai_empty')); return; }
    if (cls === 'unique' && !audienceKey) { notice.info(t('questions.comp_class_warn_no_audience')); return; }
    const maxSel = _curMaxSel();
    const aug = _augment(cls, audienceKey);
    const params = { type: typeSel.value, max_select: maxSel };
    if (kind === 'improve') params.improve_from = topic + aug; else params.prompt = topic + aug;
    const btns = container.querySelectorAll('.cdx-comp-ai');
    btns.forEach((b) => { b.disabled = true; });
    let res; try { res = await ai.question(params); } catch (e) { notice.internal(e); res = null; }
    btns.forEach((b) => { b.disabled = false; });
    if (!res || res.error) { notice.error(t('questions.bank_ai_error')); return; }
    _applyAi(res, maxSel);
  }
  const aiRow = container.querySelector('.cdx-comp-ai-row');
  const onAi = (e) => { const b = e.target.closest('[data-act]'); if (!b) return; const a = b.getAttribute('data-act'); if (a === 'ai-generate') _aiFlow('generate'); else if (a === 'ai-improve') _aiFlow('improve'); };
  if (aiRow) { aiRow.addEventListener('click', onAi); cleanup.push(() => aiRow.removeEventListener('click', onAi)); }

  function read() {
    const type = typeSel.value;
    const form = { type: type, question: container.querySelector('.cdx-comp-text').value };
    if (OPTION_TYPES.indexOf(type) !== -1) {
      const rows = Array.prototype.slice.call(optsEl.querySelectorAll('.cdx-comp-optrow'));
      form.options = rows.map((r) => r.querySelector('.cdx-comp-opt').value);
      form.correct = [];
      rows.forEach((r, i) => { const c = r.querySelector('.cdx-comp-correct'); if (c && c.checked) form.correct.push(i); });
      const ms = optsEl.querySelector('.cdx-comp-maxsel');
      form.maxSelect = ms ? Number(ms.value) : 1;
    } else if (type === 'rating' || type === 'numeric') {
      const min = optsEl.querySelector('.cdx-comp-min');
      const max = optsEl.querySelector('.cdx-comp-max');
      form.min = min ? min.value : '';
      form.max = max ? max.value : '';
    }
    const cls = classSel.value;
    form.audience = (cls === 'unique') ? ((extraEl.querySelector('.cdx-comp-audience') || {}).value || null) : null;
    return buildPayload(form);
  }

  function destroy() {
    cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
    container.innerHTML = '';
  }

  return { read: read, destroy: destroy };
}
