// codex/js/qr-share-modal.js — the Codex-owned QR share modal (ES-module port of
// window.QRShareModal). Behavioral tests over a minimal DOM stub: the QR image
// URL, the no-joinUrl notice state, custom title/message, and every close path
// (close(), backdrop, button, Escape), plus single-root reuse.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeChild() {
  const L = {};
  return {
    textContent: '', src: '', hidden: false, _attrs: {},
    addEventListener(t2, fn) { (L[t2] = L[t2] || []).push(fn); },
    dispatch(t2, ev) { (L[t2] || []).slice().forEach((fn) => fn(ev || {})); },
    removeAttribute(k) { if (k === 'src') this.src = ''; delete this._attrs[k]; },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
  };
}
const KNOWN = ['qr-share-modal-backdrop', 'qr-share-modal-close', 'qr-share-modal-title', 'qr-share-modal-img', 'qr-share-modal-code', 'qr-share-modal-notice'];
function makeRoot() {
  const children = {};
  return {
    className: '', hidden: false, _html: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; KNOWN.forEach((c) => { if (v.includes(c)) children[c] = makeChild(); }); },
    querySelector(sel) { return children[sel.replace(/^\./, '')] || null; },
  };
}
const body = { children: [], appendChild(c) { this.children.push(c); return c; } };
const docL = {};
globalThis.document = {
  body,
  createElement: () => makeRoot(),
  addEventListener(t2, fn) { (docL[t2] = docL[t2] || []).push(fn); },
  _dispatch(t2, ev) { (docL[t2] || []).slice().forEach((fn) => fn(ev || {})); },
};

const qr = await import('../js/qr-share-modal.js');
const root = () => body.children[0];
const sel = (c) => root().querySelector('.' + c);

test('open(joinUrl) renders the QR image from the qrserver API and the default title', () => {
  const url = 'https://pensoia.com/trilha/acme/turma-1?k=abc123';
  qr.open({ joinUrl: url });
  assert.equal(root().hidden, false, 'modal shown');
  assert.equal(sel('qr-share-modal-title').textContent, 'Sua trilha de aprendizado');
  const img = sel('qr-share-modal-img');
  assert.equal(img.hidden, false);
  assert.ok(img.src.startsWith('https://api.qrserver.com/v1/create-qr-code/?size=1200x1200&margin=2&data='));
  assert.ok(img.src.endsWith(encodeURIComponent(url)), 'joinUrl encoded into the QR data param');
  assert.equal(sel('qr-share-modal-notice').hidden, true, 'notice hidden when a QR is shown');
});

test('open accepts a custom title', () => {
  qr.open({ joinUrl: 'https://x.test/y', title: 'Aponte a câmera' });
  assert.equal(sel('qr-share-modal-title').textContent, 'Aponte a câmera');
});

// track-36 h: the QR view carries the turma's código so the dossier matches the session screen.
test('open shows the código big when provided, hides it otherwise', () => {
  qr.open({ joinUrl: 'https://x.test/y', code: '1561' });
  assert.equal(sel('qr-share-modal-code').textContent, '1561', 'código shown');
  assert.equal(sel('qr-share-modal-code').hidden, false, 'código visible');
  // A later open WITHOUT a code hides the código again (no stale carry-over).
  qr.open({ joinUrl: 'https://x.test/z' });
  assert.equal(sel('qr-share-modal-code').textContent, '', 'código cleared');
  assert.equal(sel('qr-share-modal-code').hidden, true, 'código hidden when absent');
});

test('open without a joinUrl shows the default notice, hides the image', () => {
  qr.open({});
  const img = sel('qr-share-modal-img');
  const notice = sel('qr-share-modal-notice');
  assert.equal(img.hidden, true, 'image hidden');
  assert.equal(img.src, '', 'src cleared');
  assert.equal(notice.hidden, false, 'notice shown');
  assert.match(notice.textContent, /Nenhuma turma vinculada/);
});

test('open without a joinUrl accepts a custom message', () => {
  qr.open({ message: 'Sem turma.' });
  assert.equal(sel('qr-share-modal-notice').textContent, 'Sem turma.');
});

test('close() hides the modal', () => {
  qr.open({ joinUrl: 'https://x.test/y' });
  assert.equal(root().hidden, false);
  qr.close();
  assert.equal(root().hidden, true);
});

test('the backdrop and the close button both close the modal', () => {
  qr.open({ joinUrl: 'https://x.test/y' });
  sel('qr-share-modal-backdrop').dispatch('click', {});
  assert.equal(root().hidden, true, 'backdrop closes');
  qr.open({ joinUrl: 'https://x.test/y' });
  sel('qr-share-modal-close').dispatch('click', {});
  assert.equal(root().hidden, true, 'close button closes');
});

test('Escape closes only while open', () => {
  qr.open({ joinUrl: 'https://x.test/y' });
  document._dispatch('keydown', { key: 'Escape' });
  assert.equal(root().hidden, true, 'Escape closed it');
  // Re-open, a non-Escape key does nothing.
  qr.open({ joinUrl: 'https://x.test/y' });
  document._dispatch('keydown', { key: 'a' });
  assert.equal(root().hidden, false, 'other keys ignored');
  qr.close();
});

test('reuses a single root element across opens', () => {
  qr.open({ joinUrl: 'https://x.test/1' });
  qr.open({ joinUrl: 'https://x.test/2' });
  qr.close();
  assert.equal(body.children.length, 1, 'only one modal root is ever created');
});
