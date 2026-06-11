// In-host answer simulator (debug-gated "Simular respostas" button on the live
// host). The answer-building logic lives in questions/sim-answers.js, a PURE,
// dependency-free browser re-instantiation of the `live-session-simulator`
// capability (Setup/Blueprints/CATALOG.md). live-host wires it to the frozen
// public submit_answer action, gated behind the bs_debug flag so it can never
// fire in a real class.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── buildAnswer per type ───────────────────────────────────────
test('buildAnswer returns an in-range index for mc/tf/poll', async () => {
  const { buildAnswer, makeRng } = await import('../questions/sim-answers.js');
  for (const type of ['mc', 'tf', 'poll']) {
    const q = { id: 'q1', type, options: ['A', 'B', 'C', 'D'] };
    const a = buildAnswer(q, makeRng(123), 0.6);
    assert.ok(a && typeof a.answer_index === 'number', `${type} yields answer_index`);
    assert.ok(a.answer_index >= 0 && a.answer_index < 4, `${type} index in range`);
    assert.equal(a.answer_value, undefined, `${type} has no answer_value`);
  }
});

test('buildAnswer returns a pooled string for open/wordcloud', async () => {
  const { buildAnswer, makeRng } = await import('../questions/sim-answers.js');
  for (const type of ['open', 'wordcloud']) {
    const a = buildAnswer({ id: 'q2', type, options: [] }, makeRng(7), 0.6);
    assert.ok(a && typeof a.answer_value === 'string' && a.answer_value.length > 0, `${type} yields text`);
    assert.equal(a.answer_index, undefined, `${type} has no answer_index`);
  }
});

test('buildAnswer returns a numeric value within range for rating/numeric', async () => {
  const { buildAnswer, makeRng } = await import('../questions/sim-answers.js');
  for (const type of ['rating', 'numeric']) {
    const a = buildAnswer({ id: 'q3', type, options: { min: 2, max: 6 } }, makeRng(9), 0.6);
    const v = Number(a.answer_value);
    assert.ok(Number.isFinite(v) && v >= 2 && v <= 6, `${type} value in [2,6]`);
  }
});

test('buildAnswer parses options given as a JSON string', async () => {
  const { buildAnswer, makeRng } = await import('../questions/sim-answers.js');
  const a = buildAnswer({ id: 'q4', type: 'mc', options: '["X","Y"]' }, makeRng(1), 0.6);
  assert.ok(a && a.answer_index >= 0 && a.answer_index < 2);
});

test('buildAnswer returns null when a choice question has no options', async () => {
  const { buildAnswer, makeRng } = await import('../questions/sim-answers.js');
  assert.equal(buildAnswer({ id: 'q5', type: 'mc', options: [] }, makeRng(1), 0.6), null);
});

test('buildAnswer is deterministic for the same seed + question', async () => {
  const { buildAnswer, makeRng } = await import('../questions/sim-answers.js');
  const q = { id: 'qX', type: 'mc', options: ['A', 'B', 'C'] };
  assert.deepEqual(buildAnswer(q, makeRng(42), 0.6), buildAnswer(q, makeRng(42), 0.6));
});

test('skew=1 sends every vote to the per-question winner', async () => {
  const { buildAnswer, makeRng, hashSeed } = await import('../questions/sim-answers.js');
  const q = { id: 'win', type: 'mc', options: ['A', 'B', 'C', 'D'] };
  const winner = hashSeed('win') % 4;
  for (let s = 0; s < 25; s++) {
    assert.equal(buildAnswer(q, makeRng(s), 1).answer_index, winner);
  }
});

// ── module source rules ────────────────────────────────────────
test('sim-answers.js is dependency-free and em-dash-free', () => {
  const src = read('../questions/sim-answers.js');
  assert.ok(!/^\s*import\b/m.test(src), 'no imports (pure module)');
  assert.ok(!/—/.test(src), 'no em dashes');
  assert.match(src, /export function buildAnswer/);
});

// ── facade wiring ──────────────────────────────────────────────
test('codex-api facade maps submitAnswer to the frozen public submit_answer action', () => {
  const src = read('../js/codex-api.js');
  assert.match(src, /submitAnswer:\s*\(p\)\s*=>\s*call\('submit_answer'/, 'facade exposes submitAnswer');
});

// ── live-host wiring (debug-gated) ─────────────────────────────
test('live-host wires a debug-gated in-host simulator using the pure logic + facade', () => {
  const src = read('../questions/live-host.js');
  assert.match(src, /from\s+['"]\.\/sim-answers\.js['"]/, 'imports the pure sim logic');
  assert.match(src, /buildAnswer\s*\(/, 'builds answers via the shared logic');
  assert.match(src, /\.submitAnswer\s*\(/, 'submits via the facade');
  assert.match(src, /\.studentInbox\s*\(/, 'registers bot presence (inbox heartbeat) so the connected-count + auto-revelar see them');
  assert.match(src, /cdx-sim\b/, 'renders the simulator control');
  assert.match(src, /data-act=["']sim-run["']/, 'has the run action');
  assert.match(src, /bs_debug/, 'gated behind the bs_debug flag');
});

// ── i18n parity ────────────────────────────────────────────────
test('simulator i18n keys exist in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  const keys = [
    'questions.host_sim_label', 'questions.host_sim_run', 'questions.host_sim_no_q',
    'questions.host_sim_progress', 'questions.host_sim_done',
  ];
  for (const k of keys) { assert.ok(k in pt, `pt has ${k}`); assert.ok(k in en, `en has ${k}`); }
});
