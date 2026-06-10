// Auto-revelar (live-host): once a chosen share of the expected room has answered
// the active question, close it and show the correct answer automatically, with a
// plateau backstop so the room never hangs waiting for the last few. The trigger
// math + decision live in questions/auto-reveal.js (pure, no DOM/timers/Date) so
// they are unit-testable here; live-host wires them into its existing poll tick.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── revealTarget ───────────────────────────────────────────────
test('revealTarget computes ceil(pct% of headcount), clamped to [1, headcount]', async () => {
  const { revealTarget } = await import('../questions/auto-reveal.js');
  assert.equal(revealTarget(12, 80), 10);   // ceil(9.6)
  assert.equal(revealTarget(12, 90), 11);   // ceil(10.8)
  assert.equal(revealTarget(10, 100), 10);
  assert.equal(revealTarget(3, 50), 2);     // ceil(1.5)
  assert.equal(revealTarget(1, 80), 1);     // never below 1
  assert.equal(revealTarget(12, 150), 12);  // pct capped at 100, never above headcount
});

test('revealTarget returns null for missing/invalid inputs', async () => {
  const { revealTarget } = await import('../questions/auto-reveal.js');
  assert.equal(revealTarget(0, 80), null);
  assert.equal(revealTarget('', 80), null);
  assert.equal(revealTarget(null, 80), null);
  assert.equal(revealTarget(12, 0), null);
  assert.equal(revealTarget(12, null), null);
  assert.equal(revealTarget(NaN, 80), null);
});

// ── autoRevealDecision ─────────────────────────────────────────
test('autoRevealDecision: disabled or no target never reveals', async () => {
  const { autoRevealDecision } = await import('../questions/auto-reveal.js');
  assert.deepEqual(autoRevealDecision({ enabled: false, count: 99, target: 10, lastChangeAt: 0, now: 1e9 }), { reveal: false, reason: null });
  assert.deepEqual(autoRevealDecision({ enabled: true, count: 99, target: null, lastChangeAt: 0, now: 1e9 }), { reveal: false, reason: null });
});

test('autoRevealDecision: reveals with reason "target" once count reaches target', async () => {
  const { autoRevealDecision } = await import('../questions/auto-reveal.js');
  assert.deepEqual(autoRevealDecision({ enabled: true, count: 10, target: 10, lastChangeAt: 1000, now: 1000 }), { reveal: true, reason: 'target' });
  assert.deepEqual(autoRevealDecision({ enabled: true, count: 11, target: 10, lastChangeAt: 1000, now: 1000 }), { reveal: true, reason: 'target' });
});

test('autoRevealDecision: below target with fresh answers does not reveal', async () => {
  const { autoRevealDecision } = await import('../questions/auto-reveal.js');
  assert.deepEqual(autoRevealDecision({ enabled: true, count: 7, target: 10, lastChangeAt: 5000, now: 6000 }), { reveal: false, reason: null });
});

test('autoRevealDecision: plateau backstop fires when answers stall past the window (count >= half target)', async () => {
  const { autoRevealDecision, PLATEAU_MS } = await import('../questions/auto-reveal.js');
  const now = 100000;
  assert.deepEqual(autoRevealDecision({ enabled: true, count: 7, target: 10, lastChangeAt: now - PLATEAU_MS, now }), { reveal: true, reason: 'plateau' });
});

test('autoRevealDecision: plateau does NOT fire on a near-empty stuck count (< half target)', async () => {
  const { autoRevealDecision, PLATEAU_MS } = await import('../questions/auto-reveal.js');
  const now = 100000;
  assert.deepEqual(autoRevealDecision({ enabled: true, count: 2, target: 10, lastChangeAt: now - PLATEAU_MS, now }), { reveal: false, reason: null });
});

test('autoRevealDecision: plateau waits the full window before firing', async () => {
  const { autoRevealDecision, PLATEAU_MS } = await import('../questions/auto-reveal.js');
  const now = 100000;
  assert.deepEqual(autoRevealDecision({ enabled: true, count: 7, target: 10, lastChangeAt: now - (PLATEAU_MS - 1), now }), { reveal: false, reason: null });
});

// ── module source rules ────────────────────────────────────────
test('auto-reveal.js is dependency-free and em-dash-free', () => {
  const src = read('../questions/auto-reveal.js');
  assert.ok(!/^\s*import\b/m.test(src), 'no imports (pure module)');
  assert.ok(!/—/.test(src), 'no em dashes');
  assert.match(src, /export function revealTarget/);
  assert.match(src, /export function autoRevealDecision/);
});

// ── live-host wiring ───────────────────────────────────────────
test('live-host wires the auto-revelar control to the shared logic + facade reveal', () => {
  const src = read('../questions/live-host.js');
  assert.match(src, /from\s+['"]\.\/auto-reveal\.js['"]/, 'imports the auto-reveal helpers');
  assert.match(src, /revealTarget\s*\(/, 'computes the reveal target');
  assert.match(src, /autoRevealDecision\s*\(/, 'decides via the shared logic');
  assert.match(src, /cdx-autoreveal/, 'renders the auto-revelar control');
  assert.match(src, /cdx-auto-on/, 'toggle checkbox');
  assert.match(src, /cdx-auto-head/, 'headcount input');
  assert.match(src, /cdx-auto-pct/, 'percentage input');
  assert.match(src, /setVisibility\s*\(/, 'auto-show reveals results live via setVisibility, never closing the question');
});

// ── CSS ────────────────────────────────────────────────────────
test('questions.css styles the auto-revelar control + progress bar', () => {
  const css = read('../questions/questions.css');
  assert.match(css, /\.cdx-autoreveal\b/);
  assert.match(css, /\.cdx-autoreveal-bar-fill/);
  assert.match(css, /\.cdx-autoreveal\.is-on/);
});

// ── i18n parity ────────────────────────────────────────────────
test('auto-revelar i18n keys exist in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  const keys = [
    'questions.host_autoreveal', 'questions.host_autoreveal_of', 'questions.host_autoreveal_people',
    'questions.host_autoreveal_set_people', 'questions.host_autoreveal_fired_target', 'questions.host_autoreveal_fired_plateau',
  ];
  for (const k of keys) { assert.ok(k in pt, `pt has ${k}`); assert.ok(k in en, `en has ${k}`); }
});
