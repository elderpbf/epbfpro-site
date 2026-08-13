// slides-reorder-collision.test.mjs — guards against the grip subsystem STEALING the
// name of a controller verb.
//
// Exists because of a REAL production bug (Élder 2026-07-16: "não consigo reordenar
// slides; nem as setas nem arrastar funcionam" - can't reorder slides, neither the
// arrows nor dragging work). The app.js controller exposes reorder(from, to), the deck
// op that moves a SLIDE: the navigator's ↑↓ arrow calls app.move(i, d), which calls
// this.reorder(i, j), and dropping a thumbnail calls app.reorder(dragI, i) directly.
// Commit 81715ae (card/topic drag) published the new subsystem as
// `app.reorder = {afterRender}`, OVERWRITING the method. Both paths started calling an
// object as a function and died together, silently, because no test covered slide reorder.
//
// DOM-free in the style of slides-select: initReorder only needs app.stage.addEventListener.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initReorder } from '../content/slides/js/select/reorder.js';

function stubStage() {
  return { addEventListener() {}, querySelectorAll: () => [] };
}

test('initReorder does not overwrite the controller\'s reorder(from,to)', () => {
  const moved = [];
  const app = {
    stage: stubStage(),
    reorder: (from, to) => moved.push([from, to]), // the deck op, as app.js defines it
  };

  initReorder(app);

  assert.equal(typeof app.reorder, 'function',
    'app.reorder must remain the deck op; becoming an object means the navigator\'s arrows and drag die');
  app.reorder(0, 2);
  assert.deepEqual(moved, [[0, 2]], 'and it must remain the SAME deck op, not a namesake');
});

test('the grip subsystem publishes itself under its own name', () => {
  const app = { stage: stubStage() };
  initReorder(app);
  assert.equal(typeof app.gripReorder, 'object', 'grips published at app.gripReorder');
  assert.equal(typeof app.gripReorder.afterRender, 'function', 'with the afterRender that app.js calls');
});

// The other side of the collision: app.js has to CALL the new name. Without this,
// renaming just reorder.js would leave the card/topic grips with no injection at all
// (the mirrored bug).
test('app.js calls gripReorder.afterRender, not reorder.afterRender', async () => {
  const fs = await import('node:fs');
  const url = new URL('../content/slides/js/app.js', import.meta.url);
  const src = fs.readFileSync(url, 'utf8');
  assert.match(src, /this\.gripReorder\.afterRender\(\)/, 'app.js injects the grips via the new name');
  assert.doesNotMatch(src, /this\.reorder\.afterRender\(\)/, 'and not via the name that collided');
});
