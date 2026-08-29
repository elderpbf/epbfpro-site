// codex/cohorts/survey-stats.js
// Stored survey rows, in the shape questions/question-render.js already draws.
//
// This is an ADAPTER and deliberately not a second chart library: track-64 §3.3
// chose the questions tab's `kind` vocabulary (`rating` | `poll` | `wordcloud` |
// `open`) precisely so the JFSE-style average-plus-bars Élder recognises comes from
// the renderer that already exists. Everything here is pure; the drawing happens in
// survey.js, which hands the output straight to renderResults().
//
// Two traps are closed here, both of which fail SILENTLY rather than throwing:
//   - `poll` wants `options` as an ARRAY with a parallel `counts` array; `rating`
//     wants `options` as `{min,max}` and reads the values off `text_answers`.
//     Handing one shape to the other renders zero bars and no error.
//   - a text answer NEVER carries `name`, so renderTextFeed falls back to
//     t('questions.qr_anonymous'), which IS the anonymous display §3.4 item 7 asks
//     for. The caller must not pass `onRemoveAnswer` either, or the same seam wires
//     a delete-one-answer button onto an anonymous response.
//
// An ANSWER row is `{ question_id, answer_num, answer_text }`, one per person per
// question (§3.3), which is what lets each question carry its own denominator.

const SCALE_MIN = 1;
const SCALE_MAX = 5;

function optionsOf(q) {
  const o = (q && q.options) || null;
  return Array.isArray(o) ? o : [];
}

function boundsOf(q) {
  const o = (q && q.options) || {};
  return {
    min: Number.isFinite(o.min) ? o.min : SCALE_MIN,
    max: Number.isFinite(o.max) ? o.max : SCALE_MAX,
  };
}

export function answersFor(rows, questionId) {
  return (rows || []).filter((r) => r && r.question_id === questionId);
}

// The average a `rating` item reports. Returned separately from the render shape
// because the tab's summary line wants it before any chart is drawn; the renderer
// computes its own from the same values, so the two cannot disagree.
// A NULL answer_num is "did not answer this one", and it has to be rejected BEFORE
// Number() sees it: Number(null) is 0, which is finite, so a skipped question would
// be averaged in as a zero and drag every score down. A rating row can legitimately
// carry a null here (§3.3 stores one row per question, so a person who skipped one
// still has rows for the rest).
export function average(rows) {
  let sum = 0, n = 0;
  (rows || []).forEach((r) => {
    if (!r || r.answer_num == null || r.answer_num === '') return;
    const v = Number(r.answer_num);
    if (Number.isFinite(v)) { sum += v; n += 1; }
  });
  return n ? sum / n : null;
}

// One question, ready to draw: `{ question, counts, answered }`, where `question`
// and `counts` are exactly renderResults()'s first two arguments.
export function statsFor(q, rows) {
  const mine = answersFor(rows, q && q.id);
  const kind = (q && q.kind) || 'open';
  const text = (q && q.prompt) || '';

  if (kind === 'poll') {
    const options = optionsOf(q);
    const picked = mine.map((r) => String(r.answer_text == null ? '' : r.answer_text));
    const counts = options.map((opt) => picked.filter((p) => p === opt).length);
    // voter_count is the denominator renderBarChart prefers over the summed counts,
    // which matters the moment an answer falls outside the option list ("Outro").
    return {
      question: { type: 'poll', text, options, voter_count: mine.length },
      counts,
      answered: mine.length,
      avg: null,
    };
  }

  if (kind === 'rating') {
    const b = boundsOf(q);
    const text_answers = mine
      .filter((r) => r.answer_num != null && r.answer_num !== '' && Number.isFinite(Number(r.answer_num)))
      .map((r) => ({ value: Number(r.answer_num) }));
    return {
      question: { type: 'rating', text, options: b, text_answers },
      counts: null,
      answered: text_answers.length,
      avg: average(mine),
    };
  }

  // wordcloud and open both read `text_answers`, and neither carries a name.
  const text_answers = mine
    .filter((r) => String(r.answer_text == null ? '' : r.answer_text).trim() !== '')
    .map((r) => ({ value: String(r.answer_text) }));
  return {
    question: { type: kind === 'wordcloud' ? 'wordcloud' : 'open', text, text_answers },
    counts: null,
    answered: text_answers.length,
    avg: null,
  };
}

// How many DISTINCT people answered at all, which is the survey's headline rate.
// Counted from the response rows rather than trusted from a column, so it cannot
// disagree with what the per-question denominators add up to.
export function respondents(rows) {
  const seen = new Set();
  (rows || []).forEach((r) => { if (r && r.participant_id != null) seen.add(r.participant_id); });
  return seen.size;
}
