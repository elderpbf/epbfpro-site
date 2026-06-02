// RELEASE BLOCKER for Q2 (manifest/tasks/phase-questions.md "The unmount
// contract"). A leak here means phantom polling + duplicate listeners after a
// tab switch, i.e. a broken lesson in front of students. This test mounts the
// real render element, drives its poll loop, then tears it down and asserts that
// EVERY timer and document listener it created is gone.
//
// Q2.1 scope: the render element's own teardown (its internal poll timer, the
// slug-resolution timer, the no-question timeout, and the student-mode
// visibilitychange listener), plus the scoped-callback contract that replaces
// the legacy document `cpq-data` event bus. Q2.2 extends this file to the live
// host (session poll timer, SQA debounce, layout/resizer listeners).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { install, workerFrom } from './_question-harness.mjs';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const ACTIVE_STATE = {
  session: { status: 'open' },
  qa_enabled: true,
  active_question: {
    id: 'q1', type: 'mc', status: 'active', text: 'Qual?',
    options: ['A', 'B'], answer_counts: [1, 2], correct_answers: [0],
    show_results: true, reveal_answer: false, voter_count: 3,
  },
  history: [],
};

// Mount a fresh element in the given mode with a controlled worker payload.
async function mountElement(h, { mode = 'host', session = 'ABCD', slug = null, state = ACTIVE_STATE } = {}) {
  const mod = await import('../questions/question-element.js');
  mod.register();
  const el = new mod.QuestionElement();
  if (session) el.setAttribute('session', session);
  if (slug) el.setAttribute('slug', slug);
  el.setAttribute('mode', mode);
  h.setWorker(workerFrom(state));
  el.isConnected = true;
  el.connectedCallback();
  return { mod, el };
}

test('host element: mount starts a poll timer; teardown clears it (no live timers)', async () => {
  const h = install();
  try {
    assert.equal(h.liveTimers(), 0, 'no timers before mount');
    const { el } = await mountElement(h, { mode: 'host' });
    assert.equal(h.intervals.size, 1, 'mount opened exactly one poll interval');
    el.teardown();
    assert.equal(h.liveTimers(), 0, 'teardown left zero live timers');
  } finally { h.restore(); }
});

test('disconnectedCallback tears down identically (removal from DOM is clean)', async () => {
  const h = install();
  try {
    const { el } = await mountElement(h, { mode: 'host' });
    assert.ok(h.liveTimers() > 0, 'a timer is live while mounted');
    el.disconnectedCallback();
    assert.equal(h.liveTimers(), 0, 'disconnectedCallback cleared every timer');
  } finally { h.restore(); }
});

test('student element: mount adds a visibilitychange listener; teardown removes it', async () => {
  const h = install();
  try {
    assert.equal(h.docListenerCount(), 0, 'no document listeners before mount');
    const { el } = await mountElement(h, { mode: 'student' });
    assert.equal(h.docListenerCount('visibilitychange'), 1, 'student mode wired the visibility listener');
    el.teardown();
    assert.equal(h.docListenerCount(), 0, 'teardown removed the document listener');
    assert.equal(h.liveTimers(), 0, 'teardown cleared the poll timer too');
  } finally { h.restore(); }
});

test('slug element: the slug-resolution timer is torn down', async () => {
  const h = install();
  try {
    const mod = await import('../questions/question-element.js');
    mod.register();
    const el = new mod.QuestionElement();
    el.setAttribute('slug', 'my-lesson');
    el.setAttribute('mode', 'display');
    // No session yet: the linked-session lookup keeps failing, so the element
    // arms a retry interval. Drive the async resolver to completion by hand.
    h.setWorker(async () => ({ ok: false }));
    el.isConnected = true;
    await el._startSlugResolution();
    assert.equal(h.intervals.size, 1, 'slug resolver armed a retry timer');
    el.teardown();
    assert.equal(h.liveTimers(), 0, 'teardown cleared the slug retry timer');
  } finally { h.restore(); }
});

test('teardown is idempotent and leaves nothing live when called twice', async () => {
  const h = install();
  try {
    const { el } = await mountElement(h, { mode: 'student' });
    el.teardown();
    el.teardown();
    assert.equal(h.liveTimers(), 0, 'still zero timers');
    assert.equal(h.docListenerCount(), 0, 'still zero document listeners');
  } finally { h.restore(); }
});

test('scoped onData callback replaces the cpq-data bus; nothing leaks after teardown', async () => {
  const h = install();
  try {
    const { el } = await mountElement(h, { mode: 'host', state: ACTIVE_STATE });
    let dataCalls = 0;
    let lastData = null;
    el.onData = (d) => { dataCalls++; lastData = d; };
    await el._poll();
    assert.equal(dataCalls, 1, 'onData fired once for the polled state');
    assert.equal(lastData.active_question.id, 'q1', 'onData received the full session payload');
    el.teardown();
    // After teardown the element holds no document listeners and no timers, so
    // the scoped callback path cannot fire again behind the host's back.
    assert.equal(h.docListenerCount(), 0, 'no document-level event bus left behind');
    assert.equal(h.liveTimers(), 0, 'no timer left to invoke the callback again');
  } finally { h.restore(); }
});

// ── Source contract: the element replaces the global bus and uses the facade ──
test('the element source replaces the cpq-data document bus with scoped callbacks', () => {
  const src = read('../questions/question-element.js');
  assert.ok(!/['"]cpq-data['"]/.test(src), 'no cpq-data event bus remains');
  assert.match(src, /onData/, 'exposes a scoped onData callback');
  assert.ok(!/\bcallWorker\s*\(/.test(src), 'no direct callWorker call (facade only)');
  assert.match(src, /from\s+['"]\.\.\/js\/codex-api\.js['"]/, 'imports the codex-api facade');
  assert.ok(!/—/.test(src), 'no em dashes');
});

// ── Q2.2 live host: the dashboard owns the embedded element poll, the Q&A feed
//    poll, the SQA debounce, and the layout/document listeners. unmount() must
//    leave nothing live. This is the live-engine half of the release blocker. ──
const OPEN_STATE = { session: { status: 'open' }, qa_enabled: true, active_question: null, history: [] };

function hostWorker(state) {
  return async (p) => {
    if (p && p.action === 'get_session_state') return state;
    return { ok: true, questions: [] };
  };
}

test('live-host: mount arms the element poll + the Q&A poll + a document listener', async () => {
  const h = install();
  try {
    h.setWorker(hostWorker(OPEN_STATE));
    const mod = await import('../questions/live-host.js');
    const container = h.el('div');
    mod.mount(container, { session: { code: 'ABCD', status: 'open', title: 'Aula 1' } });
    assert.ok(h.intervals.size >= 2, 'the embedded element poll AND the Q&A feed poll are armed');
    assert.ok(h.docListenerCount() >= 1, 'live-host registered a document listener');
    mod.unmount();
    assert.equal(h.liveTimers(), 0, 'no live timers after unmount');
    assert.equal(h.docListenerCount(), 0, 'no document listeners after unmount');
  } finally { h.restore(); }
});

test('live-host: unmount is idempotent and safe when never mounted', async () => {
  const h = install();
  try {
    const mod = await import('../questions/live-host.js');
    mod.unmount();
    mod.unmount();
    assert.equal(h.liveTimers(), 0, 'no timers');
    assert.equal(h.docListenerCount(), 0, 'no document listeners');
  } finally { h.restore(); }
});

test('live-host source: facade-only, scoped callbacks, no cpq-data bus, no em dashes', () => {
  const src = read('../questions/live-host.js');
  assert.ok(!/\bcallWorker\s*\(/.test(src), 'no direct callWorker (facade only)');
  assert.ok(!/['"]cpq-data['"]/.test(src), 'no cpq-data event bus');
  assert.match(src, /\.onData\s*=/, 'drives the element through its scoped onData callback');
  assert.ok(!/—/.test(src), 'no em dashes');
});
