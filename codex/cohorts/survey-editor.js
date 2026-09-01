// codex/cohorts/survey-editor.js
// Editing the instrument: the list mutations, as pure functions over an array of rows.
//
// They live apart from the rendering because they are where the model's rules bite, and rules are
// worth testing without a DOM: track-64 §3.10 allows editing after answers exist but reconciles
// rather than blocks, so a row that already has answers must keep its ID through every reorder and
// every wording change. Losing an id silently re-keys a question and orphans its answers, which no
// error would announce.
//
// A row here is what ct_survey_get returns and what ct_survey_save_questions takes:
// `{ id?, kind, prompt, options?, required }`. A row with no `id` is new; the Worker inserts it.

export const KINDS = ['rating', 'poll', 'wordcloud', 'open'];

// Reordering moves the ROW, id and all. Rebuilding positions from the array index on save is what
// makes this safe: position is derived, never carried, so two rows can never claim the same slot.
export function move(rows, index, delta) {
  const out = (rows || []).slice();
  const to = index + delta;
  if (index < 0 || index >= out.length || to < 0 || to >= out.length) return out;
  const [row] = out.splice(index, 1);
  out.splice(to, 0, row);
  return out;
}

// New rows carry NO id. The Worker treats that as an insert, and anything else would need the
// frontend to invent a key that the database also has to believe.
export function add(rows, kind) {
  const k = KINDS.indexOf(kind) >= 0 ? kind : 'rating';
  const row = { kind: k, prompt: '', required: 1 };
  if (k === 'poll') row.options = ['', ''];
  return (rows || []).concat([row]);
}

// Removing drops the row from the list SENT. The Worker archives whatever is missing, never
// deletes, so the answers behind it survive and still export (§3.10).
export function remove(rows, index) {
  const out = (rows || []).slice();
  if (index >= 0 && index < out.length) out.splice(index, 1);
  return out;
}

// Changing the KIND of a question that already has answers is not an edit, it is a different
// question: §3.10 says the old one is archived and a new one inserted. Dropping the id here is
// what makes that happen, and it is the reason this is a function rather than a field assignment.
export function setKind(rows, index, kind) {
  const out = (rows || []).slice();
  const row = out[index];
  if (!row || KINDS.indexOf(kind) < 0 || row.kind === kind) return out;
  const next = { kind, prompt: row.prompt, required: row.required };
  if (kind === 'poll') next.options = Array.isArray(row.options) && row.options.length >= 2 ? row.options : ['', ''];
  out[index] = next;                       // no id: the old row archives, this one is born
  return out;
}

// Wording and required-ness are FREE, in the design's own words: rows point at a question id, not
// at its text, so the id survives.
export function setField(rows, index, field, value) {
  const out = (rows || []).slice();
  const row = out[index];
  if (!row) return out;
  out[index] = Object.assign({}, row, { [field]: value });
  return out;
}

export function setOption(rows, index, slot, value) {
  const out = (rows || []).slice();
  const row = out[index];
  if (!row) return out;
  const opts = Array.isArray(row.options) ? row.options.slice() : [];
  while (opts.length <= slot) opts.push('');
  opts[slot] = value;
  out[index] = Object.assign({}, row, { options: opts });
  return out;
}

export function addOption(rows, index) {
  const out = (rows || []).slice();
  const row = out[index];
  if (!row) return out;
  const opts = (Array.isArray(row.options) ? row.options.slice() : []).concat(['']);
  out[index] = Object.assign({}, row, { options: opts });
  return out;
}

export function removeOption(rows, index, slot) {
  const out = (rows || []).slice();
  const row = out[index];
  if (!row || !Array.isArray(row.options)) return out;
  const opts = row.options.slice();
  // Two is the floor: a single-option choice is not a choice, and the Worker refuses it anyway.
  if (opts.length <= 2) return out;
  opts.splice(slot, 1);
  out[index] = Object.assign({}, row, { options: opts });
  return out;
}

// What the save button asks before it enables itself. Returns a REASON code or null, mirroring the
// Worker's own refusals so the admin never posts something he can be told about locally.
export function validationError(rows) {
  const list = rows || [];
  if (!list.length) return 'no_instrument';
  for (const r of list) {
    if (KINDS.indexOf(r.kind) < 0) return 'bad_kind';
    if (!r.prompt || !String(r.prompt).trim()) return 'empty_prompt';
    if (r.kind === 'poll') {
      const opts = (r.options || []).map((o) => String(o || '').trim()).filter(Boolean);
      if (opts.length < 2) return 'poll_needs_options';
    }
  }
  // A survey nobody has to answer has no response rate, and the progress bar would sit at 100%
  // before the first tap. This one is ours, not the Worker's.
  if (!list.some((r) => r.required)) return 'nothing_required';
  return null;
}

// The payload, cleaned. Blank option lines are dropped here rather than stored, and `position`
// is not sent at all: the Worker derives it from the order of this array, so the two cannot
// disagree about what "third" means.
export function toPayload(rows) {
  return (rows || []).map((r) => {
    const out = { kind: r.kind, prompt: String(r.prompt || '').trim(), required: r.required ? 1 : 0 };
    if (r.id) out.id = r.id;
    if (r.kind === 'poll') out.options = (r.options || []).map((o) => String(o || '').trim()).filter(Boolean);
    return out;
  });
}
