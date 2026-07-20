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
  measureEvalPayload,
  reconcileGroups,
  hashText,
  buildFingerprint,
  groupsToIds,
  groupsFromIds,
  makeEvalCache,
  AI_CHAT_MAX_CHARS,
  EVAL_MODEL,
  EVAL_PROVIDER,
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

// Was: "a truncated reply returns {error}". Superseded 2026-07-20. A reply cut inside
// a note now RECOVERS, because the groups are emitted before the notes and losing an
// explanatory tail is not a reason to throw the whole classification away.
test('parseEvalResponse: a reply truncated inside a note recovers the classification, never throws', () => {
  const text = '```json\n{"adherent":[1,2,3,6],"point":[4,5],"notes":{"4":"comeca aqui e corta';
  assert.doesNotThrow(() => parseEvalResponse(text));
  const out = parseEvalResponse(text);
  assert.ok(!out.error);
  assert.deepEqual(out.groups.adherent, [1, 2, 3, 6]);
  assert.equal(out.repaired, true);
});

test('parseEvalResponse: an unrecoverable reply still reports its length, for the debug pill', () => {
  const out = parseEvalResponse('{"adherent":[1,2,');
  assert.equal(typeof out.error, 'string');
  assert.match(out.error, /\d+\s*chars/, 'the error reports the reply length, so a truncation is diagnosable');
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

// Successor to the 2026-07-19 regression guard ("ai_chat: messages exceed 20000
// char total limit"). That error was our OWN validation constant, and the fix then
// was to truncate. Élder overruled it ("não podemos perder conteúdo"), so the wall
// moved instead: ai_chat now takes a per-call max_chars. The guard is no longer
// "did we cut it down" but "did we send it whole AND raise the budget to match".
test('makeWorkerEval: a huge cohort goes to the worker WHOLE, with the budget raised to match', async () => {
  let seen = null;
  const fakeChat = async (p) => { seen = p; return { text: '{"adherent":[1],"point":[],"diverged":[]}' }; };
  const statement = 'E'.repeat(9000);
  const responses = Array.from({ length: 40 }, (_, i) => ({ index: i + 1, text: 'R'.repeat(2000) }));
  await makeWorkerEval(fakeChat)({ statement, responses });
  assert.ok(seen, 'aiChat was called');
  const totalChars = seen.messages.reduce((sum, m) => sum + (m.content || '').length, 0);
  assert.ok(totalChars > 20000, 'the payload really is past the old wall: ' + totalChars);
  assert.ok(totalChars <= seen.max_chars, 'and the call raised max_chars to cover it');
  assert.ok(seen.messages[0].content.includes('R'.repeat(2000)), 'every answer went in full');
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

test('tarefa-eval-view mount: with answers there is a redo button and NO synthesize button', () => {
  const el = _fakeViewEl();
  tarefaEvalView.mount(el, {
    statement: 'Enunciado.',
    responses: [{ index: 1, text: 'Resposta.' }],
    evalFn: async () => ({ groups: { adherent: [1], point: [], diverged: [] } }),
  });
  assert.ok(!/data-act="run"/.test(el.innerHTML), 'the "sintetizar" button is gone: opening is the trigger');
  assert.ok(/data-act="redo"/.test(el.innerHTML), 'the redo escape hatch renders');
  assert.ok(el.innerHTML.includes(t('tarefas.eval_redo_hint')), 'redo carries the "from zero" tooltip');
  tarefaEvalView.unmount();
});

// ── the missing root brace ───────────────────────────────────────────────────
// Reproduced live on staging 2026-07-20: qwen3-30b-a3b intermittently omits the
// FINAL '}' (1 in 6 real calls). The old greedy /\{[\s\S]*\}/ then matched up to the
// closing brace of the nested "notes" object, handing JSON.parse a span that could
// never parse. Verbatim tail of the failing reply is reproduced here.
test('parseEvalResponse: a reply missing only the final root brace is repaired, not rejected', () => {
  const reply = '{"adherent":[1,2,3,5,6],"point":[4],"diverged":[7,8],"notes":' +
    '{"4":"levanta um ponto relevante sobre o art. 39 do CDC",' +
    '"8":"desvia completamente do pedido, demonstrando falta de tentativa de resposta com base no direito aplicável"}';
  const out = parseEvalResponse(reply);
  assert.ok(!out.error, 'must parse: every field is present, only the closing brace is missing');
  assert.deepEqual(out.groups, { adherent: [1, 2, 3, 5, 6], point: [4], diverged: [7, 8] });
  assert.equal(out.notes['8'].includes('aplicável'), true);
  assert.equal(out.repaired, true, 'the repair is reported, not hidden');
});

// The second live shape: cut INSIDE a note's string. Braces alone cannot save it,
// because the scanner is still inside an unterminated string. The groups are emitted
// before notes, so the classification survives and only one note loses its tail.
test('parseEvalResponse: a reply cut mid-note recovers the full classification', () => {
  const reply = '{"adherent":[1,2,3,5,6],"point":[4],"diverged":[7,8],"notes":' +
    '{"4":"levanta um ponto relevante sobre o art. 39 do CDC","8":"desvia completa';
  const out = parseEvalResponse(reply);
  assert.ok(!out.error, 'the classification must survive a cut inside a note');
  assert.deepEqual(out.groups, { adherent: [1, 2, 3, 5, 6], point: [4], diverged: [7, 8] });
  assert.equal(out.repaired, true);
  assert.equal(out.notes['4'], 'levanta um ponto relevante sobre o art. 39 do CDC', 'the intact note is untouched');
});

// The repair must never invent a classification out of a cut it cannot read.
test('parseEvalResponse: a cut mid-array still errors rather than guessing', () => {
  const out = parseEvalResponse('{"adherent":[1,2,');
  assert.equal(typeof out.error, 'string');
});

test('makeWorkerEval: an unparseable reply is retried exactly once, then succeeds', async () => {
  let n = 0;
  const fakeChat = async () => {
    n++;
    return { text: n === 1 ? 'desculpe, nao consegui' : '{"adherent":[1],"point":[],"diverged":[]}' };
  };
  const out = await makeWorkerEval(fakeChat)({ statement: 'S', responses: [{ index: 1, text: 'a' }] });
  assert.equal(n, 2, 'exactly one retry');
  assert.deepEqual(out.groups, { adherent: [1], point: [], diverged: [] });
});

test('makeWorkerEval: two unparseable replies give up instead of looping', async () => {
  let n = 0;
  const fakeChat = async () => { n++; return { text: 'nao e json' }; };
  const out = await makeWorkerEval(fakeChat)({ statement: 'S', responses: [{ index: 1, text: 'a' }] });
  assert.equal(n, 2, 'one retry, never a loop');
  assert.equal(typeof out.error, 'string');
});

test('parseEvalResponse: a well-formed reply is NOT flagged as repaired', () => {
  const out = parseEvalResponse('{"adherent":[1],"point":[],"diverged":[],"notes":{"1":"ok"}}');
  assert.ok(!out.error);
  assert.equal(out.repaired, undefined);
});

// A '}' inside a note's text must not be mistaken for the end of the object, which
// is exactly what a brace counter that ignores strings would do.
test('parseEvalResponse: a brace inside a note string does not end the object early', () => {
  const out = parseEvalResponse('{"adherent":[1],"point":[],"diverged":[],"notes":{"1":"cita o trecho } e segue"}}');
  assert.ok(!out.error);
  assert.deepEqual(out.groups.adherent, [1]);
  assert.equal(out.notes['1'], 'cita o trecho } e segue');
});

test('parseEvalResponse: an escaped quote inside a note does not break string tracking', () => {
  const out = parseEvalResponse('{"adherent":[1],"point":[],"diverged":[],"notes":{"1":"diz \\"abusiva\\" e para"}}');
  assert.ok(!out.error);
  assert.equal(out.notes['1'], 'diz "abusiva" e para');
});

// ── no truncation: measure, do not cut ───────────────────────────────────────
// Élder: "pq cortar, pa não pode mandar tudo?; não podemos perder conteúdo".
// The old 20000 wall was our OWN validation constant in codex-api, not a model
// limit. It is now a per-call `max_chars` (default 20000, ceiling 200000), so the
// whole cohort goes in one comparative pass and nothing is trimmed.

test('measureEvalPayload: counts exactly what the worker counts (messages only, system excluded)', () => {
  const statement = 'Enunciado.';
  const responses = [{ index: 1, text: 'a'.repeat(100) }, { index: 2, text: 'b'.repeat(100) }];
  const built = buildEvalPrompt({ statement, responses });
  const m = measureEvalPayload({ statement, responses });
  assert.equal(m.chars, built.messages.reduce((s, x) => s + x.content.length, 0));
  assert.ok(m.chars < built.system.length + m.chars, 'system is a separate budget and must not be counted');
  assert.equal(m.fits, true);
  assert.equal(m.limit, AI_CHAT_MAX_CHARS);
});

// The exact cohort that used to force truncation now fits with room to spare.
test('measureEvalPayload: 40 answers x 2000 chars + a 9000-char statement now FITS, no cutting needed', () => {
  const statement = 'E'.repeat(9000);
  const responses = Array.from({ length: 40 }, (_, i) => ({ index: i + 1, text: 'R'.repeat(2000) }));
  const m = measureEvalPayload({ statement, responses });
  assert.ok(m.chars > 20000, 'this really is past the OLD 20000 wall: ' + m.chars);
  assert.equal(m.fits, true, 'and it fits comfortably under the raised ceiling');
});

test('makeWorkerEval: sends every answer byte-for-byte, never truncated', async () => {
  let seen = null;
  const fakeChat = async (p) => { seen = p; return { text: '{"adherent":[1,2],"point":[],"diverged":[]}' }; };
  const long = 'Z'.repeat(9000);
  const responses = [{ index: 1, text: long }, { index: 2, text: long }];
  await makeWorkerEval(fakeChat)({ statement: 'S', responses });
  const sent = seen.messages.map((m) => m.content).join('');
  assert.ok(sent.includes(long), 'the full answer text reaches the model');
  assert.ok(!sent.includes('…'), 'no ellipsis: nothing was shortened');
});

test('makeWorkerEval: raises max_chars and pins the benchmarked model', async () => {
  let seen = null;
  const fakeChat = async (p) => { seen = p; return { text: '{"adherent":[1],"point":[],"diverged":[]}' }; };
  await makeWorkerEval(fakeChat)({ statement: 'S', responses: [{ index: 1, text: 'a' }] });
  assert.equal(seen.max_chars, AI_CHAT_MAX_CHARS);
  assert.equal(seen.provider, EVAL_PROVIDER);
  assert.equal(seen.openrouter_model, EVAL_MODEL);
});

// Refusing beats a silently lossy synthesis: if a cohort really is bigger than the
// raised ceiling, say so and do not call the AI at all.
test('makeWorkerEval: a cohort past the ceiling errors out WITHOUT calling the AI', async () => {
  let called = 0;
  const fakeChat = async () => { called++; return { text: '{}' }; };
  const responses = Array.from({ length: 200 }, (_, i) => ({ index: i + 1, text: 'x'.repeat(2000) }));
  const out = await makeWorkerEval(fakeChat)({ statement: 'y'.repeat(9000), responses });
  assert.equal(out.error, 'payload_too_large');
  assert.ok(out.chars > AI_CHAT_MAX_CHARS);
  assert.equal(called, 0, 'the AI must never be called with a payload we know will be rejected');
});

// Fail clean, Élder's rule (2026-07-20): if the pinned call fails, error out. No
// silent retry against the unpinned default chain, which the benchmark measured as
// less reliable (free gemini: 75% run-to-run noise, unpredictable HTTP 503).
test('makeWorkerEval: a failing pinned call fails clean, no silent retry on the default chain', async () => {
  let calls = 0;
  const fakeChat = async () => { calls++; throw new Error('openrouter down'); };
  const out = await makeWorkerEval(fakeChat)({ statement: 'S', responses: [{ index: 1, text: 'a' }] });
  assert.equal(calls, 1, 'exactly one attempt, no fallback retry');
  assert.equal(out.error, 'openrouter down');
});

// A structured worker error carrying `insufficient_credits` (codex-api's aiChat
// categorization of an OpenRouter HTTP 402) must read as its own distinct code, so
// the instructor is told to top up credits instead of "try again later".
test('makeWorkerEval: an insufficient-credits failure is reported distinctly', async () => {
  const fakeChat = async () => { const e = new Error('HTTP 402'); e.data = { error: 'HTTP 402', insufficient_credits: true }; throw e; };
  const out = await makeWorkerEval(fakeChat)({ statement: 'S', responses: [{ index: 1, text: 'a' }] });
  assert.equal(out.error, 'credits_exhausted');
});

// The codex-api.js facade already converts a worker `rate_limited` error into a
// resolved `null` before it ever throws (see ai.chat's own .catch). This guards a
// caller that injects aiChat directly instead, so the code still lands correctly.
test('makeWorkerEval: a thrown rate_limited error is still reported as rate_limited', async () => {
  const fakeChat = async () => { const e = new Error('no keys'); e.data = { error: 'no keys', rate_limited: true }; throw e; };
  const out = await makeWorkerEval(fakeChat)({ statement: 'S', responses: [{ index: 1, text: 'a' }] });
  assert.equal(out.error, 'rate_limited');
});

// ── reconcileGroups: no silent drops ─────────────────────────────────────────
test('reconcileGroups: reports answers the model forgot instead of letting them vanish', () => {
  const responses = [{ index: 1 }, { index: 2 }, { index: 3 }].map((r) => ({ ...r, text: 'x' }));
  const out = reconcileGroups({ groups: { adherent: [1], point: [], diverged: [] }, responses });
  assert.deepEqual(out.missing, [2, 3]);
  assert.equal(out.total, 3);
  assert.equal(out.classified, 1);
});

test('reconcileGroups: drops invented indexes and duplicates', () => {
  const responses = [{ index: 1, text: 'x' }, { index: 2, text: 'y' }];
  const out = reconcileGroups({ groups: { adherent: [1, 1, 99], point: [2], diverged: [2] }, responses });
  assert.deepEqual(out.groups.adherent, [1], 'no duplicate, no index 99 that never existed');
  assert.deepEqual(out.groups.point, [2]);
  assert.deepEqual(out.groups.diverged, [], 'the second claim on index 2 loses');
  assert.deepEqual(out.missing, []);
});

// ── fingerprint: what counts as "nothing changed" ────────────────────────────
test('hashText: stable for the same input, different when the text changes', () => {
  assert.equal(hashText('abc'), hashText('abc'));
  assert.notEqual(hashText('abc'), hashText('abd'));
  assert.equal(hashText(null), hashText(''));
});

test('buildFingerprint: identical input -> identical fingerprint', () => {
  const rows = [{ id: 7, text: 'um' }, { id: 9, text: 'dois' }];
  assert.equal(buildFingerprint({ statement: 'E', rows }), buildFingerprint({ statement: 'E', rows }));
});

// The one that is easy to forget: editing the enunciado invalidates the synthesis
// even when every answer is byte-identical. Without this, a stale result shows as fresh.
test('buildFingerprint: editing the STATEMENT invalidates, even with identical answers', () => {
  const rows = [{ id: 7, text: 'um' }];
  assert.notEqual(buildFingerprint({ statement: 'E1', rows }), buildFingerprint({ statement: 'E2', rows }));
});

test('buildFingerprint: editing one answer invalidates; merely reordering does not', () => {
  const a = [{ id: 7, text: 'um' }, { id: 9, text: 'dois' }];
  const edited = [{ id: 7, text: 'um EDITADO' }, { id: 9, text: 'dois' }];
  const reordered = [{ id: 9, text: 'dois' }, { id: 7, text: 'um' }];
  assert.notEqual(buildFingerprint({ statement: 'E', rows: a }), buildFingerprint({ statement: 'E', rows: edited }));
  assert.equal(buildFingerprint({ statement: 'E', rows: a }), buildFingerprint({ statement: 'E', rows: reordered }),
    'display order is not a change; a cache must not be thrown away for it');
});

test('buildFingerprint: a new answer invalidates', () => {
  const a = [{ id: 7, text: 'um' }];
  const b = [{ id: 7, text: 'um' }, { id: 8, text: 'novo' }];
  assert.notEqual(buildFingerprint({ statement: 'E', rows: a }), buildFingerprint({ statement: 'E', rows: b }));
});

// ── index space vs submission-id space ───────────────────────────────────────
test('groupsToIds -> groupsFromIds: round-trips through submission ids', () => {
  const idByIndex = { 1: 101, 2: 102, 3: 103 };
  const groups = { adherent: [1, 3], point: [2], diverged: [] };
  const notes = { 2: 'levanta um ponto' };
  const stored = groupsToIds({ groups, notes, idByIndex });
  assert.deepEqual(stored.groupsById.adherent, [101, 103]);
  assert.deepEqual(stored.notesById, { 102: 'levanta um ponto' });
  const back = groupsFromIds({ ...stored, idByIndex });
  assert.deepEqual(back.groups, groups);
  assert.deepEqual(back.notes, notes);
});

// THE reason the cache is keyed by id. A new answer arriving FIRST renumbers every
// index; an index-keyed cache would then label the wrong answers, silently.
test('groupsFromIds: a new answer shifting every index still maps to the RIGHT answers', () => {
  const before = { 1: 101, 2: 102 };
  const stored = groupsToIds({ groups: { adherent: [1], point: [2], diverged: [] }, notes: {}, idByIndex: before });
  // answer 100 arrives and sorts first: 101 is now index 2, 102 is now index 3
  const after = { 1: 100, 2: 101, 3: 102 };
  const back = groupsFromIds({ ...stored, idByIndex: after });
  assert.deepEqual(back.groups.adherent, [2], 'submission 101 followed its answer to index 2');
  assert.deepEqual(back.groups.point, [3], 'submission 102 followed its answer to index 3');
});

test('groupsFromIds: an answer that no longer exists is dropped, not mapped to a stranger', () => {
  const stored = groupsToIds({ groups: { adherent: [1, 2], point: [], diverged: [] }, notes: {}, idByIndex: { 1: 101, 2: 102 } });
  const back = groupsFromIds({ ...stored, idByIndex: { 1: 101 } }); // 102 was deleted
  assert.deepEqual(back.groups.adherent, [1]);
});

// ── cache seam ───────────────────────────────────────────────────────────────
function _fakeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
    _map: m,
  };
}

test('makeEvalCache: writes, reads back, and clears', () => {
  const store = _fakeStorage();
  const cache = makeEvalCache(store, 'ns');
  assert.equal(cache.read('k'), null);
  cache.write('k', { a: 1 });
  assert.deepEqual(cache.read('k'), { a: 1 });
  assert.ok([...store._map.keys()][0].startsWith('ns:'), 'namespaced, so it cannot collide with other codex keys');
  cache.clear('k');
  assert.equal(cache.read('k'), null);
});

test('makeEvalCache: a throwing storage (private mode / quota) degrades, never throws', () => {
  const hostile = { getItem() { throw new Error('nope'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('nope'); } };
  const cache = makeEvalCache(hostile);
  assert.doesNotThrow(() => cache.read('k'));
  assert.equal(cache.read('k'), null);
  assert.equal(cache.write('k', { a: 1 }), false);
});

test('makeEvalCache: corrupt stored JSON reads as a miss instead of throwing', () => {
  const store = _fakeStorage();
  store.setItem('cdx_teval:k', '{not json');
  assert.equal(makeEvalCache(store).read('k'), null);
});

// ── the view: auto-run gated by the cache ────────────────────────────────────
const _tick = () => new Promise((r) => setTimeout(r, 0));

test('view: with answers and NO cached result, mount runs the synthesis by itself', async () => {
  const el = _fakeViewEl();
  let called = 0;
  tarefaEvalView.mount(el, {
    statement: 'E',
    responses: [{ index: 1, text: 'a' }],
    evalFn: async () => { called++; return { groups: { adherent: [1], point: [], diverged: [] }, total: 1 }; },
  });
  await _tick();
  assert.equal(called, 1, 'opening IS the trigger, no second click needed');
  tarefaEvalView.unmount();
});

// This gate is what makes auto-run safe: without it, every reopen would fire a call.
test('view: a cached result is shown instantly and the AI is NOT called', async () => {
  const el = _fakeViewEl();
  let called = 0;
  tarefaEvalView.mount(el, {
    statement: 'E',
    responses: [{ index: 1, text: 'resposta guardada' }],
    evalFn: async () => { called++; return { groups: { adherent: [1], point: [], diverged: [] } }; },
    initialResult: { groups: { adherent: [1], point: [], diverged: [] }, total: 1 },
    initialAt: Date.parse('2026-07-20T21:04:00'),
  });
  await _tick();
  assert.equal(called, 0, 'nothing changed since last time, so nothing is recomputed');
  assert.ok(el.innerHTML.includes('21:04'), 'and the provenance line says when it was synthesized');
  tarefaEvalView.unmount();
});

test('view: onResult fires with the fresh synthesis so the caller can persist it', async () => {
  const el = _fakeViewEl();
  let saved = null;
  tarefaEvalView.mount(el, {
    statement: 'E',
    responses: [{ index: 1, text: 'a' }],
    evalFn: async () => ({ groups: { adherent: [1], point: [], diverged: [] }, total: 1 }),
    onResult: (r) => { saved = r; },
  });
  await _tick();
  assert.ok(saved && saved.groups, 'the caller receives the result to store');
  tarefaEvalView.unmount();
});

test('view: unclassified answers are surfaced, never swallowed', async () => {
  const el = _fakeViewEl();
  tarefaEvalView.mount(el, {
    statement: 'E',
    responses: [{ index: 1, text: 'a' }, { index: 2, text: 'b' }],
    evalFn: async () => ({ groups: { adherent: [1], point: [], diverged: [] }, missing: [2], total: 2 }),
  });
  await _tick();
  assert.ok(el.innerHTML.includes(t('tarefas.eval_missing').replace('{n}', '1')), 'the instructor is told one answer went unclassified');
  tarefaEvalView.unmount();
});

test('view: an insufficient-credits failure tells the instructor to top up, not to retry', async () => {
  const el = _fakeViewEl();
  tarefaEvalView.mount(el, {
    statement: 'E',
    responses: [{ index: 1, text: 'a' }],
    evalFn: async () => ({ error: 'credits_exhausted' }),
  });
  await _tick();
  assert.ok(el.innerHTML.includes(t('tarefas.eval_credits_exhausted')));
  assert.notEqual(t('tarefas.eval_credits_exhausted'), t('tarefas.eval_error'), 'must not collapse into the generic error message');
  tarefaEvalView.unmount();
});

test('view: a too-large cohort explains itself and states nothing was cut', async () => {
  const el = _fakeViewEl();
  tarefaEvalView.mount(el, {
    statement: 'E',
    responses: [{ index: 1, text: 'a' }],
    evalFn: async () => ({ error: 'payload_too_large', chars: 250000, limit: AI_CHAT_MAX_CHARS }),
  });
  await _tick();
  assert.ok(el.innerHTML.includes('250000'), 'the real size is shown');
  assert.ok(!/data-act="run"/.test(el.innerHTML));
  tarefaEvalView.unmount();
});
