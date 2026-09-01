// codex/js/labs-state.js
// The admin's four decisions about each Lab -- on/off, archived, renamed, display order -- and the
// ONE place that talks to the backend about them (track-65).
//
// WHY THIS MODULE EXISTS. Until now these four facts were four `localStorage` keys, read and written
// in exactly two files, with no trip to the Worker at all. So the on/off was the admin's, in the
// admin's browser, and a lab Élder had switched off was still reachable by any student holding the
// URL. He found it from the inside while prepping the EJUSE lesson: a session built the script on top
// of lab k11, which he had turned off. State also did not survive a machine change, and clearing the
// browser turned every lab back on, because ON was the ABSENCE of a key.
//
// THE SHAPE. The reads stay SYNCHRONOUS, because every consumer (the Presets picker, the Lessons
// sidebar, the Liberações composer, labs-registry itself) reads them inline while rendering; making
// them async would ripple through modules that have nothing to do with this change. So the state is
// loaded ONCE into memory (loadLabState, at boot) and the readers answer from that cache. The writes
// are async, optimistic, and revert the cache if the Worker refuses -- a switch must never show a
// value the database does not hold.
//
// FAIL OPEN, ALWAYS. If the load fails, every reader answers the registry default: enabled, not
// archived, no rename, registry order. That is deliberate on two counts. The public Trail imports
// this chain through labs-registry and never loads the state, and it MUST NOT need to: the filtering
// that matters happens on the server (ctGetItemPublic refuses a lab with enabled = 0), so a client
// that knows nothing is not a leak, it is just a client showing default names. And on the admin
// side, a backend that is down must degrade to "everything visible", never to a blank panel.
//
// NO I/O AT IMPORT TIME. Importing this module makes no call. loadLabState() is the only entry that
// touches the network, and only the admin boot calls it.
import { labsState as api } from './codex-api.js';

// key -> { enabled, archived, display_name, sort_order }. A key with no entry has no decision
// recorded, which means the defaults below -- the same "absence = enabled" semantics the registry
// has always had, now shared by the table.
let _state = {};
let _loaded = false;
let _inflight = null;

const DEFAULTS = { enabled: true, archived: false, display_name: null, sort_order: null };

// Normalize whatever the Worker returned into the shape the readers expect, so a partial or legacy
// row can never make a reader answer `undefined`. Exported because the tests hydrate directly
// (no network) and must go through the same door the loader does.
export function hydrate(map) {
  const next = {};
  for (const key of Object.keys(map || {})) {
    const row = map[key] || {};
    next[key] = {
      enabled: row.enabled !== false,
      archived: row.archived === true,
      display_name: (typeof row.display_name === 'string' && row.display_name.trim()) ? row.display_name.trim() : null,
      sort_order: (row.sort_order === null || row.sort_order === undefined || row.sort_order === '')
        ? null : Number(row.sort_order),
    };
  }
  _state = next;
  _loaded = true;
  return _state;
}

// Test seam: back to "never loaded", so a test can assert the fail-open path.
export function resetLabState() {
  _state = {};
  _loaded = false;
  _inflight = null;
}

export function isLabStateLoaded() { return _loaded; }

// Load once. Concurrent callers share the same in-flight promise, a second call after a successful
// load is a no-op, and a FAILED load is not cached -- the next caller may retry.
export function loadLabState() {
  if (_loaded) return Promise.resolve(_state);
  if (_inflight) return _inflight;
  _inflight = Promise.resolve()
    .then(() => api.get())
    .then((res) => hydrate(res && res.state))
    .catch(() => _state)          // fail open: readers keep answering registry defaults
    .then((s) => { _inflight = null; return s; });
  return _inflight;
}

function _row(key) {
  return _state[key] || DEFAULTS;
}

// ── readers (synchronous, answer from the cache) ─────────────────────────────
export function isEnabled(key) { return _row(key).enabled !== false; }
export function isArchived(key) { return _row(key).archived === true; }
// null when there is no override, so the caller falls back to the registry's own title.
export function displayNameOf(key) { return _row(key).display_name; }

// The stored order as a list of keys, ascending by sort_order. Only labs the admin actually placed
// appear here; everything else has sort_order NULL and keeps its registry position (the registry
// appends them after the ordered ones, which is what covers a lab added since the last drag).
export function orderKeys() {
  return Object.keys(_state)
    .filter((k) => _state[k].sort_order !== null && _state[k].sort_order !== undefined)
    .sort((a, b) => _state[a].sort_order - _state[b].sort_order);
}

// ── writers (async, optimistic, revert on refusal) ───────────────────────────
// The cache moves FIRST so the UI repaints instantly, then the Worker is asked. If it refuses, the
// cache goes back to exactly what it held and the error is re-thrown: the caller repaints and
// reports it. Swallowing the failure here is what would let a switch sit in a position the database
// never accepted.
function _write(key, patch) {
  const before = _state[key] ? Object.assign({}, _state[key]) : null;
  _state[key] = Object.assign({}, _row(key), patch);
  return Promise.resolve()
    .then(() => api.set(Object.assign({ lab_key: key }, patch)))
    .then((res) => {
      if (!res || res.ok !== true) throw new Error('ct_labs_state_set: ' + ((res && res.error) || 'refused'));
      return res;
    })
    .catch((e) => {
      if (before) _state[key] = before; else delete _state[key];
      throw e;
    });
}

export function setEnabled(key, on) { return _write(key, { enabled: !!on }); }
export function setArchived(key, on) { return _write(key, { archived: !!on }); }
// Empty (or whitespace) clears the override and the lab goes back to the registry's name.
export function setDisplayName(key, name) {
  const trimmed = (name || '').trim();
  return _write(key, { display_name: trimmed || null });
}

// The whole order in one call, because a drag is ONE fact. Nineteen per-lab writes can stop at the
// seventh and leave an order that is neither the old one nor the new one, reads back as valid, and
// that no retry repairs. The Worker does the assignment in a single D1 batch.
export function setOrder(keys) {
  const list = (keys || []).map(String);
  const before = {};
  for (const k of Object.keys(_state)) before[k] = _state[k].sort_order;
  for (const k of Object.keys(_state)) _state[k] = Object.assign({}, _state[k], { sort_order: null });
  list.forEach((k, i) => { _state[k] = Object.assign({}, _row(k), { sort_order: i }); });
  return Promise.resolve()
    .then(() => api.setOrder({ keys: list }))
    .then((res) => {
      if (!res || res.ok !== true) throw new Error('ct_labs_state_set_order: ' + ((res && res.error) || 'refused'));
      return res;
    })
    .catch((e) => {
      for (const k of Object.keys(_state)) {
        if (k in before) _state[k] = Object.assign({}, _state[k], { sort_order: before[k] });
        else delete _state[k];
      }
      throw e;
    });
}

// ── the one-shot push out of localStorage ────────────────────────────────────
// The state that is alive TODAY lives in Élder's browser and nowhere else. Migration 0054 seeded the
// on/off from what he dictated, but the renames and the order it could not seed, because they were
// never anywhere a migration can read. So the Labs tab uploads them once, the first time he opens it
// after deploy, and these keys are then cleared.
//
// THIS MODULE IS THE ONLY PLACE ALLOWED TO TOUCH `cv_labs_*`, and tests/modules.test.mjs enforces
// that -- the whole point of the track is that no consumer reads this state from a browser again.
//
// ADDITIVE, NEVER AN OVERWRITE. It fills only fields the server has NO opinion about (display_name
// NULL, sort_order absent, archived still false). Two machines can both open the tab: the first one
// fills the gaps, the second finds them filled and pushes nothing. A stale browser can no longer
// silently undo the truth.
//
// `enabled` IS DELIBERATELY NOT PUSHED. The seed owns it, and Élder still has to VERIFY that seed
// against what he actually has switched off. A browser pushing its own `enabled` would quietly
// rewrite the very thing he is meant to check. Instead the push REPORTS the disagreement, which
// turns "remember to verify the seed" into "the tab tells you".
const LS_KEYS = ['cv_labs_enabled', 'cv_labs_archived', 'cv_labs_renamed', 'cv_labs_order'];

function _readLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;              // absent, distinct from present-but-empty
    const val = JSON.parse(raw);
    return val === null || val === undefined ? fallback : val;
  } catch (e) { return null; }
}

// Exported for tests: the pure half, "given what the browser holds and what the server holds, what
// should be written and what should be reported". No I/O, so the decision table is testable.
export function planLocalPush(local, state) {
  const cur = (k) => (state && state[k]) || DEFAULTS;
  const plan = { archived: [], renamed: [], order: null, enabledDiff: [] };

  const archived = Array.isArray(local.archived) ? local.archived : [];
  for (const k of archived) {
    if (!cur(k).archived) plan.archived.push(k);
  }

  const renamed = (local.renamed && typeof local.renamed === 'object') ? local.renamed : {};
  for (const k of Object.keys(renamed)) {
    const name = typeof renamed[k] === 'string' ? renamed[k].trim() : '';
    if (name && cur(k).display_name === null) plan.renamed.push({ key: k, name });
  }

  // The order is one fact, so it is pushed whole or not at all: only when the server holds no
  // position for any lab. A partial merge of two orders is not a thing that has a right answer.
  const order = Array.isArray(local.order) ? local.order.filter(Boolean) : [];
  const serverHasOrder = Object.keys(state || {}).some((k) => state[k].sort_order !== null && state[k].sort_order !== undefined);
  if (order.length && !serverHasOrder) plan.order = order;

  // Reported, never written. `local.enabled` is the default-on map: a key is present only when OFF.
  const enabledMap = (local.enabled && typeof local.enabled === 'object') ? local.enabled : {};
  const keys = new Set(Object.keys(enabledMap).concat(Object.keys(state || {})));
  for (const k of keys) {
    const localOn = enabledMap[k] !== false;
    if (localOn !== cur(k).enabled) plan.enabledDiff.push({ key: k, local: localOn, server: cur(k).enabled });
  }
  return plan;
}

// Returns null when this browser has nothing to hand over, otherwise the plan that was applied.
// The four keys are cleared either way once the writes land: a browser that arrives second has
// nothing left to push, and its stale copy is discarded rather than kept around to be applied later.
export function pushLocalState() {
  // Nothing is handed over until the server's side is actually KNOWN. With the state unloaded every
  // field reads as "no opinion", so the additive rule silently degrades into "push everything" and
  // then clears the keys: the exact clobber this design exists to prevent, arriving through the
  // fail-open path instead of through a stale browser. A load that failed just means "try again
  // next time", so this returns null and touches nothing.
  if (!_loaded) return Promise.resolve(null);

  let present = false;
  try { present = LS_KEYS.some((k) => localStorage.getItem(k) !== null); } catch (e) { present = false; }
  if (!present) return Promise.resolve(null);

  const local = {
    enabled: _readLocal('cv_labs_enabled', {}),
    archived: _readLocal('cv_labs_archived', []),
    renamed: _readLocal('cv_labs_renamed', {}),
    order: _readLocal('cv_labs_order', []),
  };
  const plan = planLocalPush(local, _state);

  const writes = []
    .concat(plan.archived.map((k) => () => setArchived(k, true)))
    .concat(plan.renamed.map((r) => () => setDisplayName(r.key, r.name)))
    .concat(plan.order ? [() => setOrder(plan.order)] : []);

  // Sequential on purpose: each one is an independent decision, and a burst of parallel writes to
  // the same table buys nothing on a list this size.
  return writes.reduce((chain, run) => chain.then(run), Promise.resolve())
    .then(() => {
      try { LS_KEYS.forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
      return plan;
    });
}
