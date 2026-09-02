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


// The one-shot push out of `localStorage` LIVED HERE and was removed 2026-09-02, once it had run.
// It carried Élder's renames and lab order over on his first visit to Content > Labs, since those
// four legacy browser keys existed only in his browser and no migration could reach them. It also
// audited the seed for him, and earned its keep on the spot: it caught that the dictated list of
// switched-off labs was one short (k3), which is how that lab came to be retired.
//
// It is gone because migration code that outlives its migration is a trap, and this whole track
// exists because a residual filed as non-blocking sat for six weeks and put a switched-off lab into
// a lesson script. tests/modules.test.mjs now bans those key names with NO exemption: nothing in the
// tree reads that state from a browser any more, including this file.
//
// Consequence worth knowing: a machine that never opened the tab still holds those four keys. They
// are inert, nothing reads them, and clearing them would need the very code just deleted.
