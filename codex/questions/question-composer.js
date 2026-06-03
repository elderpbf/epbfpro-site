// questions/question-composer.js
// Reusable, type-aware question composer for the 7 question types (mc, tf, poll,
// open, wordcloud, rating, numeric). The Bank uses it to add/edit bank
// questions; the Q2 live launch form will reuse the SAME composer (built shared
// from day one, not duplicated). buildPayload() is the pure seam that normalizes
// the form to the frozen Worker shape; the facade/Worker serialize from there.
// Strings via t(), no inline handlers, cdx- classes only.
import { t } from '../js/i18n.js';

export const TYPES = ['mc', 'tf', 'poll', 'open', 'wordcloud', 'rating', 'numeric'];
const OPTION_TYPES = ['mc', 'tf', 'poll'];

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
  return out;
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
    const rows = (opts && opts.length) ? opts : ['', ''];
    const withCorrect = (type === 'mc');
    optsEl.innerHTML =
      '<div class="cdx-comp-optlist">' +
        rows.map((o, i) => _optionRow(o, correct.has(i), withCorrect, true)).join('') +
      '</div>' +
      '<button class="cdx-btn cdx-btn--ghost cdx-comp-addopt" data-act="add-opt" type="button">' +
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

// Render an editable composer into `container`. `initial` is an existing question
// (to edit) or null (new). Returns { read(), destroy() }.
export function mountComposer(container, initial) {
  const cleanup = [];
  const init = initial || {};
  const curType = init.type || 'mc';
  container.innerHTML =
    '<div class="cdx-comp">' +
      '<label class="cdx-comp-field"><span class="cdx-comp-label">' + t('questions.bank_type') + '</span>' +
        '<select class="cdx-select cdx-comp-type">' +
          TYPES.map((ty) => '<option value="' + ty + '"' + (ty === curType ? ' selected' : '') + '>' +
            t('questions.type_' + ty) + '</option>').join('') +
        '</select></label>' +
      '<label class="cdx-comp-field"><span class="cdx-comp-label">' + t('questions.bank_question_text') + '</span>' +
        '<textarea class="cdx-input cdx-comp-text" rows="2">' + _esc(init.text || init.question || '') + '</textarea></label>' +
      '<div class="cdx-comp-opts" id="cdx-comp-opts"></div>' +
    '</div>';
  const typeSel = container.querySelector('.cdx-comp-type');
  const optsEl = container.querySelector('#cdx-comp-opts');
  _renderOpts(optsEl, curType, init);

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
    return buildPayload(form);
  }

  function destroy() {
    cleanup.forEach((fn) => { try { fn(); } catch (_) { /* ignore */ } });
    container.innerHTML = '';
  }

  return { read: read, destroy: destroy };
}
