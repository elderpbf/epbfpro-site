// engine/runtime.test.js
//
// Phase 1A acceptance test for createRuntime. Verifies the panel lifecycle:
//   - mount/unmount counts on navigation
//   - layout activation per panel
//   - prev() reverses
//   - diagnostic fallback when a panel fails to load
//   - lifecycle events broadcast on the event bus
//
// Run: node Site/backstage/classforge/panels/engine/runtime.test.js

import { strict as assert } from 'node:assert';
import { createRuntime } from './runtime.js';

function makeFakeModule(kind, id) {
  const m = {
    id, kind,
    mountCalls: 0,
    unmountCalls: 0,
    mount() { m.mountCalls++; },
    unmount() { m.unmountCalls++; },
  };
  return m;
}

function makeFakeLayout(id, slotNames = ['main']) {
  const layout = {
    id, kind: 'layout',
    mountCalls: 0,
    unmountCalls: 0,
    mount() {
      layout.mountCalls++;
      const slots = {};
      for (const name of slotNames) slots[name] = { _slot: name };
      return { slots };
    },
    unmount() { layout.unmountCalls++; }
  };
  return layout;
}

function makeRegistry({ tools = {}, elements = {}, layouts = {} } = {}) {
  return {
    getTool: id => tools[id] ?? null,
    getElement: id => elements[id] ?? null,
    getLayout: id => layouts[id] ?? null,
    getTheme: () => null,
    listByKind: () => [],
  };
}

// Test 1: mount/unmount lifecycle on next()
{
  const layout = makeFakeLayout('fake-layout');
  const tool1 = makeFakeModule('tool', 'tool-one');
  const tool2 = makeFakeModule('tool', 'tool-two');
  const registry = makeRegistry({
    tools: { 'tool-one': tool1, 'tool-two': tool2 },
    layouts: { 'fake-layout': layout }
  });
  const panels = {
    'panel-01.html': { meta: { id: 'panel-01', layout: 'fake-layout', tools: [{ id: 'tool-one', slot: 'main' }], elements: [] }, body: null },
    'panel-02.html': { meta: { id: 'panel-02', layout: 'fake-layout', tools: [{ id: 'tool-two', slot: 'main' }], elements: [] }, body: null },
  };
  const runtime = createRuntime({
    manifest: { title: 'Smoke', theme: 'default', panels: [{ src: 'panel-01.html' }, { src: 'panel-02.html' }] },
    host: { innerHTML: '' },
    registry,
    loadPanel: async url => panels[url] ?? (() => { throw new Error(`missing ${url}`); })(),
  });

  await runtime.start();
  assert.equal(runtime.currentIndex, 0, 'start activates panel 0');
  assert.equal(tool1.mountCalls, 1, 'panel 1 tool mounts once on start');
  assert.equal(layout.mountCalls, 1, 'layout mounts once on start');

  const advanced = await runtime.next();
  assert.equal(advanced, true, 'next succeeds');
  assert.equal(runtime.currentIndex, 1, 'currentIndex advances to 1');
  assert.equal(tool1.unmountCalls, 1, 'panel 1 tool unmounts exactly once on transition');
  assert.equal(tool1.mountCalls, 1, 'panel 1 tool mount count unchanged');
  assert.equal(tool2.mountCalls, 1, 'panel 2 tool mounts exactly once on transition');
  assert.equal(tool2.unmountCalls, 0, 'panel 2 tool not yet unmounted');
  assert.equal(layout.unmountCalls, 1, 'layout unmounts once on transition');
  assert.equal(layout.mountCalls, 2, 'layout re-mounts for panel 2');

  console.log('PASS  test 1: mount/unmount lifecycle on next()');
}

// Test 2: prev() reverses
{
  const layout = makeFakeLayout('L');
  const t1 = makeFakeModule('tool', 't1');
  const t2 = makeFakeModule('tool', 't2');
  const registry = makeRegistry({ tools: { t1, t2 }, layouts: { L: layout } });
  const panels = {
    a: { meta: { id: 'a', layout: 'L', tools: [{ id: 't1', slot: 'main' }] }, body: null },
    b: { meta: { id: 'b', layout: 'L', tools: [{ id: 't2', slot: 'main' }] }, body: null },
  };
  const runtime = createRuntime({
    manifest: { panels: [{ src: 'a' }, { src: 'b' }] },
    host: { innerHTML: '' }, registry,
    loadPanel: async u => panels[u]
  });
  await runtime.start();
  await runtime.next();
  await runtime.prev();
  assert.equal(runtime.currentIndex, 0, 'prev returns to panel 0');
  assert.equal(t1.mountCalls, 2, 't1 mounted twice (start + after prev)');
  assert.equal(t2.unmountCalls, 1, 't2 unmounted on prev');
  console.log('PASS  test 2: prev() reverses navigation');
}

// Test 3: missing panel renders diagnostic, does not crash
{
  const layout = makeFakeLayout('L');
  const registry = makeRegistry({ layouts: { L: layout } });
  const host = { innerHTML: '' };
  const runtime = createRuntime({
    manifest: { panels: [{ src: 'good' }, { src: 'broken' }] },
    host, registry,
    loadPanel: async url => {
      if (url === 'good') return { meta: { id: 'g', layout: 'L', tools: [], elements: [] }, body: null };
      throw new Error(`HTTP 404 for ${url}`);
    },
  });
  await runtime.start();
  const ok = await runtime.next();
  assert.equal(ok, false, 'next returns false when panel fetch fails');
  assert.match(host.innerHTML, /Panel failed to load/, 'diagnostic banner rendered');
  assert.match(host.innerHTML, /broken/, 'diagnostic includes failed panel path');
  assert.match(host.innerHTML, /data-pn-action="back"/, 'diagnostic includes back button');
  console.log('PASS  test 3: missing panel renders diagnostic');
}

// Test 4: lifecycle events fire on event bus
{
  const layout = makeFakeLayout('L');
  const registry = makeRegistry({ layouts: { L: layout } });
  const runtime = createRuntime({
    manifest: { panels: [{ src: 'a' }, { src: 'b' }] },
    host: { innerHTML: '' }, registry,
    loadPanel: async u => ({ meta: { id: u, layout: 'L', tools: [], elements: [] }, body: null }),
  });
  const heard = [];
  runtime.eventBus.addEventListener('panel-entered', e => heard.push(['enter', e.detail.panelId]));
  runtime.eventBus.addEventListener('panel-exited', e => heard.push(['exit', e.detail.panelId]));
  runtime.eventBus.addEventListener('navigation', e => heard.push(['nav', e.detail.direction]));
  await runtime.start();
  await runtime.next();
  assert.deepEqual(heard, [
    ['enter', 'a'],
    ['exit', 'a'],
    ['enter', 'b'],
    ['nav', 'next'],
  ], 'lifecycle events fire in expected order');
  console.log('PASS  test 4: lifecycle events broadcast');
}

// Test 5: setActiveTheme emits theme-changed and forwards to active layout and modules
{
  const layout = makeFakeLayout('L');
  const layoutEvents = [];
  layout.onEvent = (evt) => layoutEvents.push({ type: evt.type, detail: evt.detail });
  const tool = makeFakeModule('tool', 't1');
  const toolEvents = [];
  tool.onEvent = (evt) => toolEvents.push({ type: evt.type, detail: evt.detail });
  const registry = makeRegistry({ tools: { t1: tool }, layouts: { L: layout } });
  const runtime = createRuntime({
    manifest: { panels: [{ src: 'a' }] },
    host: { innerHTML: '' }, registry,
    loadPanel: async u => ({ meta: { id: u, layout: 'L', tools: [{ id: 't1', slot: 'main' }], elements: [] }, body: null }),
  });
  const busEvents = [];
  runtime.eventBus.addEventListener('theme-changed', e => busEvents.push(e.detail));
  await runtime.start();

  assert.equal(runtime.currentTheme, null, 'currentTheme is null before setActiveTheme');
  runtime.setActiveTheme('black');
  assert.equal(runtime.currentTheme, 'black', 'currentTheme reflects setActiveTheme');
  assert.deepEqual(busEvents, [{ themeId: 'black' }], 'eventBus received theme-changed');
  assert.deepEqual(layoutEvents.slice(-1), [{ type: 'theme-changed', detail: { themeId: 'black' } }], 'layout.onEvent received theme-changed');
  assert.deepEqual(toolEvents.slice(-1), [{ type: 'theme-changed', detail: { themeId: 'black' } }], 'tool.onEvent received theme-changed');
  console.log('PASS  test 5: setActiveTheme emits theme-changed and forwards');
}

// Test 6: setActiveTheme with empty or non-string does not emit; currentTheme stays null
{
  const layout = makeFakeLayout('L');
  const registry = makeRegistry({ layouts: { L: layout } });
  const errors = [];
  const runtime = createRuntime({
    manifest: { panels: [{ src: 'a' }] },
    host: { innerHTML: '' }, registry,
    loadPanel: async u => ({ meta: { id: u, layout: 'L', tools: [], elements: [] }, body: null }),
    onError: (err) => errors.push(err),
  });
  const busEvents = [];
  runtime.eventBus.addEventListener('theme-changed', e => busEvents.push(e.detail));
  await runtime.start();

  runtime.setActiveTheme('');
  assert.equal(runtime.currentTheme, null, 'currentTheme stays null after empty string');
  assert.equal(busEvents.length, 0, 'no theme-changed emitted for empty string');
  assert.equal(errors.length, 1, 'onError called once');
  assert.match(errors[0].message, /themeId must be a non-empty string/, 'error message describes validation');

  runtime.setActiveTheme(null);
  assert.equal(runtime.currentTheme, null, 'currentTheme stays null after null');
  assert.equal(busEvents.length, 0, 'still no theme-changed emitted');
  assert.equal(errors.length, 2, 'onError called twice total');

  runtime.setActiveTheme(42);
  assert.equal(runtime.currentTheme, null, 'currentTheme stays null after number');
  assert.equal(busEvents.length, 0, 'still no theme-changed emitted');
  assert.equal(errors.length, 3, 'onError called three times total');

  console.log('PASS  test 6: setActiveTheme validates themeId');
}

// Test 7: currentTheme is null before any setActiveTheme call
{
  const layout = makeFakeLayout('L');
  const registry = makeRegistry({ layouts: { L: layout } });
  const runtime = createRuntime({
    manifest: { panels: [{ src: 'a' }] },
    host: { innerHTML: '' }, registry,
    loadPanel: async u => ({ meta: { id: u, layout: 'L', tools: [], elements: [] }, body: null }),
  });
  assert.equal(runtime.currentTheme, null, 'currentTheme is null immediately after createRuntime');
  await runtime.start();
  assert.equal(runtime.currentTheme, null, 'currentTheme remains null after start without setActiveTheme');
  console.log('PASS  test 7: currentTheme is null before any setActiveTheme call');
}

console.log('\nAll runtime tests passed.');
