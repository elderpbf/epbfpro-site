// codex/trilha/js/nexo.js — the live-session orchestrator's poll cadence. The
// mounted DOM is verified on staging; here we pin the one property that the
// real-world bug came down to: a freshly-OPENED session must surface no slower
// than a CLOSED one disappears. The orchestrator polls at the "live" cadence
// while a session is open (only watching for the close edge, which the inner
// element already drives) and at the "idle" cadence while waiting for one to
// open. The idle cadence must be <= the live cadence, or "open" lags behind
// "close" and the host has to ask students to refresh (which is exactly what
// regressed: a 60s idle backoff vs a 15s live poll).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDelay } from '../trilha/js/nexo.js';

test('idle poll is no slower than the live poll (open surfaces ~as fast as close)', () => {
  assert.ok(nextDelay(false) <= nextDelay(true),
    `idle ${nextDelay(false)}ms must be <= live ${nextDelay(true)}ms`);
});

test('idle poll is snappy: a freshly-opened session surfaces within ~15s, not a minute', () => {
  assert.ok(nextDelay(false) > 0 && nextDelay(false) <= 15000,
    `idle cadence ${nextDelay(false)}ms out of the snappy range`);
});

test('a live session still polls on a sane cadence to catch the close edge', () => {
  assert.ok(nextDelay(true) > 0 && nextDelay(true) <= 15000,
    `live cadence ${nextDelay(true)}ms out of the sane range`);
});
