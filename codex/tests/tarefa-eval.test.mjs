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
  parseEvalResponse,
  makeStubEval,
  makeWorkerEval,
  SEED_RESPONSES,
} from '../js/tarefa-eval.js';

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

test('makeWorkerEval: injected aiChat resolving to null (rate-limit) resolves to {error}, never throws', async () => {
  const fakeChat = async () => null;
  const evalFn = makeWorkerEval(fakeChat);
  await assert.doesNotReject(async () => {
    const out = await evalFn({ statement: 'S', responses: [] });
    assert.equal(typeof out.error, 'string');
  });
});

// ── SEED_RESPONSES (the deterministic demo fixture) ──────────────────────────
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
