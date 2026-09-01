// codex/js/labs-state.js, the Labs decisions (on/off, archived, renamed, order) after track-65 took
// them out of localStorage and put them in the database.
//
// Two things are worth pinning here and are not visible from the registry's tests: the LOADER (once,
// shared, and failing OPEN, because the public Trail imports this chain and never loads it) and the
// ONE-SHOT PUSH that hands over the last copy living in Élder's browser. The push is the risky part:
// it runs on a machine that may hold a stale copy, so it must fill gaps and never overwrite, and it
// must not touch `enabled` at all, because the migration seeded that and he still has to verify the seed.
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

// In-memory localStorage, only for the push tests (nothing else in this module touches it).
function browser(entries) {
  const store = new Map(Object.entries(entries || {}).map(([k, v]) => [k, JSON.stringify(v)]));
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  return store;
}

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

// ── the one-shot push ────────────────────────────────────────────────────────
// planLocalPush is the decision table on its own: given what this browser holds and what the server
// holds, what gets written and what only gets reported.
test('the push fills only what the server has no opinion about', () => {
  const plan = state.planLocalPush(
    { archived: ['k3', 'k4'], renamed: { k1: 'Novo', k2: 'Outro' }, order: ['k1', 'k2'], enabled: {} },
    { k4: { ...{ enabled: true, archived: true, display_name: null, sort_order: null } },
      k2: { enabled: true, archived: false, display_name: 'Já tinha', sort_order: null } },
  );
  assert.deepEqual(plan.archived, ['k3'], 'k4 was already archived on the server');
  assert.deepEqual(plan.renamed, [{ key: 'k1', name: 'Novo' }], 'k2 already had a name there');
});

// The order is one fact. Merging this browser's list into a list the server already holds has no
// right answer, so it goes whole or not at all.
test('the push skips the order entirely once the server holds any position', () => {
  const local = { archived: [], renamed: {}, order: ['k1', 'k2'], enabled: {} };
  assert.deepEqual(state.planLocalPush(local, {}).order, ['k1', 'k2'], 'server has none: push it');
  assert.equal(state.planLocalPush(local, { k9: { sort_order: 0, enabled: true, archived: false, display_name: null } }).order,
    null, 'server has one: leave it alone');
});

// The seed owns `enabled` and Élder still has to verify it. A stale browser rewriting it would erase
// exactly the thing he is checking, so the disagreement is reported instead.
test('the push never writes enabled, it reports the disagreement', () => {
  const plan = state.planLocalPush(
    { archived: [], renamed: {}, order: [], enabled: { k11: false, k12: false } },
    { k12: { enabled: false, archived: false, display_name: null, sort_order: null },
      k20: { enabled: false, archived: false, display_name: null, sort_order: null } },
  );
  assert.deepEqual(plan.enabledDiff.map((d) => d.key).sort(), ['k11', 'k20']);
  assert.deepEqual(plan.enabledDiff.find((d) => d.key === 'k11'), { key: 'k11', local: false, server: true },
    'off here, on there');
  assert.deepEqual(plan.enabledDiff.find((d) => d.key === 'k20'), { key: 'k20', local: true, server: false },
    'on here (absent from the map), off there');
  assert.equal(plan.enabledDiff.some((d) => d.key === 'k12'), false, 'agreement is not reported');
});

test('a browser with none of the four keys pushes nothing', async () => {
  browser({});
  state.hydrate({});
  okWorker();
  assert.equal(await state.pushLocalState(), null);
  assert.equal(_calls.length, 0);
});

// With the state unloaded every server field reads as "no opinion", so the additive rule would
// degrade into "push everything" and then clear the keys. That is the same clobber the design exists
// to prevent, arriving through the fail-open path instead of through a stale browser.
test('nothing is handed over while the server side is unknown', async () => {
  const store = browser({ cv_labs_renamed: { k1: 'Foco' }, cv_labs_order: ['k2', 'k1'] });
  state.resetLabState();
  okWorker();
  assert.equal(await state.pushLocalState(), null, 'a failed load means "try again", not "push"');
  assert.equal(_calls.length, 0, 'nothing written');
  assert.ok(store.get('cv_labs_renamed'), 'and the browser keeps its copy for the next attempt');
});

test('the push writes, then clears the four keys so it can never run twice', async () => {
  const store = browser({
    cv_labs_enabled: { k11: false },
    cv_labs_archived: ['k3'],
    cv_labs_renamed: { k1: 'Foco' },
    cv_labs_order: ['k2', 'k1'],
  });
  state.hydrate({});
  okWorker();

  const plan = await state.pushLocalState();
  assert.deepEqual(plan.archived, ['k3']);
  assert.deepEqual(plan.renamed, [{ key: 'k1', name: 'Foco' }]);
  assert.deepEqual(plan.order, ['k2', 'k1']);
  assert.deepEqual(plan.enabledDiff, [{ key: 'k11', local: false, server: true }], 'reported, not written');

  const actions = _calls.map((c) => c.action);
  assert.equal(actions.filter((a) => a === 'ct_labs_state_set_order').length, 1);
  assert.equal(_calls.some((c) => 'enabled' in c), false, 'not one call carried an enabled field');

  assert.equal(store.get('cv_labs_enabled'), undefined);
  assert.equal(store.get('cv_labs_order'), undefined);
  assert.equal(await state.pushLocalState(), null, 'a second open has nothing left to hand over');
});

// The second machine is the one this guards: it arrives with its own copy, finds the gaps already
// filled, and its stale state is discarded rather than kept around to be applied later.
test('a second browser pushes nothing and still ends up with its keys cleared', async () => {
  const store = browser({ cv_labs_renamed: { k1: 'Nome antigo' }, cv_labs_order: ['k9'] });
  state.hydrate({ k1: { display_name: 'Foco', enabled: true, archived: false, sort_order: 0 } });
  okWorker();

  const plan = await state.pushLocalState();
  assert.deepEqual(plan.renamed, [], 'the server already had a name for k1');
  assert.equal(plan.order, null, 'and already had an order');
  assert.equal(_calls.length, 0, 'nothing written');
  assert.equal(store.get('cv_labs_renamed'), undefined, 'the stale copy is gone, not left to reapply');
  assert.equal(state.displayNameOf('k1'), 'Foco', 'and the server value stands');
});
