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

// Cards layout fixture: a list of {id, mode, text} items + a boolean control flag.
const cardsLayout = {
  id: 'cards',
  defaults: () => ({
    title: 'Titulo',
    reveal: false,
    cards: [{ id: 'a', mode: 'text', text: 'Texto do card' }],
  }),
};

// Split layout fixture: has an image (object) slot + numeric/boolean controls the
// AI must never fill, plus the shared topics list.
const splitLayout = {
  id: 'split',
  defaults: () => ({
    flip: false,
    ratio: 0.5,
    title: 'Titulo',
    image: null,
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
  assert.equal(result.slots.topics.length, 1);
  assert.equal(result.slots.topics[0].text, 'a');
  assert.equal(typeof result.slots.topics[0].id, 'string', 'normalize must assign an id');
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

// ---- normalize (the cards/topics-not-filling bug) --------------------------

test('normalize: topics as bare STRINGS are coerced to {id,text} items', () => {
  // The original bug: the model returned a string array; the renderer reads
  // t.text/t.id off bare strings -> empty bullets. Normalize must wrap them.
  const reply = '{"slots":{"title":"T","topics":["um","dois","tres"]}}';
  const result = parseFillResponse(reply, topicsLayout);
  assert.ok('slots' in result);
  assert.equal(result.slots.topics.length, 3);
  for (const tp of result.slots.topics) {
    assert.equal(typeof tp.id, 'string', 'each item gets an id');
    assert.equal(typeof tp.text, 'string');
  }
  assert.equal(result.slots.topics[0].text, 'um');
  assert.equal(result.slots.topics[2].text, 'tres');
});

test('normalize: empty/whitespace topic strings are dropped', () => {
  const reply = '{"slots":{"title":"T","topics":["um","","  ","dois"]}}';
  const result = parseFillResponse(reply, topicsLayout);
  assert.equal(result.slots.topics.length, 2);
  assert.deepEqual(result.slots.topics.map((t) => t.text), ['um', 'dois']);
});

test('normalize: each coerced topic gets a UNIQUE id', () => {
  const reply = '{"slots":{"title":"T","topics":["a","b","c"]}}';
  const ids = parseFillResponse(reply, topicsLayout).slots.topics.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
});

test('normalize: cards as bare strings become {id,mode:"text",text}', () => {
  // mode must be restored to "text" or the renderer falls through to the
  // image+text branch and shows an empty image box.
  const reply = '{"slots":{"title":"T","cards":["Card um","Card dois"]}}';
  const result = parseFillResponse(reply, cardsLayout);
  assert.equal(result.slots.cards.length, 2);
  for (const c of result.slots.cards) {
    assert.equal(c.mode, 'text', 'card mode must be restored to text');
    assert.equal(typeof c.id, 'string');
  }
  assert.equal(result.slots.cards[0].text, 'Card um');
});

test('normalize: card objects keep mode "text" and never inherit a stray mode', () => {
  // Even if the model invents mode:"image", we keep the renderable default.
  const reply = '{"slots":{"cards":[{"mode":"image","text":"x"}]}}';
  const result = parseFillResponse(reply, cardsLayout);
  assert.equal(result.slots.cards[0].mode, 'text');
  assert.equal(result.slots.cards[0].text, 'x');
});

test('normalize: object items with a differently-named text field still fill', () => {
  const reply = '{"slots":{"topics":[{"label":"olá"}]}}';
  const result = parseFillResponse(reply, topicsLayout);
  assert.equal(result.slots.topics[0].text, 'olá');
});

test('normalize: image/object slot is dropped (AI cannot synthesise images)', () => {
  const reply = '{"slots":{"title":"T","image":"http://x/y.png","topics":["a"]}}';
  const result = parseFillResponse(reply, splitLayout);
  assert.ok(!('image' in result.slots), 'image slot must be omitted from the patch');
  assert.equal(result.slots.title, 'T');
  assert.equal(result.slots.topics[0].text, 'a');
});

test('normalize: boolean/number control slots are dropped', () => {
  const reply = '{"slots":{"title":"T","reveal":true,"cards":["a"]}}';
  const result = parseFillResponse(reply, cardsLayout);
  assert.ok(!('reveal' in result.slots), 'control flag must not be AI-set');
  assert.equal(result.slots.cards[0].text, 'a');
});

test('normalize: a non-array sent for a list slot is coerced to a single item', () => {
  const reply = '{"slots":{"topics":"só um"}}';
  const result = parseFillResponse(reply, topicsLayout);
  assert.ok(Array.isArray(result.slots.topics));
  assert.equal(result.slots.topics[0].text, 'só um');
});

// ---- buildFillPrompt: shape template ---------------------------------------

test('buildFillPrompt: system shows the per-item LIST shape, not just the key', () => {
  const { system } = buildFillPrompt(topicsLayout, 'x', 'pt-BR');
  assert.ok(system.includes('LISTA'), 'system must flag list slots');
  assert.ok(system.includes('"text"'), 'system must show the item content field');
});

test('buildFillPrompt: system omits the image slot from the template', () => {
  const { system } = buildFillPrompt(splitLayout, 'x', 'pt-BR');
  assert.ok(system.includes('"topics"'), 'list slot present in template');
  assert.ok(!system.includes('"image"'), 'image slot must not be offered to the model');
});

// ---- makeWorkerAi ----------------------------------------------------------

test('makeWorkerAi.fill: fakeChat returning valid JSON -> resolves {slots}', async () => {
  const fakeReply = '{"slots":{"title":"T","topics":[{"text":"a"}]}}';
  const fakeChat = async (_p) => ({ ok: true, text: fakeReply, provider: 'fake' });
  const svc = makeWorkerAi(fakeChat);
  const result = await svc.fill(topicsLayout, 'tres bullets');
  assert.ok('slots' in result, 'must resolve with slots');
  assert.equal(result.slots.title, 'T');
});

test('makeWorkerAi.fill: fakeChat returning junk reply -> resolves {error}', async () => {
  const fakeChat = async (_p) => ({ ok: true, text: 'not json', provider: 'fake' });
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
    return { ok: true, text: '{"slots":{"title":"T","topics":[]}}' };
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
