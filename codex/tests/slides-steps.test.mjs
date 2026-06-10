// slides-steps.test.mjs — TDD for "reveal step-order" feature (explicit step field).
// CONTRACT: step is an integer on topics/cards items.
//   0 = always shown; 1..N = reveal order.
// Migration in schema.js (v2->v3) assigns step=i+1 to items lacking it.
// Emission in helpers.js uses item.step with positional fallback for unmigrated items.
// reveals(s) in each layout returns the max effective step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateDeck, SCHEMA_VERSION } from '../content/slides/js/core/schema.js';
import topicsLayout from '../content/slides/js/layouts/topics.js';
import coverLayout from '../content/slides/js/layouts/cover.js';

// ---------- 1. migrateDeck: v2 deck gets step assigned ----------

test('migrateDeck: a v2 deck gets step=i+1 on topics + cards (and is stamped to the current schema)', () => {
  const deck = {
    schemaVersion: 2,
    slides: [
      { slots: { topics: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }, { id: 'c', text: 'z' }] } },
      { slots: { cards: [{ id: 'k1' }, { id: 'k2' }] } },
    ],
  };
  const d = migrateDeck(deck);
  assert.equal(d.schemaVersion, SCHEMA_VERSION, 'schemaVersion bumped to the current schema');
  const topics = d.slides[0].slots.topics;
  assert.deepEqual(topics.map((t) => t.step), [1, 2, 3], 'topics steps are [1,2,3]');
  const cards = d.slides[1].slots.cards;
  assert.deepEqual(cards.map((c) => c.step), [1, 2], 'cards steps are [1,2]');
});

// ---------- 2. idempotent: migrate twice == migrate once ----------

test('migrateDeck is idempotent: running twice yields the same result as once', () => {
  const deck = {
    schemaVersion: 2,
    slides: [
      { slots: { topics: [{ id: 'a', text: 'x' }, { id: 'b', text: 'y' }] } },
      { slots: { cards: [{ id: 'k1' }, { id: 'k2' }, { id: 'k3' }] } },
    ],
  };
  const once = migrateDeck(JSON.parse(JSON.stringify(deck)));
  const twice = migrateDeck(JSON.parse(JSON.stringify(once)));
  assert.deepEqual(twice, once, 'second migrate is a no-op (deep-equal to first)');
});

// ---------- 3. version-gated: a v3 deck with custom steps is untouched ----------

test('migrateDeck does not re-derive steps on a v3 deck (version-gated)', () => {
  const deck = {
    schemaVersion: 3,
    slides: [
      {
        slots: {
          topics: [
            { id: 'a', text: 'x', step: 2 },
            { id: 'b', text: 'y', step: 0 },
            { id: 'c', text: 'z', step: 1 },
          ],
        },
      },
    ],
  };
  const d = migrateDeck(JSON.parse(JSON.stringify(deck)));
  const steps = d.slides[0].slots.topics.map((t) => t.step);
  assert.deepEqual(steps, [2, 0, 1], 'custom steps [2,0,1] are preserved unchanged on a v3 deck');
});

// ---------- 4. emission: render uses explicit steps, reveal class follows step>0 ----------

test('topics layout render: explicit steps are emitted as data-step; step:0 has no reveal class', () => {
  const slots = {
    title: 'T',
    topics: [
      { id: 'a', text: 'x', step: 2 },
      { id: 'b', text: 'y', step: 0 },
      { id: 'c', text: 'z', step: 1 },
    ],
  };
  const html = topicsLayout.render(slots);

  // Extract all data-step values in order.
  const stepMatches = [...html.matchAll(/data-step="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(stepMatches, [2, 0, 1], 'data-step values are [2,0,1] (explicit)');

  // step:0 item must NOT carry the reveal class.
  // The <li> for the step:0 item has data-step="0"; verify it lacks class="reveal".
  // Parse each <li> element and check.
  const liBlocks = [...html.matchAll(/<li[^>]*>/g)].map((m) => m[0]);
  assert.equal(liBlocks.length, 3, 'three <li> elements');

  const stepZeroTag = liBlocks.find((tag) => tag.includes('data-step="0"'));
  assert.ok(stepZeroTag, 'found the step:0 <li>');
  assert.ok(!stepZeroTag.includes('reveal'), 'step:0 <li> has no reveal class');

  const stepOneTwoTags = liBlocks.filter((tag) => !tag.includes('data-step="0"'));
  assert.ok(stepOneTwoTags.every((tag) => tag.includes('reveal')), 'step>0 <li> elements carry reveal class');
});

// ---------- 5. reveals: max effective step ----------

test('topics.reveals: returns max step among topics', () => {
  const result = topicsLayout.reveals({ topics: [{ step: 2 }, { step: 0 }, { step: 1 }] });
  assert.equal(result, 2, 'reveals === 2 (max explicit step)');
});

test('cover.reveals: always 0', () => {
  assert.equal(coverLayout.reveals(), 0, 'cover.reveals() === 0');
});

// ---------- 6. backward-compat: no step field falls back to positional ----------

test('topics.reveals: positional fallback when items have no step field', () => {
  const result = topicsLayout.reveals({ topics: [{ id: 'a' }, { id: 'b' }] });
  assert.equal(result, 2, 'positional fallback: two topics -> reveals === 2');
});

test('topics layout render: positional fallback emits data-step 1,2 when step is absent', () => {
  const slots = {
    title: 'T',
    topics: [
      { id: 'a', text: 'x' },
      { id: 'b', text: 'y' },
    ],
  };
  const html = topicsLayout.render(slots);
  const stepMatches = [...html.matchAll(/data-step="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(stepMatches, [1, 2], 'positional fallback emits data-step 1,2');
});
