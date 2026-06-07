// slides-ai.test.mjs — unit tests for the Slides AI-fill service.
// Pure, no network, no DOM. Fake aiChat is injected via makeWorkerAi(fake).
// Run: node --test tests/slides-ai.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFillPrompt,
  parseFillResponse,
  makeWorkerAi,
  makeStubAi,
} from '../content/slides/js/ai/aiService.js';

// Minimal layout fixture matching the topics layout shape.
const topicsLayout = {
  id: 'topics',
  defaults: () => ({
    title: 'Titulo',
    topics: [{ id: 'a', text: 'Topico um' }],
  }),
};

// ---- buildFillPrompt -------------------------------------------------------

test('buildFillPrompt: system contains the layout id', () => {
  const { system } = buildFillPrompt(topicsLayout, 'tres bullets', 'pt-BR');
  assert.ok(system.includes('topics'), 'system must mention the layout id "topics"');
});

test('buildFillPrompt: system contains the slot keys', () => {
  const { system } = buildFillPrompt(topicsLayout, 'x', 'pt-BR');
  assert.ok(system.includes('title'), 'system must list slot key "title"');
  assert.ok(system.includes('topics'), 'system must list slot key "topics"');
});

test('buildFillPrompt: system contains a JSON instruction', () => {
  const { system } = buildFillPrompt(topicsLayout, 'x', 'pt-BR');
  assert.ok(system.toLowerCase().includes('json'), 'system must mention JSON');
  assert.ok(system.includes('{"slots"'), 'system must show the expected format');
});

test('buildFillPrompt: messages[0].content equals the intent', () => {
  const { messages } = buildFillPrompt(topicsLayout, 'tres bullets sobre IA', 'pt-BR');
  assert.equal(messages[0].content, 'tres bullets sobre IA');
});

test('buildFillPrompt: messages[0].role is "user"', () => {
  const { messages } = buildFillPrompt(topicsLayout, 'x', 'pt-BR');
  assert.equal(messages[0].role, 'user');
});

test('buildFillPrompt: lang defaults to pt-BR when omitted', () => {
  const { system } = buildFillPrompt(topicsLayout, 'x');
  assert.ok(system.includes('pt-BR'), 'system must mention pt-BR as the language');
});

// ---- parseFillResponse -----------------------------------------------------

test('parseFillResponse: clean JSON reply -> {slots}', () => {
  const reply = '{"slots":{"title":"T","topics":[{"text":"a"}]}}';
  const result = parseFillResponse(reply, topicsLayout);
  assert.ok('slots' in result, 'must return slots on success');
  assert.equal(result.slots.title, 'T');
  assert.deepEqual(result.slots.topics, [{ text: 'a' }]);
});

test('parseFillResponse: fenced ```json ... ``` reply parses correctly', () => {
  const reply = '```json\n{"slots":{"title":"T","topics":[{"text":"b"}]}}\n```';
  const result = parseFillResponse(reply, topicsLayout);
  assert.ok('slots' in result, 'must parse fenced reply');
  assert.equal(result.slots.title, 'T');
});

test('parseFillResponse: fenced ``` without json tag also parses', () => {
  const reply = '```\n{"slots":{"title":"T","topics":[]}}\n```';
  const result = parseFillResponse(reply, topicsLayout);
  assert.ok('slots' in result, 'must parse generic fenced reply');
});

test('parseFillResponse: prose wrapping JSON extracts the object', () => {
  const reply = 'Claro! Aqui esta: {"slots":{"title":"T","topics":[]}} Espero que ajude.';
  const result = parseFillResponse(reply, topicsLayout);
  assert.ok('slots' in result, 'must extract JSON from prose');
  assert.equal(result.slots.title, 'T');
});

test('parseFillResponse: non-JSON text -> {error}', () => {
  const result = parseFillResponse('not json at all', topicsLayout);
  assert.ok('error' in result, 'must return error for non-JSON');
  assert.ok(!('slots' in result), 'must not have slots on error');
});

test('parseFillResponse: unknown slot keys -> {error}', () => {
  const reply = '{"slots":{"title":"T","topics":[],"unknown_key":"oops"}}';
  const result = parseFillResponse(reply, topicsLayout);
  assert.ok('error' in result, 'must reject unknown slot keys');
});

test('parseFillResponse: missing slots object -> {error}', () => {
  const reply = '{"title":"T"}';
  const result = parseFillResponse(reply, topicsLayout);
  assert.ok('error' in result, 'must reject reply without slots wrapper');
});

test('parseFillResponse: empty string -> {error}', () => {
  const result = parseFillResponse('', topicsLayout);
  assert.ok('error' in result);
});

test('parseFillResponse: null -> {error}', () => {
  const result = parseFillResponse(null, topicsLayout);
  assert.ok('error' in result);
});

// ---- makeWorkerAi ----------------------------------------------------------

test('makeWorkerAi.fill: fakeChat returning valid JSON -> resolves {slots}', async () => {
  const fakeReply = '{"slots":{"title":"T","topics":[{"text":"a"}]}}';
  const fakeChat = async (_p) => ({ ok: true, reply: fakeReply, provider: 'fake' });
  const svc = makeWorkerAi(fakeChat);
  const result = await svc.fill(topicsLayout, 'tres bullets');
  assert.ok('slots' in result, 'must resolve with slots');
  assert.equal(result.slots.title, 'T');
});

test('makeWorkerAi.fill: fakeChat returning junk reply -> resolves {error}', async () => {
  const fakeChat = async (_p) => ({ ok: true, reply: 'not json', provider: 'fake' });
  const svc = makeWorkerAi(fakeChat);
  const result = await svc.fill(topicsLayout, 'x');
  assert.ok('error' in result, 'must resolve with error for junk reply');
});

test('makeWorkerAi.fill: fakeChat returning null (rate-limited) -> resolves {error}', async () => {
  const fakeChat = async (_p) => null;
  const svc = makeWorkerAi(fakeChat);
  const result = await svc.fill(topicsLayout, 'x');
  assert.ok('error' in result, 'must resolve with error when chat returns null');
});

test('makeWorkerAi.fill: fakeChat throwing -> resolves {error}', async () => {
  const fakeChat = async (_p) => { throw new Error('network error'); };
  const svc = makeWorkerAi(fakeChat);
  const result = await svc.fill(topicsLayout, 'x');
  assert.ok('error' in result, 'must resolve with error when chat throws');
});

test('makeWorkerAi.fill: passes system and messages to fakeChat', async () => {
  let captured;
  const fakeChat = async (p) => {
    captured = p;
    return { ok: true, reply: '{"slots":{"title":"T","topics":[]}}' };
  };
  const svc = makeWorkerAi(fakeChat);
  await svc.fill(topicsLayout, 'minha intencao');
  assert.ok(typeof captured.system === 'string', 'must pass system');
  assert.ok(Array.isArray(captured.messages), 'must pass messages array');
  assert.equal(captured.messages[0].content, 'minha intencao');
});

// ---- makeStubAi ------------------------------------------------------------

test('makeStubAi.fill: returns slots from layout defaults', async () => {
  const svc = makeStubAi();
  const result = await svc.fill(topicsLayout, 'anything');
  assert.ok('slots' in result, 'stub must return slots');
  assert.ok('title' in result.slots, 'stub slots must contain title');
  assert.ok('topics' in result.slots, 'stub slots must contain topics');
});

// ---- i18n keys -------------------------------------------------------------

test('new i18n keys slides.ai_fill + slides.ai_intent_ph + slides.ai_fill_go + slides.ai_cancel + slides.ai_error exist in BOTH dictionaries', async () => {
  const PT = (await import('../i18n/pt.js')).default;
  const EN = (await import('../i18n/en.js')).default;
  const required = [
    'slides.ai_fill',
    'slides.ai_intent_ph',
    'slides.ai_fill_go',
    'slides.ai_cancel',
    'slides.ai_error',
  ];
  for (const k of required) {
    assert.ok(k in PT, 'pt.js missing ' + k);
    assert.ok(k in EN, 'en.js missing ' + k);
  }
});
