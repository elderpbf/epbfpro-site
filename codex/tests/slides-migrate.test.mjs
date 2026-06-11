// slides-migrate.test.mjs — D1 stable-identity deck migration (Slice 3).
// migrateDeck() is a pure, idempotent, version-gated upgrade run on deck load:
// it gives every card a stable id, promotes topic strings to {id,text}, re-points
// positional geometry overrides ('cards.0'/'topics.1') to id-based keys, and moves
// positional per-item text style off slide.textStyle onto the object (.style, the
// same home asset.style uses). After it runs a freed/styled card or topic keeps its
// override + style across reorder, because identity is no longer positional.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateDeck, SCHEMA_VERSION } from '../content/slides/js/core/schema.js';

// A pre-migration ("legacy") deck: string topics, id-less cards, positional
// override + textStyle keys. Mirrors what is on staging today.
function legacyDeck() {
  return {
    id: 'd1', // no schemaVersion => treated as v1 (pre-id)
    slides: [
      {
        id: 's1', layout: 'cards',
        slots: { title: 'T', reveal: true, cards: [{ mode: 'text', text: 'A' }, { mode: 'text', text: 'B' }] },
        overrides: { 'cards.1': { x: 10, y: 20, w: 200, h: 80, flow: true } },
        textStyle: { 'cards.0.text': { fw: '900' }, title: { fs: 40 } },
      },
      {
        id: 's2', layout: 'topics',
        slots: { title: 'T2', topics: ['um', 'dois', 'tres'] },
        overrides: { 'topics.2': { x: 1, y: 2, w: 3, h: 4 } },
        textStyle: { 'topics.1': { color: '#abc' } },
      },
    ],
  };
}

test('migrateDeck assigns a stable id to every card and converts topics to {id,text}', () => {
  const d = migrateDeck(legacyDeck());
  const cards = d.slides[0].slots.cards;
  assert.ok(cards.every((c) => typeof c.id === 'string' && c.id.length), 'every card has a string id');
  assert.notEqual(cards[0].id, cards[1].id, 'card ids are distinct');
  assert.equal(cards[0].text, 'A', 'card content preserved');

  const topics = d.slides[1].slots.topics;
  assert.ok(topics.every((t) => t && typeof t === 'object' && typeof t.id === 'string'), 'topics are {id,...} objects');
  assert.deepEqual(topics.map((t) => t.text), ['um', 'dois', 'tres'], 'topic text preserved in order');
});

test('migrateDeck re-points positional geometry overrides to id-based keys', () => {
  const d = migrateDeck(legacyDeck());
  const card1 = d.slides[0].slots.cards[1];
  const ov0 = d.slides[0].overrides;
  assert.ok(!('cards.1' in ov0), 'positional card override key is gone');
  assert.deepEqual(ov0[`cards.${card1.id}`], { x: 10, y: 20, w: 200, h: 80, flow: true }, 'override moved to id key, value intact');

  const topic2 = d.slides[1].slots.topics[2];
  const ov1 = d.slides[1].overrides;
  assert.ok(!('topics.2' in ov1), 'positional topic override key is gone');
  assert.deepEqual(ov1[`topics.${topic2.id}`], { x: 1, y: 2, w: 3, h: 4 }, 'topic override moved to id key');
});

test('migrateDeck moves positional card/topic text style onto the object (.style)', () => {
  const d = migrateDeck(legacyDeck());
  assert.deepEqual(d.slides[0].slots.cards[0].style, { fw: '900' }, 'card text style now lives on the card');
  assert.ok(!('cards.0.text' in d.slides[0].textStyle), 'positional card textStyle key removed');
  assert.deepEqual(d.slides[1].slots.topics[1].style, { color: '#abc' }, 'topic text style now lives on the topic');
  assert.ok(!('topics.1' in (d.slides[1].textStyle || {})), 'positional topic textStyle key removed');
});

test('migrateDeck preserves non-list slot textStyle (e.g. title) untouched', () => {
  const d = migrateDeck(legacyDeck());
  assert.deepEqual(d.slides[0].textStyle.title, { fs: 40 }, 'title style (a real layout slot) is left in slide.textStyle');
});

test('migrateDeck v4: folds the legacy card mode into a composable parts map and drops mode', () => {
  const legacy = legacyDeck(); // cards are {mode:'text'}
  legacy.slides[0].slots.cards.push({ mode: 'image-text', text: 'C', image: { src: 'x' } });
  const d = migrateDeck(legacy);
  const cards = d.slides[0].slots.cards;
  assert.deepEqual(cards[0].parts, { body: true }, "mode:'text' -> {body:true}");
  assert.deepEqual(cards[2].parts, { image: true, body: true }, "mode:'image-text' -> {image,body}");
  for (const c of cards) assert.ok(!('mode' in c), 'the retired mode field is dropped');
});

test('migrateDeck sets schemaVersion and is idempotent (second run is a no-op)', () => {
  const once = migrateDeck(legacyDeck());
  assert.equal(once.schemaVersion, SCHEMA_VERSION, 'schemaVersion is stamped to current');
  const twice = migrateDeck(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once, 'migrating an already-migrated deck changes nothing');
});

test('migrateDeck does not re-wrap an already-object topic or reassign an existing id', () => {
  const d = migrateDeck(legacyDeck());
  const idBefore = d.slides[0].slots.cards[0].id;
  const topicBefore = d.slides[1].slots.topics[0];
  const d2 = migrateDeck(d);
  assert.equal(d2.slides[0].slots.cards[0].id, idBefore, 'existing card id is stable across runs');
  assert.equal(d2.slides[1].slots.topics[0], topicBefore, 'an already-object topic is not re-wrapped');
  assert.equal(d2.slides[1].slots.topics[0].text, 'um', 'no {id:{id,text}} nesting');
});
