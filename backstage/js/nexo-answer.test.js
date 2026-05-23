'use strict';

// Bundle H tests: validate the extracted nexo-answer module (the inline
// student answer panel that both /trilha and the legacy /go redirect-only
// shim depend on).
//
// Run from repo root: node backstage/js/nexo-answer.test.js
// (The repo root is the Site checkout; siblings include /go and /trilha.)

const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');

// --- helpers --------------------------------------------------------------

function makeLocalStorage(seed) {
  const store = Object.assign({}, seed || {});
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem(k, v) { store[k] = String(v); },
    removeItem(k) { delete store[k]; },
    _store: store,
  };
}

function makeFakeElement(tag) {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    children: [],
    _attrs: {},
    _listeners: {},
    _classes: new Set(),
    style: {},
    dataset: {},
    classList: null,
    parentNode: null,
    innerHTML: '',
    textContent: '',
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild(child) {
      const i = el.children.indexOf(child);
      if (i >= 0) el.children.splice(i, 1);
      child.parentNode = null;
      return child;
    },
    setAttribute(k, v) { el._attrs[k] = String(v); },
    removeAttribute(k) { delete el._attrs[k]; },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(el._attrs, k) ? el._attrs[k] : null; },
    addEventListener(name, fn) { (el._listeners[name] = el._listeners[name] || []).push(fn); },
    removeEventListener(name, fn) {
      const arr = el._listeners[name];
      if (!arr) return;
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    },
    dispatchEvent(ev) {
      (el._listeners[ev.type] || []).forEach(fn => fn(ev));
    },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
  };
  el.classList = {
    add(c) { el._classes.add(c); },
    remove(c) { el._classes.delete(c); },
    contains(c) { return el._classes.has(c); },
    toggle(c, on) { if (on) el._classes.add(c); else el._classes.delete(c); },
  };
  return el;
}

// --- 1. nexo-answer.js exists as a shared module --------------------------

const nexoAnswerPath = path.join(__dirname, 'nexo-answer.js');
assert.ok(fs.existsSync(nexoAnswerPath),
  'nexo-answer.js must exist at Site/backstage/js/nexo-answer.js');

const nexoAnswerSrc = fs.readFileSync(nexoAnswerPath, 'utf8');
console.log('PASS  test 1: nexo-answer.js file exists');

// --- 2. Exposes a global window.NexoAnswer with mount/unmount -------------

assert.match(nexoAnswerSrc, /window\.NexoAnswer\s*=/,
  'nexo-answer.js must expose window.NexoAnswer');
assert.match(nexoAnswerSrc, /mount\s*[:=]\s*function|mount\s*\(/,
  'NexoAnswer must define a mount() function');
assert.match(nexoAnswerSrc, /unmount\s*[:=]\s*function|unmount\s*\(/,
  'NexoAnswer must define an unmount() function');
console.log('PASS  test 2: NexoAnswer exposes mount/unmount');

// --- 3. NexoAnswer mount() takes a container element + session code -------

// We require the module under a fake window. The IIFE writes to window.NexoAnswer.
globalThis.window = globalThis;
globalThis.localStorage = makeLocalStorage();
globalThis.document = {
  createElement(tag) { return makeFakeElement(tag); },
  getElementById() { return null; },
  addEventListener() {},
  removeEventListener() {},
  visibilityState: 'visible',
  hidden: false,
};
globalThis.callWorker = async () => ({ ok: true, session: null });

require(nexoAnswerPath);
const NexoAnswer = globalThis.window.NexoAnswer;

assert.ok(NexoAnswer && typeof NexoAnswer.mount === 'function',
  'NexoAnswer.mount must be a function after require');
assert.ok(typeof NexoAnswer.unmount === 'function',
  'NexoAnswer.unmount must be a function after require');
console.log('PASS  test 3: NexoAnswer.mount and unmount loadable as functions');

// --- 4. mount() with no container is a no-op (defensive) ------------------

assert.doesNotThrow(() => NexoAnswer.mount({}),
  'mount() without container must not throw');
assert.doesNotThrow(() => NexoAnswer.unmount(),
  'unmount() with no active mount must not throw');
console.log('PASS  test 4: mount/unmount are defensive on missing container');

// --- 5. mount({container, sessionCode}) populates the container ----------

{
  const container = makeFakeElement('div');
  NexoAnswer.mount({ container: container, sessionCode: 'AB12', sessionTitle: 'Aula 3' });
  assert.ok(container.children.length > 0 || container.innerHTML.length > 0,
    'mount() must populate the container with answer-panel DOM');
  NexoAnswer.unmount();
}
console.log('PASS  test 5: mount populates the container');

// --- 6. /go/index.html is the redirect-only shim --------------------------

const goIndexPath = path.join(__dirname, '..', '..', 'go', 'index.html');
assert.ok(fs.existsSync(goIndexPath), '/go/index.html must still exist');
const goIndex = fs.readFileSync(goIndexPath, 'utf8');

// Must be small (shim, not full answer UI). Old file was ~33KB / 655 lines.
assert.ok(goIndex.length < 8000,
  '/go/index.html must shrink to a redirect shim (<8KB), got ' + goIndex.length);

// Must reference ct_lookup_turma_by_session for the session→turma lookup.
assert.match(goIndex, /ct_lookup_turma_by_session/,
  '/go/index.html must call ct_lookup_turma_by_session');

// Must redirect to /trilha/?c=&t=&k= when lookup succeeds.
assert.match(goIndex, /\/trilha\//,
  '/go/index.html must redirect to /trilha/');

// Must NOT still contain the legacy answer flow.
assert.doesNotMatch(goIndex, /classpulse-question/,
  '/go/index.html must no longer instantiate classpulse-question (answer UI extracted)');
assert.doesNotMatch(goIndex, /joinSession|submitAnswer|state-cpq/,
  '/go/index.html must no longer carry the legacy answer flow code');

console.log('PASS  test 6: /go/index.html is a redirect-only shim using ct_lookup_turma_by_session');

// --- 7. /trilha/index.html loads nexo-answer.js + required deps ----------

const trilhaIndexPath = path.join(__dirname, '..', '..', 'trilha', 'index.html');
const trilhaIndex = fs.readFileSync(trilhaIndexPath, 'utf8');

assert.match(trilhaIndex, /nexo-answer\.js/,
  '/trilha/index.html must include nexo-answer.js');
assert.match(trilhaIndex, /classpulse-question\.min\.js/,
  '/trilha/index.html must include classpulse-question.min.js (needed by nexo-answer)');
assert.match(trilhaIndex, /question-renderer\.js/,
  '/trilha/index.html must include question-renderer.js (needed by classpulse-question)');
assert.match(trilhaIndex, /question-types\.css/,
  '/trilha/index.html must include question-types.css');
console.log('PASS  test 7: /trilha/index.html wires nexo-answer + dependencies');

// --- 8. trilha-nexo.js drops the pill and the fullscreen overlay --------

const trilhaNexoPath = path.join(__dirname, '..', '..', 'trilha', 'js', 'trilha-nexo.js');
const trilhaNexo = fs.readFileSync(trilhaNexoPath, 'utf8');

assert.doesNotMatch(trilhaNexo, /nx-pending-pill/,
  'trilha-nexo.js must no longer render the pending pill');
assert.doesNotMatch(trilhaNexo, /nx-overlay-cta|nx-overlay-card/,
  'trilha-nexo.js must no longer render the fullscreen overlay');
assert.doesNotMatch(trilhaNexo, /\/go\/\?code=/,
  'trilha-nexo.js must no longer link out to /go/?code=');

// It must integrate with NexoAnswer.
assert.match(trilhaNexo, /NexoAnswer/,
  'trilha-nexo.js must mount via NexoAnswer');
console.log('PASS  test 8: trilha-nexo.js drops pill+overlay and integrates NexoAnswer');

// --- 9. trilha.js no longer surfaces the session code or "ao vivo" pill --

const trilhaJsPath = path.join(__dirname, '..', '..', 'trilha', 'js', 'trilha.js');
const trilhaJs = fs.readFileSync(trilhaJsPath, 'utf8');

// The previous header injected an "ao vivo" pill linking to /go/?code=...
assert.doesNotMatch(trilhaJs, /classpulse_session_id\)\s*;[\s\S]{0,800}?Perguntas ao vivo/,
  'trilha.js must no longer render the "Perguntas ao vivo" header pill');
assert.doesNotMatch(trilhaJs, /'\/go\/\?code='/,
  'trilha.js must no longer build /go/?code= URLs');
assert.doesNotMatch(trilhaJs, /'ao vivo'/,
  'trilha.js must drop the mobile "ao vivo" pill label');

console.log('PASS  test 9: trilha.js drops session-code surfaces and ao-vivo pill');

// --- 10. trilha-nexo.js exposes a container slot above content -----------

assert.match(trilhaNexo, /tr-main|tr-tab-content|tr-page/,
  'trilha-nexo.js must mount the inline answer above/inside the trilha content area');

console.log('PASS  test 10: trilha-nexo.js mounts inside the trilha content area');

console.log('\nAll tests passed.');
