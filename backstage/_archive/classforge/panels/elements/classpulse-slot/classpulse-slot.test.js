// elements/classpulse-slot/classpulse-slot.test.js
//
// Phase 2F acceptance test for the classpulse-slot element. Verifies:
//   - module registers as an element with id 'classpulse-slot'
//   - mount with a slug appends <classpulse-question mode="embed" slug="...">
//   - mount without a slug still appends the node with mode="embed" and no slug attr
//   - unmount removes the node and module is ready for a second mount
//
// Run: node Site/backstage/classforge/panels/elements/classpulse-slot/classpulse-slot.test.js

import { strict as assert } from 'node:assert';

// --------------------------------------------------------------------------
// Minimal DOM stub. No jsdom. The slot module creates nodes via
// document.createElement and appends/removes them; we give it just enough
// Element surface to exercise those paths deterministically.
// --------------------------------------------------------------------------

class StubElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.attributes = Object.create(null);
    this.children = [];
    this.parentNode = null;
    this._listeners = Object.create(null);
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attributes, name)
      ? this.attributes[name]
      : null;
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
  querySelector(_selector) { return null; }
  addEventListener(type, fn) {
    (this._listeners[type] ||= []).push(fn);
  }
  set src(value) { this.attributes.src = String(value); }
  get src() { return this.attributes.src; }
  set async(value) { this.attributes.async = !!value; }
  get async() { return !!this.attributes.async; }
}

const documentStub = {
  createElement(tagName) { return new StubElement(tagName); },
  querySelector(_selector) { return null; },
  head: new StubElement('head'),
  body: new StubElement('body'),
  documentElement: new StubElement('html'),
};

const customElementsStub = {
  _registry: new Map(),
  get(name) { return this._registry.get(name); },
  whenDefined(_name) {
    // Never resolves during tests; the module fires-and-forgets via .catch.
    return new Promise(() => {});
  },
  define(name, ctor) { this._registry.set(name, ctor); },
};

globalThis.document = documentStub;
globalThis.customElements = customElementsStub;
// Some environments also look up Element for instanceof checks; provide it.
globalThis.Element = StubElement;

// --------------------------------------------------------------------------
// Import registry helpers and the slot module (side-effect registration).
// The slot imports '../../engine/registry.js'; our test is in
// elements/classpulse-slot/, so the same relative path resolves here,
// guaranteeing both reach the same registry singleton.
// --------------------------------------------------------------------------

const { registerElement, getElement, resetRegistry } =
  await import('../../engine/registry.js');

// Do NOT reset before importing the slot: registration happens at import
// top-level and a reset after import would erase it.
await import('./index.js');

// Test 1: registration
{
  const mod = getElement('classpulse-slot');
  assert.ok(mod, 'classpulse-slot module is registered');
  assert.equal(mod.kind, 'element', 'kind is element');
  assert.equal(typeof mod.mount, 'function', 'mount is a function');
  assert.equal(typeof mod.unmount, 'function', 'unmount is a function');
  assert.equal(typeof mod.onEvent, 'function', 'onEvent is a function');
  console.log('PASS  test 1: classpulse-slot registered as element with mount/unmount/onEvent');
}

// Test 2: mount with slug renders <classpulse-question mode="embed" slug="...">
{
  const mod = getElement('classpulse-slot');
  const container = new StubElement('div');
  mod.mount(container, { slug: 'demo-slug' });

  assert.equal(container.children.length, 1, 'one child appended');
  const child = container.children[0];
  assert.equal(child.tagName, 'CLASSPULSE-QUESTION', 'child tagName is CLASSPULSE-QUESTION');
  assert.equal(child.getAttribute('mode'), 'embed', 'mode attribute is embed');
  assert.equal(child.getAttribute('slug'), 'demo-slug', 'slug attribute matches config');

  mod.unmount();
  console.log('PASS  test 2: mount with slug renders classpulse-question with mode=embed and slug');
}

// Test 3: mount without a slug omits the slug attribute
{
  const mod = getElement('classpulse-slot');
  const container = new StubElement('div');
  mod.mount(container, {});

  assert.equal(container.children.length, 1, 'one child appended');
  const child = container.children[0];
  assert.equal(child.tagName, 'CLASSPULSE-QUESTION', 'child tagName is CLASSPULSE-QUESTION');
  assert.equal(child.getAttribute('mode'), 'embed', 'mode attribute is embed');
  assert.equal(child.hasAttribute('slug'), false, 'no slug attribute when config.slug is missing');

  mod.unmount();
  console.log('PASS  test 3: mount without slug omits slug attribute');
}

// Test 4: unmount removes the node and module is ready for a second mount
{
  const mod = getElement('classpulse-slot');
  const container = new StubElement('div');

  mod.mount(container, { slug: 'first' });
  assert.equal(container.children.length, 1, 'first mount appended child');
  mod.unmount();
  assert.equal(container.children.length, 0, 'unmount removed the node');

  // Second mount must succeed independently.
  mod.mount(container, { slug: 'second' });
  assert.equal(container.children.length, 1, 'second mount appended child');
  const child = container.children[0];
  assert.equal(child.getAttribute('slug'), 'second', 'second mount uses new slug');
  mod.unmount();
  assert.equal(container.children.length, 0, 'second unmount cleaned up');
  console.log('PASS  test 4: unmount removes node and module is ready for a second mount');
}

// Suppress "unused" warning for resetRegistry; keep the import so future
// expansions (e.g., isolating tests) have it available without churn.
void resetRegistry;
void registerElement;

console.log('\nAll classpulse-slot tests passed.');
