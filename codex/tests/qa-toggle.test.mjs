// Student questions (Q&A) are a host toggle that starts OFF (Élder, 2026-10-12), and the student's
// Q&A inbox + presence ride on the element's state poll instead of a 4s timer of their own that
// never paused. These pin both, because each used to cost requests during the whole lecture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { install } from './_question-harness.mjs';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));

async function feed(h) {
  const calls = [];
  h.setWorker(async (p) => { calls.push(p); return { ok: true, questions: [] }; });
  const { createQaFeed } = await import('../questions/live-qa.js');
  const toggleEl = h.el('input');
  const feedEl = h.el('div');
  const offEl = h.el('p');
  const qa = createQaFeed({ sessionCode: 'ABCD', feedEl, badgeEl: h.el('span'), toggleEl, offEl });
  return { qa, calls, toggleEl, feedEl, offEl };
}

test('Q&A feed starts off: no forced enable, no feed poll, the off hint shows', async () => {
  const h = install();
  try {
    const { qa, calls, feedEl, offEl } = await feed(h);
    await tick();
    assert.equal(calls.filter((c) => c.action === 'toggle_qa').length, 0, 'mounting no longer switches Q&A on');
    assert.equal(h.intervals.size, 0, 'no feed poll while off');
    assert.equal(feedEl.hidden, true);
    assert.equal(offEl.hidden, false);
    qa.destroy();
  } finally { h.restore(); }
});

test('the session state turns the feed on and off', async () => {
  const h = install();
  try {
    const { qa, toggleEl, feedEl } = await feed(h);
    qa.syncFromState({ qa_enabled: true, active_question: null });
    assert.equal(toggleEl.checked, true);
    assert.equal(feedEl.hidden, false);
    assert.equal(h.intervals.size, 1, 'feed poll armed while on');
    qa.syncFromState({ qa_enabled: false, active_question: null });
    assert.equal(h.intervals.size, 0, 'feed poll stopped when off');
    qa.destroy();
  } finally { h.restore(); }
});

test('flipping the switch saves it, and a stale poll does not throw it back', async () => {
  const h = install();
  try {
    const { qa, calls, toggleEl } = await feed(h);
    toggleEl.checked = true;
    toggleEl._listeners.find((l) => l.t === 'change').f();
    await tick();
    const sent = calls.filter((c) => c.action === 'toggle_qa');
    assert.deepEqual(sent.map((c) => [c.code, c.enabled]), [['ABCD', 1]]);
    qa.syncFromState({ qa_enabled: false, active_question: null });   // left before the flip
    assert.equal(toggleEl.checked, true, 'the in-flight poll is ignored for a few seconds');
    qa.destroy();
    assert.equal(toggleEl._listeners.length, 0, 'destroy removes the switch listener');
  } finally { h.restore(); }
});

test('a named student poll carries student_name; the host and an unnamed student do not', async () => {
  for (const [mode, name, want] of [['student', 'Ana', 'Ana'], ['student', '', undefined], ['host', 'Ana', undefined]]) {
    const h = install();
    try {
      const mod = await import('../questions/question-element.js');
      mod.register();
      const el = new mod.QuestionElement();
      el.setAttribute('mode', mode);
      el.setAttribute('session', 'ABCD');
      el.isConnected = true;
      el._updateConfig();
      if (name) el.studentName = name;
      let sent = null;
      h.setWorker(async (p) => { if (p.action === 'get_session_state') sent = p; return { session: { status: 'open' }, active_question: null, history: [] }; });
      await el._poll();
      assert.equal(sent.student_name, want, `${mode}/${name || 'unnamed'}`);
    } finally { h.restore(); }
  }
});

test('the Trilha answer page runs no inbox timer of its own', () => {
  const src = read('../trilha/js/nexo-answer.js');
  assert.ok(!/studentInbox\s*\(/.test(src), 'no separate cp_student_inbox call');
  assert.ok(!/setInterval\s*\(/.test(src), 'no timer of its own');
  assert.match(src, /cpq\.studentName = studentName/, 'names the student on the element poll');
  assert.match(src, /data\.my_questions/, 'reads its answers from the state poll');
});
