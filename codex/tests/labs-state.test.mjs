// codex/js/labs-state.js, the Labs decisions (on/off, archived, renamed, order) after track-65 took
// them out of localStorage and put them in the database.
//
// What is pinned here and is not visible from the registry's tests: the LOADER. It runs once, is
// shared by concurrent callers, and fails OPEN, because the public Trail imports this chain through
// labs-registry and never loads the state. That is correct rather than lax: what protects a
// switched-off lab is the server refusing it, so a client that knows nothing is not a leak.
//
// The one-shot push out of localStorage was tested here too, until it was removed on 2026-09-02
// after it had run (see js/labs-state.js for what it did and why it is gone).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const state = await import('../js/labs-state.js');

// The Worker seam. Each test installs what it needs; `_calls` records the payloads.
let _calls = [];
function worker(fn) {
  _calls = [];
  globalThis.callWorker = (p) => { _calls.push(p); return fn(p); };
}
const okWorker = () => worker((p) => Promise.resolve(
  p.action === 'ct_labs_state_set_order' ? { ok: true, keys: p.keys } : { ok: true, lab: {} }
));


test('hydrate normalizes a partial row into the full shape', () => {
  state.hydrate({ k1: { enabled: false }, k2: { display_name: '  Nome  ' }, k3: { sort_order: '2' } });
  assert.equal(state.isEnabled('k1'), false);
  assert.equal(state.isArchived('k1'), false, 'a field the row omits takes the default');
  assert.equal(state.displayNameOf('k2'), 'Nome', 'trimmed');
  assert.equal(state.displayNameOf('k1'), null, 'no override reads as null, not ""');
  assert.deepEqual(state.orderKeys(), ['k3']);
});

test('a blank display_name is no override at all', () => {
  state.hydrate({ k1: { display_name: '   ' } });
  assert.equal(state.displayNameOf('k1'), null);
});

test('orderKeys is ascending and holds only the labs actually placed', () => {
  state.hydrate({ k1: { sort_order: 2 }, k2: { sort_order: 0 }, k3: {}, k4: { sort_order: 1 } });
  assert.deepEqual(state.orderKeys(), ['k2', 'k4', 'k1']);
});

// ── the loader ───────────────────────────────────────────────────────────────
test('loadLabState fetches once and later callers share it', async () => {
  state.resetLabState();
  okWorker();
  globalThis.callWorker = (p) => { _calls.push(p); return Promise.resolve({ ok: true, state: { k9: { enabled: false } } }); };

  const [a, b] = await Promise.all([state.loadLabState(), state.loadLabState()]);
  assert.equal(_calls.length, 1, 'concurrent callers share the in-flight promise');
  assert.equal(_calls[0].action, 'ct_labs_state_get');
  assert.equal(a, b);
  assert.equal(state.isEnabled('k9'), false);

  await state.loadLabState();
  assert.equal(_calls.length, 1, 'and a call after it is loaded does not refetch');
});

// The Trail imports this chain through labs-registry and never loads it; the admin must not get a
// blank panel when the Worker is down. What actually protects a switched-off lab is the server
// refusing it, so a client that knows nothing is not a leak.
test('a failed load fails OPEN and does not cache the failure', async () => {
  state.resetLabState();
  worker(() => Promise.reject(new Error('network')));
  await state.loadLabState();
  assert.equal(state.isLabStateLoaded(), false, 'still unloaded');
  assert.equal(state.isEnabled('k9'), true, 'everything reads as enabled');

  globalThis.callWorker = () => Promise.resolve({ ok: true, state: { k9: { enabled: false } } });
  await state.loadLabState();
  assert.equal(state.isEnabled('k9'), false, 'a retry is allowed and lands');
});

// ── the writers ──────────────────────────────────────────────────────────────
test('a write moves the cache before the Worker answers', async () => {
  state.hydrate({});
  let release;
  const pending = new Promise((r) => { release = () => r({ ok: true, lab: {} }); });
  worker(() => pending);
  const p = state.setEnabled('k1', false);
  // Synchronously, before the call has even been dispatched: the panel repaints off this.
  assert.equal(state.isEnabled('k1'), false, 'the switch has already moved');
  release();
  await p;
  assert.equal(state.isEnabled('k1'), false);
});

// The rollback of a lab that had NO row has to DELETE the row the write created, not leave one
// holding defaults: a phantom row is what would make the next reorder or push believe the server has
// an opinion about a lab nobody ever decided anything about.
test('a refused write rolls back, including a lab that had no row at all', async () => {
  state.hydrate({ k9: { sort_order: 0 } });
  worker(() => Promise.resolve({ error: 'no_auth' }));
  await assert.rejects(() => state.setEnabled('k1', false));
  assert.equal(state.isEnabled('k1'), true, 'back to the default it had');
  await assert.rejects(() => state.setDisplayName('k1', 'Nome'));
  assert.equal(state.displayNameOf('k1'), null, 'and no override was left behind either');
  // A row for k1 would show up here the moment setOrder touched it, since setOrder walks the cache.
  await assert.rejects(() => state.setOrder(['k9']));
  assert.deepEqual(state.orderKeys(), ['k9'], 'the cache still holds exactly the one real row');
});

test('a refused reorder puts every position back', async () => {
  state.hydrate({ k1: { sort_order: 0 }, k2: { sort_order: 1 } });
  worker(() => Promise.reject(new Error('boom')));
  await assert.rejects(() => state.setOrder(['k2', 'k1', 'k3']));
  assert.deepEqual(state.orderKeys(), ['k1', 'k2'], 'the old order survived');
});
