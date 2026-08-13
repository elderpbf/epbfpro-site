// tests/trilha-tarefas.test.mjs
// Codex Trail · Tarefas tab (track-26 item 2). Unit-tests the DOM-free logic (aula
// grouping/labeling, count label, answer-text extraction) + source-contract assertions
// (self-registers a renderer, reaches the backend only through the facade, routes the new
// tab). The card DOM/click wiring is verified visually on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { aulaLabel, countLabel, sortByAula, anyAulaHasMultiple, statusGroups, answerText, isExpandable, tarefaKind, canSend, deliveries, fill, deliveryWho } from '../trilha/js/tarefas.js';
import { resolveTab } from '../trilha/js/page.js';
import { stampTime } from '../js/rel-time.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── aulaLabel ────────────────────────────────────────────────────────────────
test('aulaLabel: known aula with a title', () => {
  assert.equal(aulaLabel(3, [{ aula_number: 3, title: 'Recursos' }]), 'Aula 3 · Recursos');
});
test('aulaLabel: known aula number with no title falls back to just the number', () => {
  assert.equal(aulaLabel(2, [{ aula_number: 2, title: '' }]), 'Aula 2');
});
test('aulaLabel: null (unbound) resolves to the "no aula" bucket', () => {
  assert.equal(aulaLabel(null, []), 'Outras tarefas');
});

// ── countLabel (singular/plural) ─────────────────────────────────────────────
test('countLabel: singular', () => assert.equal(countLabel(1), '1 tarefa'));
test('countLabel: plural', () => assert.equal(countLabel(3), '3 tarefas'));

// ── sortByAula (course order ascending, unbound last) ────────────────────────
test('sortByAula: ascending by aula, null (unbound) last', () => {
  const tarefas = [
    { item_id: 1, aula_number: 3 },
    { item_id: 2, aula_number: null },
    { item_id: 3, aula_number: 1 },
    { item_id: 4, aula_number: 2 },
  ];
  assert.deepEqual(sortByAula(tarefas).map((t) => t.item_id), [3, 4, 1, 2]);
});
test('sortByAula: returns a copy, does not mutate the input', () => {
  const tarefas = [{ item_id: 1, aula_number: 2 }, { item_id: 2, aula_number: 1 }];
  const out = sortByAula(tarefas);
  assert.notEqual(out, tarefas);
  assert.equal(tarefas[0].item_id, 1); // original order untouched
});

// ── anyAulaHasMultiple (the flat-vs-sections trigger) ────────────────────────
test('anyAulaHasMultiple: false when every aula has at most one tarefa', () => {
  assert.equal(anyAulaHasMultiple([{ aula_number: 1 }, { aula_number: 2 }, { aula_number: null }]), false);
});
test('anyAulaHasMultiple: true when some aula holds two', () => {
  assert.equal(anyAulaHasMultiple([{ aula_number: 1 }, { aula_number: 1 }, { aula_number: 2 }]), true);
});

// ── statusGroups (pending -> submitted -> reviewed, empty dropped, aula asc) ──
test('statusGroups: orders sections pending, enviada, corrigida and drops empties', () => {
  const tarefas = [
    { item_id: 1, aula_number: 2, state: 'corrigida' },
    { item_id: 2, aula_number: 1, state: 'a_enviar' },
    { item_id: 3, aula_number: 3, state: 'a_enviar' },
  ];
  const groups = statusGroups(tarefas);
  assert.deepEqual(groups.map((g) => g.status), ['a_enviar', 'corrigida']); // no 'enviada' section
  assert.deepEqual(groups[0].tarefas.map((t) => t.item_id), [2, 3]); // pending, aula ascending
});

// ── answerText ────────────────────────────────────────────────────────────────
test('answerText: a JSON string value unwraps to plain text', () => {
  assert.equal(answerText({ answer_json: '"minha resposta"' }), 'minha resposta');
});
test('answerText: a non-string JSON value stringifies', () => {
  assert.equal(answerText({ answer_json: '{"a":1}' }), '{"a":1}');
});
test('answerText: no submission -> empty', () => assert.equal(answerText(null), ''));

// The registry writes a PAYLOAD OBJECT, and stringifying it dumped raw JSON on the student's
// own screen (Élder saw {"text":"test"} where his answer should be). Live bug, fixed 2026-07-15.
test('answerText: a text-field payload renders the text, NOT the raw JSON', () => {
  assert.equal(answerText({ answer_json: '{"text":"minha resposta"}' }), 'minha resposta');
});
test('answerText: a plain JSON string still works (open/anonymous path predates the registry)', () => {
  assert.equal(answerText({ answer_json: '"resposta antiga"' }), 'resposta antiga');
});
test('answerText: an unknown payload shape still degrades to JSON rather than blowing up', () => {
  assert.equal(answerText({ answer_json: '{"rating":4}' }), '{"rating":4}');
});

// ── resolveTab knows the tarefas tab ─────────────────────────────────────────
test('resolveTab: #tarefas -> tarefas', () => assert.equal(resolveTab('#tarefas'), 'tarefas'));

// ── tarefaKind / canSend / isExpandable (Élder's semantics, 2026-07-15) ─────
// The tag describes WHAT THE STUDENT DID, and only that. The teacher's words are a MESSAGE,
// not the delivery's state: mixing the two is what made "Corrigida"/"Respondida" impossible
// to name ("responded by whom?").
const feita = (extra) => Object.assign({ item_id: 1, submissions: [{ answer_json: '"x"' }] }, extra || {});

test('tarefaKind: no submission -> nao_respondida', () => {
  assert.equal(tarefaKind({ item_id: 1, submissions: [] }), 'nao_respondida');
});
test('tarefaKind: submitted and the teacher closed it -> respondida', () => {
  assert.equal(tarefaKind(feita({ allow_multi: false })), 'respondida');
});
test('tarefaKind: submitted and can submit again -> de_novo', () => {
  assert.equal(tarefaKind(feita({ allow_multi: true })), 'de_novo');
});
test('tarefaKind: the teacher\'s MESSAGE does NOT change the delivery tag', () => {
  assert.equal(tarefaKind(feita({ allow_multi: false, has_instructor_message: true })), 'respondida');
  assert.equal(tarefaKind(feita({ allow_multi: true, has_instructor_message: true })), 'de_novo');
});

test('canSend: can submit when a response is still missing or when it can go again', () => {
  assert.equal(canSend({ item_id: 1, submissions: [] }), true);        // first response
  assert.equal(canSend(feita({ allow_multi: true })), true);           // submit again
  assert.equal(canSend(feita({ allow_multi: false })), false);         // closed
});

// The delivered card ALWAYS opens. Tying this to allow_multi (as it was for a moment) hid the
// teacher's own reply the instant they closed the task: the opposite of correct.
test('isExpandable: any delivered task opens, even without multiple delivery', () => {
  assert.equal(isExpandable(feita({ allow_multi: false })), true);
});
test('isExpandable: delivered with multiple delivery also opens', () => {
  assert.equal(isExpandable(feita({ allow_multi: true })), true);
});
test('isExpandable: no delivery does not open (there is nothing to read)', () => {
  assert.equal(isExpandable({ item_id: 1, submissions: [] }), false);
});

// The tab has to render correctly even against a Worker that has not been promoted yet.
test('deliveries: falls back to the singular `submission` when the worker is old', () => {
  assert.deepEqual(deliveries({ submission: { answer_json: '"a"' } }), [{ answer_json: '"a"' }]);
  assert.deepEqual(deliveries({ submissions: [], submission: null }), []);
});
test('deliveries: prefers the list when the worker sends one', () => {
  assert.equal(deliveries({ submissions: [{ answer_json: '"n"' }, { answer_json: '"v"' }] }).length, 2);
});

// ── signature + timestamp for each interaction (Élder 2026-07-15) ───────────
test('deliveryWho: signed with the deliverer\'s name', () => {
  assert.equal(deliveryWho({ student_name: 'Ana Prado' }), 'Ana Prado');
});
test('deliveryWho: an anonymous delivery says Anonimo, NOT the session name', () => {
  // The name is missing because the student chose that; the absence is the fact, not a gap to patch.
  assert.equal(deliveryWho({ student_name: null }), 'Anônimo');
  assert.equal(deliveryWho({}), 'Anônimo');
  assert.equal(deliveryWho(null), 'Anônimo');
});

test('fill: swaps the placeholders in the sentence', () => {
  assert.equal(fill('de {who} em {when}', { who: 'Ana', when: '23/06/2026 às 12h26' }),
    'de Ana em 23/06/2026 às 12h26');
});
test('fill: a {token} with no value stays as-is, does not become "undefined"', () => {
  assert.equal(fill('de {who} em {when}', { who: 'Ana' }), 'de Ana em {when}');
});
test('fill: a name containing $& is NOT re-injected by String.replace', () => {
  // Why fill() uses a replacer function instead of a string: '$&' in a string replacement
  // means "the matched span", and the student's name would turn into "{who}" on screen.
  assert.equal(fill('de {who} em x', { who: 'A$&B' }), 'de A$&B em x');
});

test('stampTime: the exact moment, fixed PT-BR format', () => {
  const d = new Date(2026, 5, 23, 12, 26, 0);            // 23/06/2026 12h26, local time
  assert.equal(stampTime(Math.floor(d.getTime() / 1000)), '23/06/2026 às 12h26');
});
test('stampTime: zero-pads day/month/hour/minute', () => {
  const d = new Date(2026, 0, 5, 9, 7, 0);               // 05/01/2026 09h07
  assert.equal(stampTime(Math.floor(d.getTime() / 1000)), '05/01/2026 às 09h07');
});
test('stampTime: no timestamp -> empty, never "Invalid Date" in front of the student', () => {
  assert.equal(stampTime(null), '');
  assert.equal(stampTime(0), '');
  assert.equal(stampTime(undefined), '');
});

// ── source contract ─────────────────────────────────────────────────────────
test('every card interaction is signed and timestamped', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /from '\.\.\/\.\.\/js\/rel-time\.js'/, 'the timestamp comes from the shared module');
  assert.ok(!/toLocaleString/.test(src), 'the card does not format dates on its own');
  assert.match(src, /tarefas\.by_at/, 'the delivery states who and when');
  assert.match(src, /tarefas\.msg_by_at/, 'so does the teacher\'s message');
  assert.match(src, /who: t\('tarefas\.instructor'\)/, 'the teacher signs as Instrutor');
});
test('the button states the VERB, not the state', () => {
  const pt = read('../trilha/i18n.js');
  assert.match(pt, /'tarefas\.badge_unanswered':\s*'Responder'/, 'the button label is the action');
  // The state did not disappear: it lives in the section header, which is the right place for a state.
  assert.match(pt, /'tarefas\.section_pending':\s*'Não respondidas'/, 'the state stays in the section');
});
test('the glyph comes AFTER the text in the button', () => {
  const src = read('../trilha/js/tarefas.js');
  const inner = /const inner = '<span>' \+ esc\(t\(def\.label\)\) \+ '<\/span>' \+ icon;/;
  assert.match(src, inner, 'read the verb first, then see the icon');
});
test('the chevron opens the CARD: it comes before the content and is centered', () => {
  const src = read('../trilha/js/tarefas.js');
  const top = src.slice(src.indexOf("'<div class=\"cdx-tt-top\"'"));
  assert.ok(top.indexOf('chevron +') < top.indexOf('cdx-tt-info'), 'chevron to the left of the content');
  assert.match(src, /cdx-tt-chev--none/, 'the empty slot holds the title alignment');
  const css = read('../trilha/css/tarefas.css');
  assert.match(css, /\.cdx-tt-chev\s*\{[^}]*align-self:\s*center/, 'vertically centered');
});
// ALL tags on the title row, the ACTION always LAST, on the right (Élder 2026-07-15):
// [teacher message] [respond]. Fixed order: the card's right edge is always what does
// something, and what only notifies never occupies that spot.
test('all tags on the title row, the action last', () => {
  const src = read('../trilha/js/tarefas.js');
  const top = src.slice(src.indexOf("'<div class=\"cdx-tt-top\"'"), src.indexOf('function wireList'));
  assert.ok(top.indexOf('cdx-tt-info') < top.indexOf('cdx-tt-tags'), 'the tags close the title row');
  assert.match(top, /cdx-tt-tags">' \+ msgBadgeHtml\(tarefa\) \+ badgeHtml\(tarefa\) \+/, 'message first, action last');
  assert.ok(top.indexOf('chevron +') < top.indexOf('cdx-tt-info'), 'and the chevron still opens from the left');
  const css = read('../trilha/css/tarefas.css');
  assert.match(css, /\.cdx-tt-tags\s*\{[^}]*justify-content:\s*flex-end/, 'the action stays pinned to the right even if the group wraps');
  assert.match(css, /\.cdx-tt-tags\s*\{[^}]*flex-shrink:\s*0/, 'the title gives up width, not the tag');
});
test('long text becomes a window: the clamp is the shared, measured one, not guessed', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /from '\.\.\/\.\.\/js\/clamp\.js'/, 'uses the shared clamp');
  assert.match(src, /wireClamps\(_root, '\[data-tt-text\]'\)/, 'clamps the responses');
  const clamp = read('../js/clamp.js');
  assert.match(clamp, /scrollHeight <= el\.clientHeight/, 'measures real overflow');
  assert.ok(!/length >|charAt|substring/.test(clamp), 'does not guess by character count');
});
test('the delivery text CSS did not become orphaned', () => {
  // The wrapper that scoped these rules died along with subHtml, and the rule scoped to it
  // left the delivery text WITHOUT pre-wrap: the line breaks the student typed disappeared.
  // Comments are stripped before checking, or the test would match its own explanation.
  const css = read('../trilha/css/tarefas.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const js = read('../trilha/js/tarefas.js');
  assert.ok(!/\.cdx-tt-field/.test(css), 'no rule stuck to a selector that no longer exists');
  assert.ok(!/cdx-tt-field/.test(js), 'and the selector is in fact no longer emitted');
  assert.match(css, /^\.cdx-tt-fv\s*\{[^}]*white-space:\s*pre-wrap/m, 'the text respects line breaks');
});

test('the tag IS the button: there is no separate "send another" button anymore', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.ok(!/data-tt-again/.test(src), 'the button below is gone; the tag on top submits');
  assert.match(src, /data-tt-send/, 'the tag is what submits');
  assert.match(src, /stopPropagation/, 'submitting must not close the card');
});
test('the glyphs come from the bank, no invented svg in the card', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /from '\.\.\/\.\.\/js\/glyphs\.js'/, 'imports the glyph bank');
  assert.ok(!/<svg/i.test(src), 'no loose SVG in the card module');
});
test('the plumbing note and the waiting sub-caption are gone', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.ok(!/gate_note/.test(src), 'the plumbing note is gone');
  assert.ok(!/sub_sent|sub_graded|subHtml/.test(src), '"aguardando correção do professor" is gone');
});

test('tarefas.js self-registers a renderer and uses the facade only', () => {
  const src = read('../trilha/js/tarefas.js');
  assert.match(src, /registerRenderer\('tarefas'/, 'registers the tarefas renderer');
  assert.match(src, /from '\.\/api\.js'/, 'imports the Trail facade');
  assert.ok(!/callWorker|window\.WORKER_URL/.test(src), 'never calls the worker transport directly');
});
