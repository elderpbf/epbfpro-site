'use strict';

// Phase 2H: validates BackstageThumbnail.capture covers required-option
// validation, html2canvas + target guards, happy path upload+register,
// upload-fail short-circuit, fetch-throw error path, and auth forwarding.
//
// Run: node Site/backstage/js/backstage-thumbnail.test.js

const assert = require('node:assert/strict');

// -- helpers ---------------------------------------------------------------

function makeLocalStorage(seed) {
  return {
    _s: Object.assign({}, seed || {}),
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._s, k) ? this._s[k] : null; },
    setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
}

function makeFakeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext() { return { drawImage() {} }; },
    toDataURL() { return 'data:image/jpeg;base64,FAKEBASE64'; },
  };
}

function installEnv(opts) {
  opts = opts || {};
  const targetAvail = opts.target === false ? false : true;
  const html2canvasAvail = opts.html2canvas === false ? false : true;
  const upload = opts.upload || { ok: true };
  const fetchThrows = !!opts.fetchThrows;
  const lsSeed = opts.localStorage || {};

  const fetchCalls = [];
  const probeCalls = [];
  const probeEndCalls = [];
  const toastCalls = [];
  const toastErrorCalls = [];
  const warnings = [];

  globalThis.window = globalThis;
  globalThis.localStorage = makeLocalStorage(lsSeed);

  const targetEl = { offsetWidth: 1024, offsetHeight: 768 };
  globalThis.document = {
    querySelector() { return targetAvail ? targetEl : null; },
    createElement() { return makeFakeCanvas(); },
  };
  globalThis.getComputedStyle = () => ({ backgroundColor: '#abcdef' });

  if (html2canvasAvail) {
    globalThis.html2canvas = async () => makeFakeCanvas();
  } else {
    delete globalThis.html2canvas;
  }

  let callIdx = 0;
  globalThis.fetch = async (url, init) => {
    if (fetchThrows) throw new Error('network fail');
    const body = JSON.parse(init.body);
    fetchCalls.push({ url, body });
    const responses = [upload, { ok: true }];
    const res = responses[callIdx++] || { ok: true };
    return { json: async () => res };
  };

  globalThis.window.bsProbe = (msg, level, title) => probeCalls.push({ msg, level, title });
  globalThis.window.bsProbeEnd = () => probeEndCalls.push(true);
  globalThis.window.showToast = (msg) => toastCalls.push(msg);
  globalThis.window.showToastError = (msg) => toastErrorCalls.push(msg);

  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  return {
    fetchCalls, probeCalls, probeEndCalls, toastCalls, toastErrorCalls, warnings,
    restore() { console.warn = origWarn; },
  };
}

function resetEnv() {
  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.localStorage;
  delete globalThis.html2canvas;
  delete globalThis.getComputedStyle;
  delete globalThis.fetch;
  delete globalThis.bsProbe;
  delete globalThis.bsProbeEnd;
  delete globalThis.showToast;
  delete globalThis.showToastError;
}

// -- bootstrap: window must exist before requiring the IIFE ---------------

globalThis.window = globalThis;
const BackstageThumbnail = require('./backstage-thumbnail.js');
resetEnv();

// -- tests -----------------------------------------------------------------

(async () => {

  // Test 1: missing slug -> probe error, no fetch
  {
    const env = installEnv();
    await BackstageThumbnail.capture({ title: 't', engine: 'reveal', targetSelector: '#x' });
    assert.equal(env.fetchCalls.length, 0);
    assert.ok(env.probeCalls.some(c => c.msg.includes('missing required option slug')));
    assert.equal(env.probeEndCalls.length, 1);
    env.restore();
    resetEnv();
    console.log('PASS  test 1: missing slug probes error and returns without fetch');
  }

  // Test 2: html2canvas undefined -> warn + probe + no fetch
  {
    const env = installEnv({ html2canvas: false });
    await BackstageThumbnail.capture({ slug: 's', title: 't', engine: 'reveal', targetSelector: '#x' });
    assert.equal(env.fetchCalls.length, 0);
    assert.ok(env.warnings.some(w => w.includes('html2canvas not loaded')));
    assert.ok(env.probeCalls.some(c => c.msg.includes('html2canvas not loaded')));
    assert.equal(env.probeEndCalls.length, 1);
    env.restore();
    resetEnv();
    console.log('PASS  test 2: html2canvas undefined warns and skips fetch');
  }

  // Test 3: target missing -> probe + no fetch
  {
    const env = installEnv({ target: false });
    await BackstageThumbnail.capture({ slug: 's', title: 't', engine: 'reveal', targetSelector: '#nope' });
    assert.equal(env.fetchCalls.length, 0);
    assert.ok(env.probeCalls.some(c => c.msg.includes('target not found')));
    assert.equal(env.probeEndCalls.length, 1);
    env.restore();
    resetEnv();
    console.log('PASS  test 3: missing target probes error and skips fetch');
  }

  // Test 4: happy path -> 2 fetch calls, correct shape
  {
    const env = installEnv({ localStorage: { bs_pw_hash: 'sha256abc' } });
    await BackstageThumbnail.capture({
      slug: 'foo',
      title: 'Foo Title',
      engine: 'panels',
      targetSelector: '#pn-host',
    });
    assert.equal(env.fetchCalls.length, 2);
    assert.equal(env.fetchCalls[0].body.action, 'upload_image');
    assert.equal(env.fetchCalls[0].body.slug, 'foo');
    assert.equal(env.fetchCalls[0].body.filename, 'thumbnail.jpg');
    assert.equal(env.fetchCalls[0].body.content_type, 'image/jpeg');
    assert.equal(env.fetchCalls[1].body.action, 'register_presentation');
    assert.equal(env.fetchCalls[1].body.engine, 'panels');
    assert.equal(env.fetchCalls[1].body.slug, 'foo');
    assert.equal(env.fetchCalls[1].body.title, 'Foo Title');
    assert.ok(env.fetchCalls[1].body.thumbnail.includes('/foo/thumbnail.jpg'));
    env.restore();
    resetEnv();
    console.log('PASS  test 4: happy path calls upload_image then register_presentation');
  }

  // Test 5: happy path -> success toast
  {
    const env = installEnv();
    await BackstageThumbnail.capture({ slug: 's', title: 't', engine: 'reveal', targetSelector: '#x' });
    assert.deepEqual(env.toastCalls, ['Thumbnail atualizado.']);
    env.restore();
    resetEnv();
    console.log('PASS  test 5: happy path fires showToast');
  }

  // Test 6: probe receives Target line + Upload OK, probeEnd once
  {
    const env = installEnv();
    await BackstageThumbnail.capture({ slug: 's', title: 't', engine: 'reveal', targetSelector: '#x' });
    assert.ok(env.probeCalls.some(c => c.msg.startsWith('Target:')));
    assert.ok(env.probeCalls.some(c => c.msg === 'Upload: OK'));
    assert.equal(env.probeEndCalls.length, 1);
    env.restore();
    resetEnv();
    console.log('PASS  test 6: probe logs Target and Upload OK, probeEnd once');
  }

  // Test 7: upload returns ok:false -> skip register, probeEnd once
  {
    const env = installEnv({ upload: { ok: false } });
    await BackstageThumbnail.capture({ slug: 's', title: 't', engine: 'reveal', targetSelector: '#x' });
    assert.equal(env.fetchCalls.length, 1);
    assert.equal(env.fetchCalls[0].body.action, 'upload_image');
    assert.ok(env.probeCalls.some(c => c.msg === 'Upload: FAIL'));
    assert.equal(env.probeEndCalls.length, 1);
    env.restore();
    resetEnv();
    console.log('PASS  test 7: upload fail skips register and probeEnd once');
  }

  // Test 8: fetch throws -> FAILED probe + error toast + probeEnd once
  {
    const env = installEnv({ fetchThrows: true });
    await BackstageThumbnail.capture({ slug: 's', title: 't', engine: 'reveal', targetSelector: '#x' });
    assert.ok(env.probeCalls.some(c => c.msg.startsWith('FAILED:')));
    assert.deepEqual(env.toastErrorCalls, ['Erro ao capturar thumbnail.']);
    assert.equal(env.probeEndCalls.length, 1);
    env.restore();
    resetEnv();
    console.log('PASS  test 8: fetch throw surfaces FAILED probe and showToastError');
  }

  // Test 9: auth token from localStorage forwarded to both fetch calls
  {
    const env = installEnv({ localStorage: { bs_pw_hash: 'token123' } });
    await BackstageThumbnail.capture({ slug: 's', title: 't', engine: 'reveal', targetSelector: '#x' });
    assert.equal(env.fetchCalls[0].body.auth_token, 'token123');
    assert.equal(env.fetchCalls[1].body.auth_token, 'token123');
    env.restore();
    resetEnv();
    console.log('PASS  test 9: auth_token forwarded to upload_image and register_presentation');
  }

})().catch(err => {
  console.error('FAIL', err);
  process.exit(1);
});
