// codex/js/lab-viewer.js — the Codex-owned fullscreen lab viewer (ES-module port
// of window.CVLabViewer). Behavioral tests over a minimal DOM stub: overlay
// construction, the iframe URL (incl. key encoding), and every close path
// (button, backdrop, Escape), plus single-injection of the stylesheet.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal DOM stub (lab-viewer touches document only, never window) ─────────
function makeEl(tag) {
  const listeners = {};
  const el = {
    tagName: tag, className: '', textContent: '', src: '',
    attrs: {}, children: [], parent: null,
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    appendChild(c) { c.parent = el; this.children.push(c); return c; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== el); this.parent = null; },
    dispatch(type, ev) { (listeners[type] || []).forEach((fn) => fn(ev || {})); },
    classList: (() => { const s = new Set(); return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) }; })(),
  };
  return el;
}

const head = makeEl('head');
const body = makeEl('body');
const docListeners = {};
globalThis.document = {
  head, body,
  createElement: makeEl,
  addEventListener(type, fn) { (docListeners[type] = docListeners[type] || []).push(fn); },
  removeEventListener(type, fn) { docListeners[type] = (docListeners[type] || []).filter((f) => f !== fn); },
  _dispatch(type, ev) { (docListeners[type] || []).slice().forEach((fn) => fn(ev || {})); },
  _keydownCount() { return (docListeners.keydown || []).length; },
};

function findByClass(root, cls) {
  if (!root) return null;
  if (root.className === cls) return root;
  for (const c of root.children) { const hit = findByClass(c, cls); if (hit) return hit; }
  return null;
}
const overlayInBody = () => body.children.find((c) => c.className === 'cv-lab-viewer-overlay') || null;
const styleCount = () => head.children.filter((c) => c.attrs['data-cv-lab-viewer'] === '1').length;

const view = await import('../js/lab-viewer.js');

test('openModal builds an accessible overlay with a scaled lab iframe', () => {
  view.openModal({ key: 'k18', title: 'Janela de contexto' });
  const overlay = overlayInBody();
  assert.ok(overlay, 'overlay appended to body');
  assert.equal(overlay.attrs.role, 'dialog');
  assert.equal(overlay.attrs['aria-modal'], 'true');
  assert.equal(overlay.attrs['aria-label'], 'Janela de contexto');
  assert.ok(body.classList.contains('cv-lab-viewer-open'), 'body marked open');
  const iframe = findByClass(overlay, 'cv-lab-viewer-iframe');
  assert.ok(iframe, 'iframe present');
  assert.equal(iframe.src, '/codex/labs/k18/', 'iframes the lab page');
  assert.match(iframe.attrs.allow, /fullscreen/, 'allows fullscreen');
  view.close();
});

test('openModal encodes the key into the iframe URL', () => {
  view.openModal({ key: 'a b/c' });
  const iframe = findByClass(overlayInBody(), 'cv-lab-viewer-iframe');
  assert.equal(iframe.src, '/codex/labs/a%20b%2Fc/');
  view.close();
});

test('openModal with no key is a no-op', () => {
  view.openModal({});
  assert.equal(overlayInBody(), null, 'nothing rendered for empty key');
  view.openModal();
  assert.equal(overlayInBody(), null, 'nothing rendered for missing opts');
});

test('an explicit url overrides the lab-key path (serves any shipped HTML, e.g. Interativos)', () => {
  view.openModal({ url: '/codex/interativos/demo-peca/', title: 'Interativo' });
  const iframe = findByClass(overlayInBody(), 'cv-lab-viewer-iframe');
  assert.equal(iframe.src, '/codex/interativos/demo-peca/', 'url is used verbatim');
  view.close();
  // url wins even when a key is also passed
  view.openModal({ key: 'k1', url: '/codex/interativos/x/' });
  assert.equal(findByClass(overlayInBody(), 'cv-lab-viewer-iframe').src, '/codex/interativos/x/');
  view.close();
});

test('openModal with neither key nor url is a no-op', () => {
  view.openModal({ title: 'nope' });
  assert.equal(overlayInBody(), null, 'nothing rendered without a source');
});

test('close removes the overlay, the open flag, and the keydown listener', () => {
  view.openModal({ key: 'k1' });
  assert.ok(overlayInBody(), 'open');
  assert.equal(document._keydownCount(), 1, 'one keydown listener while open');
  view.close();
  assert.equal(overlayInBody(), null, 'overlay gone');
  assert.ok(!body.classList.contains('cv-lab-viewer-open'), 'open flag cleared');
  assert.equal(document._keydownCount(), 0, 'keydown listener detached');
});

test('Escape closes the modal', () => {
  view.openModal({ key: 'k1' });
  document._dispatch('keydown', { key: 'Escape' });
  assert.equal(overlayInBody(), null, 'Escape closed it');
  // A non-Escape key does nothing.
  view.openModal({ key: 'k1' });
  document._dispatch('keydown', { key: 'a' });
  assert.ok(overlayInBody(), 'other keys ignored');
  view.close();
});

test('clicking the backdrop closes, clicking inside does not', () => {
  view.openModal({ key: 'k1' });
  const overlay = overlayInBody();
  const frame = overlay.children[0];
  overlay.dispatch('click', { target: frame }); // inside
  assert.ok(overlayInBody(), 'click inside the frame keeps it open');
  overlay.dispatch('click', { target: overlay }); // backdrop
  assert.equal(overlayInBody(), null, 'backdrop click closes');
});

test('the close button closes the modal', () => {
  view.openModal({ key: 'k1', title: 'X' });
  const closeBtn = findByClass(overlayInBody(), 'cv-lab-viewer-close');
  assert.equal(closeBtn.textContent, '×');
  closeBtn.dispatch('click', {});
  assert.equal(overlayInBody(), null, 'close button closed it');
});

test('re-opening while open replaces (never stacks) the overlay', () => {
  view.openModal({ key: 'k1' });
  view.openModal({ key: 'k2' });
  const overlays = body.children.filter((c) => c.className === 'cv-lab-viewer-overlay');
  assert.equal(overlays.length, 1, 'only one overlay at a time');
  const iframe = findByClass(overlays[0], 'cv-lab-viewer-iframe');
  assert.equal(iframe.src, '/codex/labs/k2/', 'shows the latest lab');
  view.close();
});

test('the stylesheet is injected exactly once across many opens', () => {
  view.openModal({ key: 'k1' }); view.close();
  view.openModal({ key: 'k2' }); view.close();
  assert.equal(styleCount(), 1, 'single <style data-cv-lab-viewer> in head');
});
