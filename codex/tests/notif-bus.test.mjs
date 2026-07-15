// tests/notif-bus.test.mjs
// The notification bus (js/notif-bus.js): the seam that lets the bell's feed ride on a
// request that was already going out, instead of buying one per mount + one per focus.
// The throttle is the cost guarantee, so it is pinned here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as bus from '../js/notif-bus.js';

test('publish fans out to subscribers and caches as latest', () => {
  bus._reset();
  const seen = [];
  bus.subscribe((n) => seen.push(n));
  assert.equal(bus.latest(), null);
  bus.publish({ count: 2, items: [{ notif_key: 'tf:1' }, { notif_key: 'fp:2' }] });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].count, 2);
  assert.equal(bus.latest().count, 2);   // a bell mounted LATER still paints immediately
});

test('publish ignores an empty envelope', () => {
  bus._reset();
  const seen = [];
  bus.subscribe((n) => seen.push(n));
  bus.publish(null);
  bus.publish(undefined);
  assert.equal(seen.length, 0);
  assert.equal(bus.latest(), null);
});

test('unsubscribe stops delivery (a destroyed bell must not keep painting)', () => {
  bus._reset();
  const seen = [];
  const off = bus.subscribe((n) => seen.push(n));
  bus.publish({ count: 1, items: [] });
  off();
  bus.publish({ count: 9, items: [] });
  assert.equal(seen.length, 1);
});

test('a throwing subscriber cannot break the others', () => {
  bus._reset();
  const seen = [];
  bus.subscribe(() => { throw new Error('boom'); });
  bus.subscribe((n) => seen.push(n));
  bus.publish({ count: 1, items: [] });
  assert.equal(seen.length, 1);
});

// THE COST GUARANTEE: one ask per window, shared by the piggyback and the focus fallback.
// Without this, a page-load fan-out would attach the (turma-sweeping) admin feed to every
// parallel call, trading request count for D1 reads — not a win.
test('shouldAsk opens once per window and markAsked closes it', () => {
  bus._reset();
  const t0 = 1000000;
  assert.equal(bus.shouldAsk(t0), true, 'first call may ask');
  bus.markAsked(t0);
  assert.equal(bus.shouldAsk(t0), false, 'closed right after asking');
  assert.equal(bus.shouldAsk(t0 + bus.ASK_INTERVAL_MS - 1), false, 'still closed inside the window');
  assert.equal(bus.shouldAsk(t0 + bus.ASK_INTERVAL_MS), true, 'opens again once elapsed');
});

test('the window is shared: whoever asks first closes it for everyone', () => {
  bus._reset();
  const t0 = 5000000;
  assert.equal(bus.shouldAsk(t0), true);
  bus.markAsked(t0);                       // e.g. the transport piggybacked
  assert.equal(bus.shouldAsk(t0 + 10), false);  // the focus fallback must NOT also spend one
});
