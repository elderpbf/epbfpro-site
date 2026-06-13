// codex/js/drive-viewer.js — the Codex-owned shared Drive file viewer (ES-module
// port of window.CVDriveViewer). Pure URL contract (slidesEmbedUrl, previewSrcFor)
// tested directly; the DOM bits (mountInContainer, openModal) tested over a
// minimal stub: iframe construction + class, empty state, and every close path.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal DOM stub (drive-viewer touches document only, never window) ───────
function makeEl(tag) {
  const listeners = {};
  const el = {
    tagName: tag, className: '', textContent: '', src: '', type: '', innerHTML: '',
    attrs: {}, children: [], parentNode: null,
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k]; },
    addEventListener(t2, fn) { (listeners[t2] = listeners[t2] || []).push(fn); },
    removeEventListener(t2, fn) { listeners[t2] = (listeners[t2] || []).filter((f) => f !== fn); },
    appendChild(c) { c.parentNode = el; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; },
    dispatch(t2, ev) { (listeners[t2] || []).forEach((fn) => fn(ev || {})); },
  };
  return el;
}
const body = makeEl('body');
const docListeners = {};
globalThis.document = {
  body,
  createElement: makeEl,
  addEventListener(t2, fn) { (docListeners[t2] = docListeners[t2] || []).push(fn); },
  removeEventListener(t2, fn) { docListeners[t2] = (docListeners[t2] || []).filter((f) => f !== fn); },
  _dispatch(t2, ev) { (docListeners[t2] || []).slice().forEach((fn) => fn(ev || {})); },
  _keydownCount() { return (docListeners.keydown || []).length; },
};
function findByClass(root, cls) {
  if (!root) return null;
  if (root.className === cls) return root;
  for (const c of root.children) { const hit = findByClass(c, cls); if (hit) return hit; }
  return null;
}
const overlayInBody = () => body.children.find((c) => c.className === 'cv-drive-viewer-overlay') || null;

const dv = await import('../js/drive-viewer.js');

const SLIDE_ID = 'aBcDeFgHiJ1234567890XYZ'; // 20+ chars => bare-id branch
const PRESENTATION = 'application/vnd.google-apps.presentation';

// ── slidesEmbedUrl ───────────────────────────────────────────────────────────
test('slidesEmbedUrl handles every input form', () => {
  assert.equal(dv.slidesEmbedUrl(''), '', 'empty');
  assert.equal(dv.slidesEmbedUrl('   '), '', 'whitespace');
  assert.equal(dv.slidesEmbedUrl('short'), 'short', 'unknown short input passes through');
  assert.equal(dv.slidesEmbedUrl(SLIDE_ID),
    'https://docs.google.com/presentation/d/' + SLIDE_ID + '/embed?start=false&loop=false', 'bare file id');
  assert.equal(dv.slidesEmbedUrl('https://docs.google.com/presentation/d/' + SLIDE_ID + '/edit'),
    'https://docs.google.com/presentation/d/' + SLIDE_ID + '/embed?start=false&loop=false', 'edit link');
  assert.equal(dv.slidesEmbedUrl('https://docs.google.com/presentation/d/e/PUB123/pub'),
    'https://docs.google.com/presentation/d/e/PUB123/embed?start=false&loop=false', 'published link');
  const already = 'https://docs.google.com/presentation/d/X/embed?start=false';
  assert.equal(dv.slidesEmbedUrl(already), already, 'already-embed passes through');
});

// ── previewSrcFor ────────────────────────────────────────────────────────────
test('previewSrcFor routes presentations through the Slides embed player', () => {
  const item = { meta_json: { mimeType: PRESENTATION, file_id: SLIDE_ID } };
  assert.equal(dv.previewSrcFor(item),
    'https://docs.google.com/presentation/d/' + SLIDE_ID + '/embed?start=false&loop=false');
});

test('previewSrcFor uses /file/d/<id>/preview for non-presentation files', () => {
  assert.equal(dv.previewSrcFor({ meta_json: { file_id: 'FILE123' } }),
    'https://drive.google.com/file/d/FILE123/preview', 'from explicit file_id');
  assert.equal(dv.previewSrcFor({ meta_json: { url: 'https://drive.google.com/file/d/XYZ_9/view' } }),
    'https://drive.google.com/file/d/XYZ_9/preview', 'file id extracted from url');
});

test('previewSrcFor returns empty string when no file id is resolvable', () => {
  assert.equal(dv.previewSrcFor({ meta_json: {} }), '');
  assert.equal(dv.previewSrcFor(null), '');
  assert.equal(dv.previewSrcFor({}), '');
});

// ── mountInContainer ─────────────────────────────────────────────────────────
test('mountInContainer builds a plain iframe wrap for Drive files', () => {
  const host = makeEl('div');
  dv.mountInContainer({ meta_json: { file_id: 'FILE123' } }, host);
  const wrap = host.children[0];
  assert.equal(wrap.className, 'cv-renderer-iframe-wrap', 'no slide clip for plain files');
  const iframe = wrap.children[0];
  assert.equal(iframe.className, 'cv-renderer-iframe');
  assert.equal(iframe.src, 'https://drive.google.com/file/d/FILE123/preview');
  assert.match(iframe.attrs.allow, /fullscreen/);
  assert.equal(iframe.attrs.referrerpolicy, 'no-referrer');
});

test('mountInContainer adds the slide-clip class for presentations', () => {
  const host = makeEl('div');
  dv.mountInContainer({ meta_json: { mimeType: PRESENTATION, file_id: SLIDE_ID } }, host);
  assert.equal(host.children[0].className, 'cv-renderer-iframe-wrap cv-slides-clip');
});

test('mountInContainer shows the empty state when there is no src', () => {
  const host = makeEl('div');
  dv.mountInContainer({ meta_json: {} }, host);
  assert.match(host.innerHTML, /cv-renderer-empty/);
  assert.equal(host.children.length, 0, 'no iframe mounted');
});

test('mountInContainer is a no-op with no container', () => {
  assert.doesNotThrow(() => dv.mountInContainer({ meta_json: { file_id: 'x' } }, null));
});

// ── openModal ────────────────────────────────────────────────────────────────
test('openModal builds the modal shell and mounts the preview iframe', () => {
  const handle = dv.openModal({ title: 'Plano de aula', meta_json: { file_id: 'FILE123' } });
  assert.equal(typeof handle.close, 'function', 'returns a close handle');
  const overlay = overlayInBody();
  assert.ok(overlay, 'overlay appended to body');
  assert.equal(findByClass(overlay, 'cv-drive-viewer-title').textContent, 'Plano de aula');
  const iframe = findByClass(overlay, 'cv-renderer-iframe');
  assert.equal(iframe.src, 'https://drive.google.com/file/d/FILE123/preview', 'iframe mounted in the body');
  handle.close();
  assert.equal(overlayInBody(), null);
});

test('openModal title falls back to "Arquivo"', () => {
  const handle = dv.openModal({ meta_json: { file_id: 'FILE123' } });
  assert.equal(findByClass(overlayInBody(), 'cv-drive-viewer-title').textContent, 'Arquivo');
  handle.close();
});

test('the close handle removes the overlay and the keydown listener', () => {
  const before = document._keydownCount();
  const handle = dv.openModal({ meta_json: { file_id: 'FILE123' } });
  assert.equal(document._keydownCount(), before + 1, 'keydown attached while open');
  handle.close();
  assert.equal(overlayInBody(), null, 'overlay removed');
  assert.equal(document._keydownCount(), before, 'keydown detached');
});

test('Escape closes the modal', () => {
  dv.openModal({ meta_json: { file_id: 'FILE123' } });
  document._dispatch('keydown', { key: 'Escape' });
  assert.equal(overlayInBody(), null);
  // A non-Escape key does nothing.
  const h = dv.openModal({ meta_json: { file_id: 'FILE123' } });
  document._dispatch('keydown', { key: 'x' });
  assert.ok(overlayInBody(), 'other keys ignored');
  h.close();
});

test('backdrop click closes, inner click does not', () => {
  dv.openModal({ meta_json: { file_id: 'FILE123' } });
  const overlay = overlayInBody();
  overlay.dispatch('click', { target: overlay.children[0] }); // the modal, inside
  assert.ok(overlayInBody(), 'click inside the modal keeps it open');
  overlay.dispatch('click', { target: overlay }); // backdrop
  assert.equal(overlayInBody(), null, 'backdrop click closes');
});

test('the close button closes the modal', () => {
  dv.openModal({ meta_json: { file_id: 'FILE123' } });
  findByClass(overlayInBody(), 'cv-drive-viewer-close').dispatch('click', {});
  assert.equal(overlayInBody(), null);
});
