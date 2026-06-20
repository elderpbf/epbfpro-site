// engine/probe-integration.test.js
//
// Phase 2E acceptance test for attachProbe. Verifies:
//   - panel-entered events are forwarded as `[panels] panel-entered id=... layout=...`
//   - panel-exited events are forwarded as `[panels] panel-exited id=...`
//   - navigation events are forwarded as `[panels] navigation from=... to=... direction=...`
//   - three dispatched events produce exactly three bsProbe calls in order
//   - when window.bsProbe is undefined, attachProbe and subsequent dispatches no-op
//
// Run: node Site/backstage/classforge/panels/engine/probe-integration.test.js

import { strict as assert } from 'node:assert';

// Stub the browser-ish globals the module expects.
globalThis.window = globalThis;
const probeCalls = [];
globalThis.bsProbe = (msg) => { probeCalls.push(msg); };

const runtime = { eventBus: new EventTarget() };

const { attachProbe } = await import('./probe-integration.js');

attachProbe(runtime);

// Test 1: panel-entered forwards id + layout
{
  probeCalls.length = 0;
  runtime.eventBus.dispatchEvent(new CustomEvent('panel-entered', {
    detail: { panelId: 'p1', layout: 'cover' },
  }));
  assert.equal(probeCalls.length, 1, 'bsProbe called exactly once');
  assert.equal(probeCalls[0], '[panels] panel-entered id=p1 layout=cover', 'panel-entered payload matches');
  console.log('PASS  test 1: panel-entered forwarded as "[panels] panel-entered id=p1 layout=cover"');
}

// Test 2: panel-exited forwards id
{
  probeCalls.length = 0;
  runtime.eventBus.dispatchEvent(new CustomEvent('panel-exited', {
    detail: { panelId: 'p1' },
  }));
  assert.equal(probeCalls.length, 1, 'bsProbe called exactly once');
  assert.equal(probeCalls[0], '[panels] panel-exited id=p1', 'panel-exited payload matches');
  console.log('PASS  test 2: panel-exited forwarded as "[panels] panel-exited id=p1"');
}

// Test 3: navigation forwards from/to/direction
{
  probeCalls.length = 0;
  runtime.eventBus.dispatchEvent(new CustomEvent('navigation', {
    detail: { from: 0, to: 1, direction: 'next' },
  }));
  assert.equal(probeCalls.length, 1, 'bsProbe called exactly once');
  assert.equal(probeCalls[0], '[panels] navigation from=0 to=1 direction=next', 'navigation payload matches');
  console.log('PASS  test 3: navigation forwarded as "[panels] navigation from=0 to=1 direction=next"');
}

// Test 4: three events in sequence produce three ordered probe calls
{
  probeCalls.length = 0;
  runtime.eventBus.dispatchEvent(new CustomEvent('panel-exited',  { detail: { panelId: 'p1' } }));
  runtime.eventBus.dispatchEvent(new CustomEvent('panel-entered', { detail: { panelId: 'p2', layout: 'tool-fullbleed' } }));
  runtime.eventBus.dispatchEvent(new CustomEvent('navigation',    { detail: { from: 0, to: 1, direction: 'next' } }));
  assert.equal(probeCalls.length, 3, 'bsProbe called three times');
  assert.equal(probeCalls[0], '[panels] panel-exited id=p1', 'first call matches panel-exited');
  assert.equal(probeCalls[1], '[panels] panel-entered id=p2 layout=tool-fullbleed', 'second call matches panel-entered');
  assert.equal(probeCalls[2], '[panels] navigation from=0 to=1 direction=next', 'third call matches navigation');
  console.log('PASS  test 4: three sequential events produce three ordered bsProbe calls');
}

// Test 5: missing window.bsProbe -> attachProbe is a no-op, no throws on dispatch
{
  // Save the original before deleting so we can restore it after the test.
  const savedBsProbe = globalThis.bsProbe;
  delete globalThis.bsProbe;

  // Use a FRESH runtime because the earlier runtime's listeners already
  // captured a closure over the original (now-saved) bsProbe. attachProbe's
  // guard only runs at attach time, so we need a new eventBus to exercise it.
  const runtime2 = { eventBus: new EventTarget() };

  assert.doesNotThrow(() => attachProbe(runtime2), 'attachProbe no-ops when bsProbe is missing');

  assert.doesNotThrow(() => {
    runtime2.eventBus.dispatchEvent(new CustomEvent('panel-entered', { detail: { panelId: 'p1', layout: 'cover' } }));
    runtime2.eventBus.dispatchEvent(new CustomEvent('panel-exited',  { detail: { panelId: 'p1' } }));
    runtime2.eventBus.dispatchEvent(new CustomEvent('navigation',    { detail: { from: 0, to: 1, direction: 'next' } }));
  }, 'dispatching events with no listeners attached does not throw');

  // Restore so any follow-up testing (or future appended tests) works.
  globalThis.bsProbe = savedBsProbe;
  console.log('PASS  test 5: missing bsProbe -> attachProbe and dispatch are no-ops');
}

console.log('\nAll probe-integration tests passed.');
