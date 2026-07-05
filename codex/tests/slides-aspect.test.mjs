// slides-aspect.test.mjs — Phase 8 deck aspect ratio: the pure canvas/aspect helpers
// and the deck-level migration backfill. UI wiring (the selector, the CSS vars) is not
// covered here (no DOM in node:test); this locks the model the rest of Phase 8 rides on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ASPECTS, canvasForAspect, aspectOfCanvas, reanchorDeck, clampToCanvas, migrateDeck, SCHEMA_VERSION,
} from '../content/slides/js/core/schema.js';

test('canvasForAspect returns the table dims, as fresh copies, 16:9 by default', () => {
  assert.deepEqual(canvasForAspect('16:9'), { w: 1280, h: 720 });
  assert.deepEqual(canvasForAspect('4:3'), { w: 960, h: 720 });
  assert.deepEqual(canvasForAspect('bogus'), { w: 1280, h: 720 }, 'unknown aspect falls back to 16:9');
  assert.notEqual(canvasForAspect('16:9'), ASPECTS['16:9'], 'returns a copy, not the shared table object');
});

test('aspectOfCanvas infers the key from stored dims, defaulting to 16:9', () => {
  assert.equal(aspectOfCanvas({ w: 1280, h: 720 }), '16:9');
  assert.equal(aspectOfCanvas({ w: 960, h: 720 }), '4:3');
  assert.equal(aspectOfCanvas(null), '16:9');
  assert.equal(aspectOfCanvas({ w: 1600, h: 900 }), '16:9', 'a 16:9-ratio non-table canvas still reads 16:9');
});

test('reanchorDeck scales absolute geometry (overrides, assets, logo) by the ratio', () => {
  const deck = {
    logo: { x: 40, y: 30, h: 40 },
    assets: [{ id: 'a', x: 100, y: 200, w: 240, h: 80 }],
    slides: [{ overrides: { 'topics.x': { x: 800, y: 100, w: 400, h: 60 } } }],
  };
  reanchorDeck(deck, 960 / 1280, 720 / 720); // 16:9 -> 4:3: sx=0.75, sy=1
  assert.equal(deck.logo.x, 30, 'logo x scaled by 0.75');
  assert.equal(deck.logo.y, 30, 'logo y unchanged (sy=1)');
  assert.deepEqual(deck.assets[0], { id: 'a', x: 75, y: 200, w: 180, h: 80 }, 'asset x+w scaled, y+h kept');
  assert.deepEqual(deck.slides[0].overrides['topics.x'], { x: 600, y: 100, w: 300, h: 60 }, 'override x+w scaled to fit the narrower canvas');
});

test('reanchorDeck is a no-op when the size is unchanged', () => {
  const deck = { assets: [{ id: 'a', x: 100, w: 200 }], slides: [] };
  const before = JSON.parse(JSON.stringify(deck));
  reanchorDeck(deck, 1, 1);
  assert.deepEqual(deck, before);
});

test('migrateDeck backfills deck.aspect from the canvas and bumps schemaVersion to 6', () => {
  const legacy = { canvas: { w: 1280, h: 720 }, slides: [] }; // v1, no aspect
  const d = migrateDeck(legacy);
  assert.equal(d.aspect, '16:9', 'aspect inferred from the 16:9 canvas');
  assert.deepEqual(d.canvas, { w: 1280, h: 720 }, 'existing canvas kept');
  assert.equal(d.schemaVersion, SCHEMA_VERSION);
  assert.ok(SCHEMA_VERSION >= 6, 'schema bumped to at least 6 for aspect');
});

test('migrateDeck backfills a missing canvas from the declared aspect and is idempotent', () => {
  const d1 = migrateDeck({ aspect: '4:3', slides: [] });
  assert.deepEqual(d1.canvas, { w: 960, h: 720 }, 'canvas derived from the declared aspect');
  const d2 = migrateDeck(JSON.parse(JSON.stringify(d1)));
  assert.deepEqual(d2, d1, 'second migration is a no-op');
});

test('clampToCanvas keeps every absolute box inside the canvas', () => {
  const deck = {
    canvas: { w: 960, h: 720 },
    logo: { x: 40, y: 30, h: 40 },
    assets: [{ id: 'a', scope: 'slide', slideId: 's', x: 900, y: 10, w: 200, h: 80 }],
    slides: [{ id: 's', overrides: { 'f.1': { x: 800, y: 700, w: 300, h: 60 } } }],
  };
  clampToCanvas(deck);
  const a = deck.assets[0];
  assert.ok(a.x + a.w <= 960 && a.y + a.h <= 720, 'asset clamped inside');
  const ov = deck.slides[0].overrides['f.1'];
  assert.ok(ov.x >= 0 && ov.x + ov.w <= 960 && ov.y + ov.h <= 720, 'override clamped inside');
});

test('clampToCanvas flags reflowWarn when the clamp pushes an element into an overlap', () => {
  const deck = {
    canvas: { w: 960, h: 720 },
    assets: [],
    slides: [{ id: 's', overrides: {
      a: { x: 700, y: 300, w: 200, h: 200 },   // inside
      b: { x: 1400, y: 300, w: 200, h: 200 },  // off-canvas -> clamps to x=760, over 'a'
    } }],
  };
  clampToCanvas(deck);
  assert.equal(deck.slides[0].reflowWarn, true, 'a clamp-induced overlap is flagged');
});

test('clampToCanvas clears a stale reflowWarn when nothing overlaps after the clamp', () => {
  const deck = { canvas: { w: 1280, h: 720 }, assets: [], slides: [{ id: 's', reflowWarn: true, overrides: { a: { x: 100, y: 100, w: 100, h: 100 } } }] };
  clampToCanvas(deck);
  assert.ok(!deck.slides[0].reflowWarn, 'stale warn cleared when no overlap');
});
