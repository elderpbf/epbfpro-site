// codex/js/survey-question.js
// One survey question, rendered. The single implementation of the four question kinds, of the
// card around them, and of the counting rules behind a progress bar.
//
// It lives in codex/js/ and NOT in a tab folder because it has TWO consumers: the student's
// dialog on the Trilha, and the admin tab that previews the instrument being edited. A module in
// cohorts/ cannot import across into trilha/ or questions/ (tests/modules.test.mjs Test 5), so
// the shared seam has to sit here. If this ever gets copied instead of imported, the preview and
// the real thing drift, and nobody notices until a student sees something the admin never saw.
//
// Every user-facing string arrives through an injected `t`, never an import: the Trilha and the
// admin app carry SEPARATE dictionaries (trilha/i18n.js vs js/i18n.js). Same contract as
// notif-bell.js, which is shared for the same reason.
//
// An ITEM is `{ kind, prompt, options?, optional?, min?, max? }`. The caller owns the list: here
// it is stub data, in the shipping feature it is rows of ct_survey_questions. This module never
// fetches, never stores and never holds state; ANSWERS is a plain map of index to value.
import { esc } from './dom.js';

export const KINDS = ['scale', 'choice', 'words', 'text'];
export const SCALE_MIN = 1;
export const SCALE_MAX = 5;
export const WORD_SLOTS = 3;

// A tap on a scale or a choice is a complete answer, so a stepped layout may move on by itself.
// A typed answer is not: a box that runs away mid-word is worse than an extra tap.
export function isSelfAdvancing(item) {
  return !!item && (item.kind === 'scale' || item.kind === 'choice');
}

// ── Counting. These are the rules Élder pushed back on, so they live in ONE place. ───────────

// PURE. An item counts as answered when it carries any value. A words item needs at least one of
// its boxes; blank strings never count.
export function isAnswered(answers, i) {
  const v = (answers || {})[i];
  if (v == null) return false;
  if (Array.isArray(v)) return v.some((w) => String(w || '').trim() !== '');
  return String(v).trim() !== '';
}

// PURE. How many items a person actually has to answer.
export function requiredTotal(items) {
  return (items || []).filter((it) => it && !it.optional).length;
}

// PURE. Progress over the REQUIRED items only. An optional item left blank is a FINISHED survey,
// not an unfinished one, which is why the bar reaches 100% instead of parking at 8 de 10.
export function answeredCount(items, answers) {
  return (items || []).reduce((n, it, i) => n + (it && !it.optional && isAnswered(answers, i) ? 1 : 0), 0);
}

// PURE. Percent for the bar, capped so a stray key can never overfill it.
export function progressPct(items, answers) {
  const total = requiredTotal(items);
  if (!total) return 100;
  return Math.min(100, Math.round(answeredCount(items, answers) / total * 100));
}

// PURE. Every required item answered, which is the ONLY condition under which a survey may be
// sent. The send button does not exist before this is true: a button you cannot use yet is a
// button that lies about what it does.
export function isComplete(items, answers) {
  return answeredCount(items, answers) >= requiredTotal(items);
}

// PURE. How many required items are still missing, for the line that stands where the send button
// will be.
export function missingCount(items, answers) {
  return Math.max(0, requiredTotal(items) - answeredCount(items, answers));
}

// PURE. The first item after `idx` that has no answer yet, or -1 when there is none.
export function nextUnanswered(items, answers, idx) {
  for (let i = idx + 1; i < (items || []).length; i++) if (!isAnswered(answers, i)) return i;
  return -1;
}

// PURE. One box, one word. The box says "em até três palavras" and then quietly accepts a whole
// sentence, which is how a three-word cloud stops being a three-word cloud. Crushing the spaces
// out would only trade a sentence for one invented word, so a second word SPILLS into the box on
// the right, the way a code field advances. Returns the boxes plus where the caret should go.
export function spillWords(current, slot, raw) {
  const out = Array.isArray(current) ? current.slice(0, WORD_SLOTS) : [];
  while (out.length < WORD_SLOTS) out.push('');
  const text = String(raw == null ? '' : raw);
  const parts = text.split(/\s+/).filter(Boolean);
  if (!parts.length) { out[slot] = ''; return { words: out, focus: slot }; }
  let last = slot;
  for (let k = 0; k < parts.length && slot + k < WORD_SLOTS; k++) { out[slot + k] = parts[k]; last = slot + k; }
  const wantsNext = parts.length > 1 || /\s$/.test(text);
  return { words: out, focus: wantsNext ? Math.min(last + 1, WORD_SLOTS - 1) : last };
}

// ── Rendering ────────────────────────────────────────────────────────────────────────────────

function scaleHtml(item, idx, answers, t) {
  const min = Number.isFinite(item.min) ? item.min : SCALE_MIN;
  const max = Number.isFinite(item.max) ? item.max : SCALE_MAX;
  const cur = answers[idx];
  let html = '<div class="cdx-sv-scale" role="group">';
  for (let n = min; n <= max; n++) {
    const on = String(cur) === String(n);
    html += '<button type="button" class="cdx-sv-dot' + (on ? ' is-on' : '') + '"' +
      ' data-sv-set="' + idx + '" data-sv-val="' + n + '"' +
      ' aria-pressed="' + (on ? 'true' : 'false') + '">' + n + '</button>';
  }
  return html + '</div><div class="cdx-sv-ends"><span>' + esc(t('survey.scale_low')) + '</span>' +
    '<span>' + esc(t('survey.scale_high')) + '</span></div>';
}

function choiceHtml(item, idx, answers) {
  const cur = answers[idx];
  return '<div class="cdx-sv-choices">' + (item.options || []).map((opt) => {
    const on = cur === opt;
    return '<button type="button" class="cdx-sv-choice' + (on ? ' is-on' : '') + '"' +
      ' data-sv-set="' + idx + '" data-sv-val="' + esc(opt) + '"' +
      ' aria-pressed="' + (on ? 'true' : 'false') + '">' +
      '<span class="cdx-sv-radio"></span>' + esc(opt) + '</button>';
  }).join('') + '</div>';
}

function wordsHtml(idx, answers, t) {
  const cur = Array.isArray(answers[idx]) ? answers[idx] : [];
  let html = '<div class="cdx-sv-words">';
  for (let w = 0; w < WORD_SLOTS; w++) {
    html += '<input type="text" class="cdx-sv-word" maxlength="24" data-sv-word="' + idx + '"' +
      ' data-sv-slot="' + w + '" value="' + esc(cur[w] || '') + '"' +
      ' autocomplete="off" spellcheck="false"' +
      ' aria-label="' + esc(t('survey.word_n')).replace('{n}', String(w + 1)) + '">';
  }
  return html + '</div><div class="cdx-sv-hint">' + esc(t('survey.word_hint')) + '</div>';
}

function textHtml(idx, answers, t) {
  return '<textarea class="cdx-sv-text" rows="4" maxlength="1000" data-sv-text="' + idx + '"' +
    ' placeholder="' + esc(t('survey.text_placeholder')) + '">' + esc(answers[idx] || '') + '</textarea>';
}

// The input for one item, without the card around it.
export function questionInput(item, idx, answers, t) {
  const a = answers || {};
  if (item.kind === 'scale') return scaleHtml(item, idx, a, t);
  if (item.kind === 'choice') return choiceHtml(item, idx, a);
  if (item.kind === 'words') return wordsHtml(idx, a, t);
  return textHtml(idx, a, t);
}

// The full card: position, an `opcional` badge when it earns one, the prompt, and the input.
// opts.total is what the "1/10" counter divides by, so a stepped layout and a full list agree.
// opts.readOnly renders the admin's preview, where the controls must not be operable.
export function questionCard(item, idx, answers, t, opts) {
  const o = opts || {};
  const total = Number.isFinite(o.total) ? o.total : null;
  const a = answers || {};
  return '<div class="cdx-sv-q' + (isAnswered(a, idx) ? ' is-done' : '') +
      (o.readOnly ? ' is-preview' : '') + '" data-sv-q="' + idx + '">' +
    '<div class="cdx-sv-qhead">' +
      '<span class="cdx-sv-qnum">' + (idx + 1) + (total ? '<span>/' + total + '</span>' : '') + '</span>' +
      (item.optional ? '<span class="cdx-sv-opt">' + esc(t('survey.optional')) + '</span>' : '') +
    '</div>' +
    '<div class="cdx-sv-prompt">' + esc(item.prompt) + '</div>' +
    '<div class="cdx-sv-input">' + questionInput(item, idx, a, t) + '</div>' +
  '</div>';
}

// The progress bar and its readout. Shared so the dialog head and any admin summary cannot
// disagree about what "done" means.
export function progressHtml(items, answers, t) {
  return '<div class="cdx-sv-progress">' +
    '<div class="cdx-sv-bar"><div class="cdx-sv-fill" style="width:' + progressPct(items, answers) + '%"></div></div>' +
    '<span class="cdx-sv-pcount">' + esc(progressLabel(items, answers, t)) + '</span>' +
  '</div>';
}

export function progressLabel(items, answers, t) {
  return t('survey.progress')
    .replace('{n}', String(answeredCount(items, answers)))
    .replace('{total}', String(requiredTotal(items)));
}

// ── In-place patching ────────────────────────────────────────────────────────────────────────
// Answering must NOT rebuild the surface: a full re-render throws the reader back to the top of
// the questionnaire, which is the single worst thing this screen did. These patch exactly what
// changed and leave the scroll alone. Same reason js/list-sync.js exists.

export function patchQuestion(root, idx, answers) {
  if (!root) return;
  const card = root.querySelector('.cdx-sv-q[data-sv-q="' + idx + '"]');
  if (!card) return;
  card.classList.toggle('is-done', isAnswered(answers, idx));
  const cur = (answers || {})[idx];
  card.querySelectorAll('[data-sv-set]').forEach((btn) => {
    const on = btn.getAttribute('data-sv-val') === String(cur);
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

export function patchProgress(root, items, answers, t) {
  if (!root) return;
  const fill = root.querySelector('.cdx-sv-fill');
  const count = root.querySelector('.cdx-sv-pcount');
  if (fill) fill.style.width = progressPct(items, answers) + '%';
  if (count) count.textContent = progressLabel(items, answers, t);
}

// Apply a keystroke in a three-word box: store the spill, repaint only the boxes it touched, and
// move the caret. Never re-renders, which would steal the caret mid-word.
export function applyWordInput(el, answers) {
  const idx = Number(el.getAttribute('data-sv-word'));
  const slot = Number(el.getAttribute('data-sv-slot'));
  const spill = spillWords(answers[idx], slot, el.value);
  answers[idx] = spill.words;
  const card = el.closest('.cdx-sv-q');
  const boxes = card ? card.querySelectorAll('[data-sv-word]') : [];
  boxes.forEach((b) => {
    const sl = Number(b.getAttribute('data-sv-slot'));
    if (sl >= slot && b.value !== spill.words[sl]) b.value = spill.words[sl] || '';
  });
  if (spill.focus !== slot && boxes[spill.focus] && boxes[spill.focus].focus) boxes[spill.focus].focus();
  if (card) card.classList.toggle('is-done', isAnswered(answers, idx));
  return idx;
}

// Where a click really landed. On touch, Chromium can hand the synthesised click to an ANCESTOR
// of the element the finger went down on, so an upward closest() from e.target misses a hook
// sitting on a descendant: it works on a desktop and does nothing on a phone, with no console
// error to show for it. Measured on an iPhone 13 profile, 2026-08-26.
export function hookFrom(e, sel) {
  const direct = e.target.closest(sel);
  if (direct) return direct;
  const doc = e.target.ownerDocument;
  if (!doc || typeof doc.elementFromPoint !== 'function') return null;
  const at = doc.elementFromPoint(e.clientX, e.clientY);
  return at ? at.closest(sel) : null;
}
