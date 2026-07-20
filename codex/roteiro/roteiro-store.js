// roteiro/roteiro-store.js
// REAL persistence for the aula's Roteiro sub-tab (track-46 fatia 2). Replaces
// the fatia-1 dev-only browser-storage stub: load/save now hit codex-api's
// ct_get_aula_roteiro / ct_set_aula_roteiro through the js/codex-api.js facade,
// never callWorker directly and never the old stub's storage mechanism.
//
// roteiro-view.js calls `store.load(aulaId)` SYNCHRONOUSLY (the Fatia 1 seam,
// kept byte-identical this fatia) and hands the result straight to
// normalizeRoteiro. A real network fetch cannot happen inside that call, so the
// async ct_get_aula_roteiro read happens BEFORE mount, in cohorts.js, and its
// response SEEDS this store via createRoteiroStore(aulaId, seed). load() then
// just replays the seed; save() is the only network call this store makes at
// edit time, matching the "fire-and-forget from the view's side" contract the
// stub documented (roteiro-view.js never awaits it).
//
// roteiro_base_number (which curso base this aula's copy points at) is NOT part
// of the roteiro shape roteiro-view.js edits, so it does not travel through
// load()/save(aulaId, roteiro). It is carried here as private store state,
// seeded from the initial fetch and updated by the base-selector
// (roteiro/roteiro-base.js) via setBaseNumber() right after a copy-down/blank
// apply -- so every save, including a plain nota/chamada edit made a moment
// later, still carries the aula's current base pointer instead of silently
// wiping it back to null.
import { roteiro as api } from '../js/codex-api.js';
import { normalizeRoteiro, emptyRoteiro } from '../js/roteiro-model.js';

// aulaId: the aula this store is bound to (matches the id the view will pass
//         back into save(aulaId, roteiro); not re-validated, the caller owns it).
// seed:   the ct_get_aula_roteiro response fetched just before mount, or null/
//         undefined for a brand-new (unsaved) aula -> blank roteiro, no base.
export function createRoteiroStore(aulaId, seed) {
  let baseNumber = (seed && seed.roteiro_base_number != null) ? Number(seed.roteiro_base_number) : null;
  const initial = seed ? normalizeRoteiro(seed.roteiro_json) : emptyRoteiro();

  return {
    load() {
      return initial;
    },
    save(id, roteiro) {
      const r = normalizeRoteiro(roteiro);
      return api.setAula({
        id: aulaId,
        roteiro_json: JSON.stringify(r),
        roteiro_base_number: baseNumber,
      }).catch((e) => {
        // Hard rule (Codex/CLAUDE.md): a caught error must still reach the debug
        // pill, never be swallowed. save() is fire-and-forget from the view's
        // side, so this catch is the ONLY place a failed persist surfaces.
        _logErr(e);
      });
    },
    // Base-selector seam (outside the view's load/save contract): read/update the
    // curso base this aula's roteiro currently points at.
    getBaseNumber() { return baseNumber; },
    setBaseNumber(n) { baseNumber = (n == null || n === '') ? null : Number(n); },
  };
}

function _logErr(e) {
  const msg = 'codex: roteiro store save failed: ' + ((e && e.message) || e);
  if (typeof window !== 'undefined' && typeof window.bsLog === 'function') window.bsLog(msg, 'error');
}
