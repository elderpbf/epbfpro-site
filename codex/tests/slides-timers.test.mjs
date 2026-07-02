// slides-timers.test.mjs — presenter clocks (wall-clock anchored, so they survive
// closing the presenter window / stopping the presentation). `now` is injected, so the
// math is deterministic. CONTRACT: a running timer banks elapsed on pause; a paused one
// is frozen; the stopwatch caps at 4h; the countdown floors at 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultTimers, CAP_MS,
  swElapsed, swStart, swPause, swReset, swNormalize,
  cdRemaining, cdStart, cdPause, cdReset, cdSet, cdNormalize, fmt,
} from '../content/slides/js/present/timers.js';

const MIN = 60000;

// ── Stopwatch ────────────────────────────────────────────────────────────────
test('stopwatch: elapsed of a running timer grows with wall-clock now', () => {
  const sw = swStart(defaultTimers().sw, 1000);
  assert.equal(swElapsed(sw, 1000), 0);
  assert.equal(swElapsed(sw, 1000 + 5000), 5000, 'keeps running while nothing renders it');
});

test('stopwatch: pause banks elapsed and freezes it', () => {
  let sw = swStart(defaultTimers().sw, 0);
  sw = swPause(sw, 10000); // paused at 10s
  assert.equal(swElapsed(sw, 999999), 10000, 'frozen after pause regardless of now');
  assert.equal(sw.running, false);
});

test('stopwatch: resume after pause continues from the banked time', () => {
  let sw = swStart(defaultTimers().sw, 0);
  sw = swPause(sw, 10000);      // 10s banked
  sw = swStart(sw, 50000);      // resume at t=50s
  assert.equal(swElapsed(sw, 50000 + 3000), 13000, '10s banked + 3s running');
});

test('stopwatch: reset zeroes but keeps the running state', () => {
  let sw = swStart(defaultTimers().sw, 0);
  sw = swReset(sw, 20000);
  assert.equal(sw.running, true);
  assert.equal(swElapsed(sw, 20000 + 4000), 4000, 're-anchored to the reset instant');
});

test('stopwatch: caps at 4h and swNormalize auto-pauses at the cap', () => {
  const sw = swStart(defaultTimers().sw, 0);
  assert.equal(swElapsed(sw, CAP_MS + 999999), CAP_MS, 'display never exceeds 4h');
  const capped = swNormalize(sw, CAP_MS + 1);
  assert.equal(capped.running, false, 'auto-paused at the cap');
  assert.equal(swElapsed(capped, CAP_MS + 999999), CAP_MS);
});

// ── Countdown ────────────────────────────────────────────────────────────────
test('countdown: default is 15 minutes', () => {
  assert.equal(defaultTimers().cd.durationMs, 15 * MIN);
  assert.equal(cdRemaining(defaultTimers().cd, 123), 15 * MIN);
});

test('countdown: running decreases and floors at 0', () => {
  let cd = cdStart(cdSet(defaultTimers().cd, 1), 0); // 1 min, started at t=0
  assert.equal(cdRemaining(cd, 20000), 40000, '1min - 20s');
  assert.equal(cdRemaining(cd, 999999), 0, 'never negative');
});

test('countdown: pause freezes remaining; reset restores the full duration', () => {
  let cd = cdStart(cdSet(defaultTimers().cd, 5), 0);
  cd = cdPause(cd, 60000); // 4 min left
  assert.equal(cdRemaining(cd, 999999), 4 * MIN, 'frozen while paused');
  cd = cdReset(cd);
  assert.equal(cd.remainingMs, 5 * MIN);
  assert.equal(cd.running, false);
});

test('countdown: cdNormalize stops it once it hits 0', () => {
  const cd = cdStart(cdSet(defaultTimers().cd, 1), 0);
  const done = cdNormalize(cd, 60000 + 5000);
  assert.equal(done.running, false);
  assert.equal(done.remainingMs, 0);
});

test('countdown: cdSet clamps negatives to 0 and rounds minutes', () => {
  assert.equal(cdSet(defaultTimers().cd, -3).durationMs, 0);
  assert.equal(cdSet(defaultTimers().cd, 2.6).durationMs, 3 * MIN);
});

// ── Formatting ───────────────────────────────────────────────────────────────
test('fmt: mm:ss under an hour, h:mm:ss past it, clamps negatives', () => {
  assert.equal(fmt(0), '00:00');
  assert.equal(fmt(65000), '01:05');
  assert.equal(fmt(3 * 3600000 + 4 * MIN + 9000), '3:04:09');
  assert.equal(fmt(-5000), '00:00');
});
