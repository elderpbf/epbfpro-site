// codex/js/tarefa-eval.js
// AI synthesis of tarefa (assignment) responses, for the instructor (track-45
// Fatia 1, dev-only preview). Mirrors content/slides/js/ai/aiService.js: pure
// prompt builder + parser, injectable worker/stub factories. The model receives
// ONLY response index + text, never a submission object or a student name:
// anonymity is enforced by construction (the builder reads r.index/r.text
// only), not by convention, so this is tested as a backstop below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvalPrompt,
  buildEvalInput,
  parseEvalResponse,
  makeStubEval,
  makeWorkerEval,
  fitResponsesToBudget,
  SEED_RESPONSES,
} from '../js/tarefa-eval.js';
import * as tarefaEvalView from '../content/tarefa-eval-view.js';
import { t } from '../js/i18n.js';

// ── buildEvalPrompt ──────────────────────────────────────────────────────────
test('buildEvalPrompt: carries the statement + every indexed response + a strict-JSON instruction', () => {
  const responses = [
    { index: 1, text: 'Resposta bem aderente ao enunciado.' },
    { index: 2, text: 'Resposta que diverge totalmente.' },
  ];
  const p = buildEvalPrompt({ statement: 'ENUNCIADO-TESTE-XYZ', responses });
  assert.equal(typeof p.system, 'string');
  assert.ok(Array.isArray(p.messages) && p.messages.length > 0);
  const serialized = JSON.stringify(p);
  assert.ok(serialized.includes('ENUNCIADO-TESTE-XYZ'), 'statement text reaches the prompt');
  assert.ok(serialized.includes('Resposta bem aderente ao enunciado.'), 'response 1 text reaches the prompt');
  assert.ok(serialized.includes('Resposta que diverge totalmente.'), 'response 2 text reaches the prompt');
  assert.ok(serialized.includes('Resposta 1') && serialized.includes('Resposta 2'), 'every response is numbered by its index');
  assert.match(p.system, /JSON estrito/i, 'system prompt demands strict JSON');
});

test('buildEvalPrompt: anonymity backstop, a student_name riding on a response never reaches the prompt', () => {
  const responses = [
    { index: 1, text: 'Texto da resposta um.', student_name: 'Fulano de Tal SECRETO' },
    { index: 2, text: 'Texto da resposta dois.', student_name: 'Beltrana SECRETA' },
  ];
  const p = buildEvalPrompt({ statement: 'Enunciado qualquer.', responses });
  const serialized = JSON.stringify(p);
  assert.ok(!serialized.includes('SECRETO'), 'no student name leaks into the prompt');
  assert.ok(!serialized.includes('SECRETA'), 'no student name leaks into the prompt');
  assert.ok(!serialized.includes('Fulano'), 'no student name leaks into the prompt');
  assert.ok(!serialized.includes('Beltrana'), 'no student name leaks into the prompt');
});

// ── buildEvalInput ───────────────────────────────────────────────────────────
// Real submissions -> the anonymous {index,text} payload the model gets, plus
// the index -> submission-id map the UI needs to click back to the real answer.
test('buildEvalInput: 1-based indexes in array order + idByIndex maps back to the row id', () => {
  const rows = [
    { id: 101, text: 'Primeira resposta.' },
    { id: 202, text: 'Segunda resposta.' },
    { id: 303, text: 'Terceira resposta.' },
  ];
  const out = buildEvalInput(rows);
  assert.deepEqual(out.responses, [
    { index: 1, text: 'Primeira resposta.' },
    { index: 2, text: 'Segunda resposta.' },
    { index: 3, text: 'Terceira resposta.' },
  ]);
  assert.deepEqual(out.idByIndex, { 1: 101, 2: 202, 3: 303 });
});

test('buildEvalInput: tolerates [] and null/undefined, never throws', () => {
  assert.doesNotThrow(() => buildEvalInput([]));
  assert.deepEqual(buildEvalInput([]), { responses: [], idByIndex: {} });
  assert.doesNotThrow(() => buildEvalInput(null));
  assert.deepEqual(buildEvalInput(null), { responses: [], idByIndex: {} });
  assert.doesNotThrow(() => buildEvalInput(undefined));
  assert.deepEqual(buildEvalInput(undefined), { responses: [], idByIndex: {} });
});

test('buildEvalInput: tolerates rows with empty/missing text', () => {
  const out = buildEvalInput([{ id: 1, text: '' }, { id: 2 }, { id: 3, text: null }]);
  assert.deepEqual(out.responses, [
    { index: 1, text: '' },
    { index: 2, text: '' },
    { index: 3, text: '' },
  ]);
  assert.deepEqual(out.idByIndex, { 1: 1, 2: 2, 3: 3 });
});

// Anonymity backstop: rows carrying extra instructor/student fields must never leak
// past buildEvalInput into the model payload. Object.keys pins the shape to exactly
// {index,text}, and re-running the anonymized responses through buildEvalPrompt
// confirms no name text reaches the actual prompt sent to the model.
test('buildEvalInput: anonymity backstop, only index/text keys survive into responses[]', () => {
  const rows = [
    { id: 11, text: 'Resposta um.', student_name: 'Fulano SECRETO', grade: 10, instructor_reply: 'ótimo' },
    { id: 22, text: 'Resposta dois.', student_name: 'Beltrana SECRETA', grade: 7, instructor_reply: 'revisar' },
  ];
  const out = buildEvalInput(rows);
  out.responses.forEach((r) => {
    assert.deepEqual(Object.keys(r), ['index', 'text']);
  });
  const prompt = buildEvalPrompt({ statement: 'Enunciado.', responses: out.responses });
  const serialized = JSON.stringify(prompt);
  assert.ok(!serialized.includes('SECRETO'), 'no student name leaks into the prompt');
  assert.ok(!serialized.includes('SECRETA'), 'no student name leaks into the prompt');
  assert.ok(!serialized.includes('ótimo'), 'no instructor reply leaks into the prompt');
  assert.ok(!serialized.includes('revisar'), 'no instructor reply leaks into the prompt');
});

// ── parseEvalResponse ────────────────────────────────────────────────────────
test('parseEvalResponse: parses a ```json-fenced blob into {groups:{adherent,point,diverged}}', () => {
  const text = '```json\n{"adherent":[1,2],"point":[3],"diverged":[4],"notes":{"3":"levanta um ponto"}}\n```';
  const out = parseEvalResponse(text);
  assert.deepEqual(out.groups, { adherent: [1, 2], point: [3], diverged: [4] });
  assert.equal(out.notes['3'], 'levanta um ponto');
});

test('parseEvalResponse: parses raw JSON without fences', () => {
  const out = parseEvalResponse('{"adherent":[1],"point":[],"diverged":[2]}');
  assert.deepEqual(out.groups, { adherent: [1], point: [], diverged: [2] });
});

test('parseEvalResponse: garbage input returns {error}, never throws', () => {
  assert.doesNotThrow(() => parseEvalResponse('isto nao e json nenhum'));
  const out = parseEvalResponse('isto nao e json nenhum');
  assert.equal(typeof out.error, 'string');
  assert.doesNotThrow(() => parseEvalResponse(''));
  assert.doesNotThrow(() => parseEvalResponse(null));
  assert.equal(typeof parseEvalResponse('').error, 'string');
  assert.equal(typeof parseEvalResponse(null).error, 'string');
});

// Real failure seen on the staging preview 2026-07-19: gemini-2.5-flash spends
// "thinking" tokens out of the SAME maxOutputTokens budget and the chat path does
// not force responseMimeType json, so a small budget cuts the reply mid-JSON and
// the closing fence never arrives. The body before the cut was perfectly valid.
test('parseEvalResponse: an UNCLOSED ```json fence still parses when the JSON body is complete', () => {
  const text = '```json\n{"adherent":[1,2,3,6],"point":[4,5],"diverged":[7,8]}';
  const out = parseEvalResponse(text);
  assert.deepEqual(out.groups, { adherent: [1, 2, 3, 6], point: [4, 5], diverged: [7, 8] });
});

test('parseEvalResponse: a genuinely truncated reply returns {error} carrying the length, never throws', () => {
  const text = '```json\n{"adherent":[1,2,3,6],"point":[4,5],"notes":{"4":"comeca aqui e corta';
  assert.doesNotThrow(() => parseEvalResponse(text));
  const out = parseEvalResponse(text);
  assert.equal(typeof out.error, 'string');
  assert.match(out.error, /\d+\s*chars/, 'the error reports the reply length, so a truncation is diagnosable from the debug pill');
});

// A class big enough that a readability floor would exceed the even share is exactly
// where max(floor, share) blew the ceiling again (~77+ long answers). The guarantee is
// unconditional, so this asserts the REAL worker ceiling, not just our own limit.
test('fitResponsesToBudget: stays under the worker ceiling even for a very large class', () => {
  const responses = Array.from({ length: 200 }, (_, i) => ({ index: i + 1, text: 'x'.repeat(2000) }));
  const fit = fitResponsesToBudget({ statement: 'y'.repeat(9000), responses });
  const prompt = buildEvalPrompt({ statement: fit.statement, responses: fit.responses });
  const total = prompt.messages.reduce((sum, m) => sum + m.content.length, 0);
  assert.ok(total <= 19000, 'fitted prompt must respect the requested limit, got ' + total);
  assert.ok(total <= 20000, 'and must never exceed the real ai_chat ceiling of 20000');
  assert.equal(fit.belowFloor, true, 'reports that answers were cut below the readability floor');
});

// ── makeStubEval ─────────────────────────────────────────────────────────────
test('makeStubEval: resolves to a valid canned {groups:{adherent,point,diverged}} shape', async () => {
  const evalFn = makeStubEval();
  assert.equal(typeof evalFn, 'function');
  const out = await evalFn({ statement: 'x', responses: [] });
  assert.ok(Array.isArray(out.groups.adherent));
  assert.ok(Array.isArray(out.groups.point));
  assert.ok(Array.isArray(out.groups.diverged));
});

// ── makeWorkerEval ───────────────────────────────────────────────────────────
test('makeWorkerEval: injected aiChat returning a fenced JSON reply resolves to parsed groups', async () => {
  const fakeChat = async () => ({ text: '```json\n{"adherent":[1],"point":[2],"diverged":[]}\n```' });
  const evalFn = makeWorkerEval(fakeChat);
  const out = await evalFn({ statement: 'S', responses: [{ index: 1, text: 'a' }, { index: 2, text: 'b' }] });
  assert.deepEqual(out.groups, { adherent: [1], point: [2], diverged: [] });
});

// Regression guard for the 2026-07-19 truncation: max_tokens:900 was BELOW the
// worker's own default (2000) and gemini-2.5-flash burns thinking tokens from the
// same budget, so the JSON was cut off. Never ask for less than the worker default.
test('makeWorkerEval: asks the worker for a generous output budget (thinking tokens come out of it)', async () => {
  let seen = null;
  const fakeChat = async (p) => { seen = p; return { text: '{"adherent":[1],"point":[],"diverged":[]}' }; };
  await makeWorkerEval(fakeChat)({ statement: 'S', responses: [{ index: 1, text: 'a' }] });
  assert.ok(seen && seen.max_tokens >= 2000, 'max_tokens must not sit below the worker default of 2000');
});

// Regression guard for the live 2026-07-19 error: "ai_chat: messages exceed 20000
// char total limit". makeWorkerEval must fit the prompt to the worker's REAL
// ceiling (verified codex-api/src/ai.js:363-373: messages content total <= 20000,
// system is separate and capped at 10000) before ever calling aiChat, even when
// the caller hands it a huge, untruncated set of real answers.
test('makeWorkerEval: a huge input still calls aiChat with a payload under the worker\'s 20000-char ceiling', async () => {
  let seen = null;
  const fakeChat = async (p) => { seen = p; return { text: '{"adherent":[1],"point":[],"diverged":[]}' }; };
  const statement = 'E'.repeat(9000);
  const responses = Array.from({ length: 40 }, (_, i) => ({ index: i + 1, text: 'R'.repeat(2000) }));
  await makeWorkerEval(fakeChat)({ statement, responses });
  assert.ok(seen, 'aiChat was called');
  const totalChars = seen.messages.reduce((sum, m) => sum + (m.content || '').length, 0);
  assert.ok(totalChars <= 20000, 'total message content stays under the worker ceiling: ' + totalChars);
});

test('makeWorkerEval: injected aiChat resolving to null (rate-limit) resolves to {error}, never throws', async () => {
  const fakeChat = async () => null;
  const evalFn = makeWorkerEval(fakeChat);
  await assert.doesNotReject(async () => {
    const out = await evalFn({ statement: 'S', responses: [] });
    assert.equal(typeof out.error, 'string');
  });
});

// ── SEED_RESPONSES (TEST FIXTURE ONLY, never wired into a UI path) ───────────
// Élder's rule (verbatim intent, track-45 fix): "Essa opção de teste só pode
// existir enquanto a gente estiver aqui. Em produção não pode existir. Ele só
// vai dizer que não houve respostas e não vai fazer." So this fixture is
// exercised HERE and nowhere else: content/tarefas.js no longer imports it, and
// tarefa-eval-view.js renders no run button at all when there are zero real
// answers (see the view test below).
test('SEED_RESPONSES: a realistic PT-BR statement + a varied set of responses (6-8)', () => {
  assert.equal(typeof SEED_RESPONSES.statement, 'string');
  assert.ok(SEED_RESPONSES.statement.length > 20);
  assert.ok(Array.isArray(SEED_RESPONSES.responses));
  assert.ok(SEED_RESPONSES.responses.length >= 6 && SEED_RESPONSES.responses.length <= 8);
  SEED_RESPONSES.responses.forEach((r) => {
    assert.equal(typeof r.index, 'number');
    assert.equal(typeof r.text, 'string');
    assert.ok(r.text.length > 0);
  });
});

// ── fitResponsesToBudget ──────────────────────────────────────────────────────
// The worker's ai_chat hard-caps total message content at 20000 chars (system is
// separate and capped at 10000, verified codex-api/src/ai.js:363-373, so it never
// counts here). Before the model ever sees the prompt, fitResponsesToBudget trims
// statement + responses so the built message stays inside that ceiling, WITHOUT
// touching what the view shows (the view always keeps the full text).
test('fitResponsesToBudget: short input passes through untouched (truncatedCount === 0)', () => {
  const statement = 'Enunciado curto.';
  const responses = [
    { index: 1, text: 'Resposta curta um.' },
    { index: 2, text: 'Resposta curta dois.' },
  ];
  const out = fitResponsesToBudget({ statement, responses });
  assert.equal(out.truncatedCount, 0);
  assert.equal(out.statement, statement);
  assert.deepEqual(out.responses, responses);
});

test('fitResponsesToBudget: a statement longer than statementMax is capped', () => {
  const longStatement = 'x'.repeat(5000);
  const out = fitResponsesToBudget({
    statement: longStatement,
    responses: [{ index: 1, text: 'a' }],
    statementMax: 3000,
  });
  assert.ok(out.statement.length <= 3000, 'statement never exceeds statementMax');
  assert.equal(out.statement.length, 3000);
});

test('fitResponsesToBudget: returned responses carry ONLY index/text keys (anonymity backstop through fitting)', () => {
  const responses = [
    { index: 1, text: 'a'.repeat(50), student_name: 'Fulano SECRETO' },
    { index: 2, text: 'b'.repeat(50), student_name: 'Beltrana SECRETA' },
  ];
  const out = fitResponsesToBudget({ statement: 'Enunciado.', responses });
  out.responses.forEach((r) => assert.deepEqual(Object.keys(r), ['index', 'text']));
  const serialized = JSON.stringify(out.responses);
  assert.ok(!serialized.includes('SECRETO') && !serialized.includes('SECRETA'), 'no student name survives fitting');
});

// Regression guard for the live 2026-07-19 error: "ai_chat: messages exceed 20000
// char total limit". A real tarefa with many long real answers must never build a
// prompt bigger than the worker's hard ceiling.
test('fitResponsesToBudget: pathological input (40 responses x 2000 chars + 9000-char statement) fits the worker ceiling', () => {
  const statement = 'E'.repeat(9000);
  const responses = Array.from({ length: 40 }, (_, i) => ({ index: i + 1, text: 'R'.repeat(2000) }));
  const out = fitResponsesToBudget({ statement, responses });
  assert.ok(out.truncatedCount > 0, 'some responses were actually shortened');
  const prompt = buildEvalPrompt({ statement: out.statement, responses: out.responses });
  assert.ok(prompt.messages[0].content.length <= 19000, 'fitted prompt stays under the 19000 budget: got ' + prompt.messages[0].content.length);
});

// ── tarefa-eval-view: zero real answers ──────────────────────────────────────
// Élder's rule (verbatim intent): "Essa opção de teste só pode existir enquanto a
// gente estiver aqui. Em produção não pode existir. Ele só vai dizer que não
// houve respostas e não vai fazer." With zero real answers the AI must be
// STRUCTURALLY uncallable: no run button renders at all, not merely a disabled one.
function _fakeViewEl() {
  return {
    _html: '',
    set innerHTML(v) { this._html = String(v); },
    get innerHTML() { return this._html; },
    addEventListener() {},
    removeEventListener() {},
  };
}

test('tarefa-eval-view mount: zero responses renders the no-answers message and NO run button', () => {
  const el = _fakeViewEl();
  tarefaEvalView.mount(el, { statement: 'Enunciado.', responses: [], evalFn: async () => ({ groups: { adherent: [], point: [], diverged: [] } }) });
  assert.ok(!/data-act="run"/.test(el.innerHTML), 'no run button rendered when there are zero real answers');
  assert.notEqual(t('tarefas.eval_no_answers'), 'tarefas.eval_no_answers', 'eval_no_answers resolves to a real translation, not the raw key');
  assert.ok(el.innerHTML.includes(t('tarefas.eval_no_answers')), 'the no-answers message renders');
  tarefaEvalView.unmount();
});

test('tarefa-eval-view mount: at least one response still renders the run button (no regression)', () => {
  const el = _fakeViewEl();
  tarefaEvalView.mount(el, {
    statement: 'Enunciado.',
    responses: [{ index: 1, text: 'Resposta.' }],
    evalFn: async () => ({ groups: { adherent: [1], point: [], diverged: [] } }),
  });
  assert.ok(/data-act="run"/.test(el.innerHTML), 'run button still renders when there is at least one real answer');
  tarefaEvalView.unmount();
});
