// tools/tokenizer-viz/index.test.js
//
// Phase 3A acceptance test for the tokenizer-viz tool. Verifies:
//   - module registers as a tool with id 'tokenizer-viz'
//   - mount(container, config) builds textarea, chip wall, counts footer
//   - dispatching an input event re-renders chips
//   - unmount empties the container and stops responding to input
//   - the encoder factory is invoked exactly once across multiple mounts
//
// The test never hits the network: every mount injects config.encoderFactory.
// The module's default factory does a dynamic import of js-tiktoken which is
// fine in browsers but unsupported under plain node, so we bypass it.
//
// Run: node Site/backstage/classforge/panels/tools/tokenizer-viz/index.test.js

import { strict as assert } from 'node:assert';

// --------------------------------------------------------------------------
// Minimal DOM stub. Same shape as elements/classpulse-slot/.test.js,
// extended with textarea value, dispatchEvent, classList, and innerHTML.
// --------------------------------------------------------------------------

class StubElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.attributes = Object.create(null);
    this.children = [];
    this.parentNode = null;
    this._listeners = Object.create(null);
    this._textContent = '';
    this._value = '';
    this.dataset = Object.create(null);
    this.style = {};
    const classSet = new Set();
    this.classList = {
      add: (c) => { classSet.add(c); this.attributes.class = Array.from(classSet).join(' '); },
      remove: (c) => { classSet.delete(c); this.attributes.class = Array.from(classSet).join(' '); },
      contains: (c) => classSet.has(c),
    };
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name] : null;
  }
  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name);
  }
  appendChild(child) {
    if (child.parentNode && child.parentNode !== this) {
      const idx = child.parentNode.children.indexOf(child);
      if (idx >= 0) child.parentNode.children.splice(idx, 1);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  remove() {
    if (this.parentNode) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx >= 0) this.parentNode.children.splice(idx, 1);
      this.parentNode = null;
    }
  }
  addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) {
    const list = this._listeners[type];
    if (!list) return;
    const idx = list.indexOf(fn);
    if (idx >= 0) list.splice(idx, 1);
  }
  dispatchEvent(evt) {
    const list = this._listeners[evt.type] || [];
    for (const fn of list.slice()) fn(evt);
  }
  set textContent(v) { this._textContent = String(v); this.children = []; }
  get textContent() { return this._textContent; }
  set value(v) { this._value = String(v); }
  get value() { return this._value; }
  set className(v) { this.attributes.class = String(v); }
  get className() { return this.attributes.class || ''; }
  set innerHTML(v) {
    if (v === '') { this.children = []; this._textContent = ''; }
    else { this._textContent = String(v); }
  }
  get innerHTML() { return this._textContent; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

const documentStub = {
  createElement(tagName) { return new StubElement(tagName); },
  querySelector() { return null; },
  head: new StubElement('head'),
  body: new StubElement('body'),
  documentElement: new StubElement('html'),
};

globalThis.document = documentStub;
globalThis.Element = StubElement;

// Make timers synchronous so the debounced render flushes within the test.
globalThis.setTimeout = (fn) => { fn(); return 0; };
globalThis.clearTimeout = () => {};

// --------------------------------------------------------------------------
// Stub encoder + factory. Counts factory invocations to verify caching.
// --------------------------------------------------------------------------

function makeStubEncoder() {
  return {
    encode: (s) => Array.from(String(s)).map((c) => c.charCodeAt(0)),
    decode: (ids) => String.fromCharCode(...ids),
  };
}

let factoryCallCount = 0;
const stubFactory = () => { factoryCallCount += 1; return Promise.resolve(makeStubEncoder()); };

// --------------------------------------------------------------------------
// Helpers.
// --------------------------------------------------------------------------

function collectAll(node) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const cur = stack.pop();
    out.push(cur);
    for (const c of cur.children) stack.push(c);
  }
  return out;
}

function hasClass(node, cls) {
  const c = node.attributes && node.attributes.class;
  if (!c) return false;
  return c.split(/\s+/).includes(cls);
}

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

// --------------------------------------------------------------------------
// Import registry + the tool (side-effect registration).
// --------------------------------------------------------------------------

const { getTool, resetRegistry } = await import('../../engine/registry.js');
await import('./index.js');

// Test 1: registration
{
  const mod = getTool('tokenizer-viz');
  assert.ok(mod, 'tokenizer-viz module is registered');
  assert.equal(mod.kind, 'tool', 'kind is tool');
  assert.equal(typeof mod.mount, 'function', 'mount is a function');
  assert.equal(typeof mod.unmount, 'function', 'unmount is a function');
  console.log('PASS  test 1: tokenizer-viz registered as tool with mount/unmount');
}

// Test 2: mount builds textarea + chip wall + counts footer
{
  const mod = getTool('tokenizer-viz');
  const container = new StubElement('div');
  mod.mount(container, { encoderFactory: stubFactory });
  await flushMicrotasks();

  const all = collectAll(container);
  assert.ok(all.some((n) => n.tagName === 'TEXTAREA'), 'a textarea is present');
  assert.ok(all.some((n) => hasClass(n, 'tok-chips')), 'a chip wall element with class tok-chips is present');
  assert.ok(all.some((n) => hasClass(n, 'tok-counts')), 'a counts footer element with class tok-counts is present');

  mod.unmount();
  console.log('PASS  test 2: mount builds textarea, chip wall, counts footer');
}

// Test 3: input event re-renders chips
{
  const mod = getTool('tokenizer-viz');
  const container = new StubElement('div');
  mod.mount(container, { encoderFactory: stubFactory });
  await flushMicrotasks();

  const ta = collectAll(container).find((n) => n.tagName === 'TEXTAREA');
  assert.ok(ta, 'textarea exists');
  ta.value = 'AB';
  ta.dispatchEvent({ type: 'input' });
  await flushMicrotasks();

  const chipWall = collectAll(container).find((n) => hasClass(n, 'tok-chips'));
  assert.ok(chipWall, 'chip wall exists');
  assert.equal(chipWall.children.length, 2, 'two chips for "AB"');

  mod.unmount();
  console.log('PASS  test 3: input event re-renders chips');
}

// Test 4: unmount empties container
{
  const mod = getTool('tokenizer-viz');
  const container = new StubElement('div');
  mod.mount(container, { encoderFactory: stubFactory });
  await flushMicrotasks();
  assert.ok(container.children.length > 0, 'mount appended at least one child');

  mod.unmount();
  assert.equal(container.children.length, 0, 'unmount removed all children');
  console.log('PASS  test 4: unmount empties container');
}

// Test 5: encoder factory invoked exactly once across all mounts.
// The module-scope cache is shared across every mount/unmount in this run.
{
  assert.equal(factoryCallCount, 1, `factory invoked exactly once across all mounts (saw ${factoryCallCount})`);
  console.log('PASS  test 5: encoder factory invoked exactly once across all mounts');
}

void resetRegistry;

console.log('\nAll tokenizer-viz tests passed.');
