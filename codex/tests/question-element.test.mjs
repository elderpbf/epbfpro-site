// Q2.1 render element: the Codex-owned port of the legacy <classpulse-question>
// custom element (questions/question-element.js) + its renderer
// (questions/question-render.js). Covers the LOADING/IDLE/ACTIVE/REVEALED/CLOSED
// state machine, the scoped callbacks, the module source rules, the renderer
// exports, and i18n parity. The teardown/leak guarantees live in
// questions-unmount.test.mjs (the release blocker).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { install, workerFrom } from './_question-harness.mjs';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

function mc(extra) {
  return Object.assign({
    id: 'q1', type: 'mc', status: 'active', text: 'Qual?',
    options: ['A', 'B'], answer_counts: [1, 2], correct_answers: [0],
    show_results: true, reveal_answer: false, voter_count: 3,
  }, extra || {});
}

async function freshEl(h, mode, session = 'ABCD') {
  const mod = await import('../questions/question-element.js');
  mod.register();
  const el = new mod.QuestionElement();
  el.setAttribute('mode', mode);
  if (session) el.setAttribute('session', session);
  el.isConnected = true;
  el._updateConfig(); // apply attributes without arming the poll loop (tests drive _poll by hand)
  return el;
}

// ── contract ────────────────────────────────────────────────────────────────
test('question-element exports the custom-element class, TAG, and register()', async () => {
  const mod = await import('../questions/question-element.js');
  assert.equal(typeof mod.register, 'function', 'exports register()');
  assert.equal(typeof mod.QuestionElement, 'function', 'exports the element class');
  assert.equal(typeof mod.TAG, 'string', 'exports the tag name');
});

test('register() is idempotent (defines the element once)', async () => {
  const h = install();
  try {
    const mod = await import('../questions/question-element.js');
    const tag = mod.register();
    mod.register();
    assert.equal(globalThis.customElements.get(tag), mod.QuestionElement, 'element defined under its tag');
  } finally { h.restore(); }
});

// ── state machine ─────────────────────────────────────────────────────────────
test('an active question drives the ACTIVE state and fires onActive + onData', async () => {
  const h = install();
  try {
    const el = await freshEl(h, 'host');
    h.setWorker(workerFrom({ session: { status: 'open' }, active_question: mc(), history: [] }));
    let active = null; let data = null;
    el.onActive = (q) => { active = q; };
    el.onData = (d) => { data = d; };
    await el._poll();
    assert.equal(el.getState(), 'ACTIVE', 'state is ACTIVE');
    assert.equal(el.getActiveQuestion().id, 'q1', 'getActiveQuestion returns the live question');
    assert.equal(active.id, 'q1', 'onActive fired with the question');
    assert.ok(data && data.active_question, 'onData fired with the full payload');
  } finally { h.restore(); }
});

test('no active question and no shown history drives IDLE and fires onIdle', async () => {
  const h = install();
  try {
    const el = await freshEl(h, 'host');
    h.setWorker(workerFrom({ session: { status: 'open' }, active_question: null, history: [] }));
    let idle = false;
    el.onIdle = () => { idle = true; };
    await el._poll();
    assert.equal(el.getState(), 'IDLE', 'state is IDLE');
    assert.equal(idle, true, 'onIdle fired');
    assert.equal(el.getActiveQuestion(), null, 'no active question');
  } finally { h.restore(); }
});

test('a closed session drives CLOSED, stops polling, and fires onClosed', async () => {
  const h = install();
  try {
    const el = await freshEl(h, 'host');
    el.connectedCallback(); // arms the poll interval
    assert.equal(h.intervals.size, 1, 'poll armed');
    h.setWorker(workerFrom({ session: { status: 'closed' } }));
    let closed = false;
    el.onClosed = () => { closed = true; };
    await el._poll();
    assert.equal(el.getState(), 'CLOSED', 'state is CLOSED');
    assert.equal(closed, true, 'onClosed fired');
    assert.equal(h.intervals.size, 0, 'a closed session stops the poll loop');
  } finally { h.restore(); }
});

test('host mode reveals the last shown closed question (REVEALED) and fires onRevealed', async () => {
  const h = install();
  try {
    const el = await freshEl(h, 'host');
    const closedQ = mc({ id: 'q0', status: 'closed', show_results: true, reveal_answer: true });
    h.setWorker(workerFrom({ session: { status: 'open' }, active_question: null, history: [closedQ] }));
    let revealed = null;
    el.onRevealed = (q) => { revealed = q; };
    await el._poll();
    assert.equal(el.getState(), 'REVEALED', 'state is REVEALED');
    assert.equal(revealed.id, 'q0', 'onRevealed fired with the closed question');
  } finally { h.restore(); }
});

test('student mode does NOT reveal closed history (waits for the next active question)', async () => {
  const h = install();
  try {
    const el = await freshEl(h, 'student');
    const closedQ = mc({ id: 'q0', status: 'closed', show_results: true });
    h.setWorker(workerFrom({ session: { status: 'open' }, active_question: null, history: [closedQ] }));
    await el._poll();
    assert.equal(el.getState(), 'IDLE', 'student stays IDLE on a closed-only history');
  } finally { h.restore(); }
});

// ── source rules ──────────────────────────────────────────────────────────────
test('render element + renderer obey the module source rules', () => {
  for (const rel of ['../questions/question-element.js', '../questions/question-render.js']) {
    const src = read(rel);
    assert.ok(!/\bcallWorker\s*\(/.test(src), `${rel} makes no direct callWorker() call`);
    assert.ok(!/onclick\s*=/.test(src), `${rel} authors no inline onclick`);
    assert.ok(/cdx-/.test(src), `${rel} authors cdx- classes`);
    assert.ok(!/class="ct-/.test(src) && !/class="cv-/.test(src), `${rel} no ct-/cv- classes`);
    assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, `${rel} imports t()`);
    assert.ok(!/—/.test(src), `${rel} has no em dashes`);
  }
  assert.match(read('../questions/question-element.js'), /from\s+['"]\.\.\/js\/codex-api\.js['"]/, 'element imports the facade');
});

test('renderer exports the QR surface the element renders through', async () => {
  const r = await import('../questions/question-render.js');
  assert.equal(typeof r.renderResults, 'function', 'exports renderResults');
  assert.equal(typeof r.renderInput, 'function', 'exports renderInput');
});

// ── i18n parity ───────────────────────────────────────────────────────────────
test('render element + renderer i18n keys exist in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  const keys = [
    'questions.qr_waiting_question', 'questions.qr_session_closed', 'questions.qr_no_linked_session',
    'questions.qr_live', 'questions.qr_finished', 'questions.qr_answer', 'questions.qr_answers',
    'questions.qr_waiting_answers', 'questions.qr_results_hidden', 'questions.qr_anonymous',
    'questions.qr_submit', 'questions.qr_open_placeholder', 'questions.qr_wc_placeholder',
    'questions.qr_wc_hint', 'questions.qr_numeric_placeholder', 'questions.qr_select_all',
    'questions.qr_select_up_to_one', 'questions.qr_select_up_to_many',
    'questions.qr_total', 'questions.qr_average', 'questions.qr_min', 'questions.qr_max',
    'questions.qr_see_answers',
  ];
  for (const k of keys) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
