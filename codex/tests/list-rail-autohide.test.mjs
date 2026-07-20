// width:autohide — the ONE hover-reveal rail (track-41).
//
// Was hand-rolled TWICE, byte-for-byte apart from one line: cohorts.js (`_openNav`/
// `_closeNav`/`_maybeHideNav`, CLIENTES) and questions/sessions.js (`_openSidebar`/
// `_closeSidebar`/`_maybeHide`). Same 6px zone, same 1500ms delay, same `cdx-sm--open`,
// same Escape, same "starts pinned until the first pick". These pin the ONE surviving
// implementation so a future edit can't quietly re-fork it.
//
// Behavioural (not source-regex): the module runs against a stub DOM. A source test would
// pass on code that never runs — the false confidence that track-41's own dead-code find
// was made of.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── minimal DOM stub ────────────────────────────────────────────────────────
function makeEl() {
  const listeners = {};
  const classes = new Set();
  return {
    _listeners: listeners,
    classList: {
      add: (c) => classes.add(c),
      remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
      toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)),
    },
    has: (c) => classes.has(c),
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener: (ev, fn) => {
      if (!listeners[ev]) return;
      listeners[ev] = listeners[ev].filter((f) => f !== fn);
    },
    fire: (ev, arg) => (listeners[ev] || []).slice().forEach((f) => f(arg)),
    style: { setProperty: () => {}, removeProperty: () => {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 600 }),
    querySelector: () => null,
    querySelectorAll: () => [],
    set innerHTML(_v) { /* render is not under test here */ },
    get innerHTML() { return ''; },
    parentNode: null,
  };
}

let mountRail;
let layout, container, docStub;

async function setup({ pinned } = {}) {
  layout = makeEl();
  container = makeEl();
  container.parentNode = layout;
  docStub = makeEl();
  global.document = docStub;
  if (!mountRail) ({ mountRail } = await import('../js/list-rail.js'));
  const rail = mountRail(container, {
    items: () => [],
    width: Object.assign({ mode: 'autohide', layoutEl: layout }, pinned === undefined ? {} : { pinned }),
  });
  rail.render();
  return rail;
}

const OPEN = 'cdx-sm--open';

test('starts pinned open (both consumers open pinned until the first pick)', async () => {
  await setup();
  assert.equal(layout.has(OPEN), true, 'pinned means open on mount');
});

test('pinned refuses to close: Escape and the leave-timer cannot hide it', async () => {
  await setup();
  docStub.fire('keydown', { key: 'Escape' });
  assert.equal(layout.has(OPEN), true, 'Escape does not close a pinned rail');
  container.fire('mouseleave');
  assert.equal(layout.has(OPEN), true, 'leaving does not close a pinned rail');
});

test('pin(false) unpins AND closes — the first-pick move, in one call', async () => {
  const rail = await setup();
  rail.pin(false);
  assert.equal(layout.has(OPEN), false, 'unpinning closes it, like the first turma/session pick');
});

test('pin(true) re-pins AND opens — back to the picker with nothing selected', async () => {
  const rail = await setup();
  rail.pin(false);
  rail.pin(true);
  assert.equal(layout.has(OPEN), true, 'repinning reopens');
});

test('unpinned: the left screen edge reveals it (<=6px), elsewhere does not', async () => {
  const rail = await setup();
  rail.pin(false);
  docStub.fire('mousemove', { clientX: 40 });
  assert.equal(layout.has(OPEN), false, 'mid-screen does not reveal');
  docStub.fire('mousemove', { clientX: 6 });
  assert.equal(layout.has(OPEN), true, 'the 6px edge zone reveals');
});

test('unpinned: Escape closes', async () => {
  const rail = await setup();
  rail.pin(false);
  docStub.fire('mousemove', { clientX: 0 });
  assert.equal(layout.has(OPEN), true);
  docStub.fire('keydown', { key: 'Escape' });
  assert.equal(layout.has(OPEN), false, 'Escape closes an unpinned rail');
});

test('unpinned: leaving hides after the delay; being over it does not', async () => {
  const rail = await setup();
  rail.pin(false);
  docStub.fire('mousemove', { clientX: 0 });
  container.fire('mouseenter');            // cursor is on the rail (it slid in under it)
  container.fire('mouseleave');
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(layout.has(OPEN), false, 'hides ~1.5s after the cursor leaves');

  docStub.fire('mousemove', { clientX: 0 });
  container.fire('mouseenter');            // and stays put while the cursor is on it
  await new Promise((r) => setTimeout(r, 1600));
  assert.equal(layout.has(OPEN), true, 'does not hide while the cursor is over it');
});

test('destroy() unhooks the document listeners (no leak across tab switches)', async () => {
  const rail = await setup();
  rail.pin(false);
  rail.destroy();
  docStub.fire('mousemove', { clientX: 0 });
  assert.equal(layout.has(OPEN), false, 'a destroyed rail no longer reacts to the edge');
});

// Autohide is opt-in: the 8 rails already migrated declare no width (or width:resize) and
// must not start reacting to the screen edge just because this capability now exists.
// (Only the no-width case is exercised here; width:resize would drag installResizer's real
// DOM needs — createElement/localStorage — into a stub that exists to test autohide.)
test('a rail with no width config never wires autohide', async () => {
  layout = makeEl(); container = makeEl(); container.parentNode = layout;
  docStub = makeEl(); global.document = docStub;
  const rail = mountRail(container, { items: () => [] });
  rail.render();
  docStub.fire('mousemove', { clientX: 0 });
  assert.equal(layout.has(OPEN), false, 'no width config means the edge does nothing');
  assert.equal(typeof rail.pin, 'function', 'pin() still exists, it is just inert');
});
