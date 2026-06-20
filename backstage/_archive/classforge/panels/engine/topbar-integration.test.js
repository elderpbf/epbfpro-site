// engine/topbar-integration.test.js
//
// Phase 2B acceptance test for attachTopbar. Verifies:
//   - Topbar.init is called exactly once with presentation mode + forwarded options
//   - panel-entered events trigger setSubtitle with `title · i+1 / n`
//   - id fallback when meta has no title
//   - 'Panel' fallback when meta is null
//   - default options when caller passes none
//
// Run: node Site/backstage/classforge/panels/engine/topbar-integration.test.js

import { strict as assert } from 'node:assert';

// Minimal runtime stub: closure vars `_i` and `_meta` are mutated between tests
// so each case can simulate a different active panel.
let _i = 0;
let _meta = null;
const runtime = {
  eventBus: new EventTarget(),
  get currentIndex() { return _i; },
  get panelCount() { return 5; },
  get currentMeta() { return _meta; },
};

// Spies for the Topbar global. Reset between tests as needed.
const initCalls = [];
const subtitleCalls = [];
globalThis.Topbar = {
  init: (...args) => { initCalls.push(args); },
  setSubtitle: (s) => { subtitleCalls.push(s); },
};
globalThis.window = globalThis;

const { attachTopbar } = await import('./topbar-integration.js');

// Test 1: attachTopbar forwards options to Topbar.init exactly once
{
  initCalls.length = 0;
  subtitleCalls.length = 0;
  attachTopbar(runtime, { title: 'Test', backLink: '/x' });
  assert.equal(initCalls.length, 1, 'Topbar.init called exactly once');
  assert.deepEqual(initCalls[0][0], {
    mode: 'presentation',
    title: 'Test',
    backLink: '/x',
    sections: [],
  }, 'init payload matches');
  console.log('PASS  test 1: attachTopbar forwards options to Topbar.init');
}

// Test 2: first panel-entered fires setSubtitle with title + position
{
  subtitleCalls.length = 0;
  _i = 0;
  _meta = { id: 'p1', title: 'Intro' };
  runtime.eventBus.dispatchEvent(new CustomEvent('panel-entered', { detail: { panelId: 'p1' } }));
  assert.equal(subtitleCalls.length, 1, 'setSubtitle called once');
  assert.equal(subtitleCalls[0], 'Intro · 1 / 5', 'subtitle matches title + position');
  console.log('PASS  test 2: panel-entered with title sets "Intro · 1 / 5"');
}

// Test 3: advancing index + meta updates subtitle accordingly
{
  subtitleCalls.length = 0;
  _i = 2;
  _meta = { id: 'p3', title: 'Deep Dive' };
  runtime.eventBus.dispatchEvent(new CustomEvent('panel-entered', { detail: { panelId: 'p3' } }));
  assert.equal(subtitleCalls.length, 1, 'setSubtitle called once');
  assert.equal(subtitleCalls[0], 'Deep Dive · 3 / 5', 'subtitle matches new title + position');
  console.log('PASS  test 3: moving to index 2 sets "Deep Dive · 3 / 5"');
}

// Test 4: meta without title falls back to meta.id
{
  subtitleCalls.length = 0;
  _i = 3;
  _meta = { id: 'p4' };
  runtime.eventBus.dispatchEvent(new CustomEvent('panel-entered', { detail: { panelId: 'p4' } }));
  assert.equal(subtitleCalls.length, 1, 'setSubtitle called once');
  assert.equal(subtitleCalls[0], 'p4 · 4 / 5', 'subtitle falls back to meta.id');
  console.log('PASS  test 4: meta without title falls back to id -> "p4 · 4 / 5"');
}

// Test 5: null meta falls back to the literal label 'Panel'
{
  subtitleCalls.length = 0;
  _i = 4;
  _meta = null;
  runtime.eventBus.dispatchEvent(new CustomEvent('panel-entered', { detail: { panelId: 'p5' } }));
  assert.equal(subtitleCalls.length, 1, 'setSubtitle called once');
  assert.equal(subtitleCalls[0], 'Panel · 5 / 5', 'subtitle falls back to "Panel"');
  console.log('PASS  test 5: null meta falls back to "Panel · 5 / 5"');
}

// Test 6: attachTopbar with no options uses defaults
{
  initCalls.length = 0;
  // Fresh runtime so the default-options attach does not double up on the
  // shared event bus (not strictly necessary for this test, but keeps the
  // spy state predictable).
  const runtime2 = {
    eventBus: new EventTarget(),
    get currentIndex() { return 0; },
    get panelCount() { return 1; },
    get currentMeta() { return null; },
  };
  attachTopbar(runtime2);
  assert.equal(initCalls.length, 1, 'Topbar.init called exactly once');
  assert.deepEqual(initCalls[0][0], {
    mode: 'presentation',
    title: 'ClassForge',
    backLink: '/backstage/classforge/',
    sections: [],
  }, 'init payload uses defaults');
  console.log('PASS  test 6: attachTopbar() with no options uses ClassForge defaults');
}

console.log('\nAll topbar-integration tests passed.');
