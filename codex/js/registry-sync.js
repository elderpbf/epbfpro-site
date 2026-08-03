// codex/js/registry-sync.js
// Labs and Interativos are shipped artifacts: their catalogue lives in code
// (js/labs-registry.js, js/interativos-registry.js), but Liberações can only release
// what exists as a ct_items row. The Worker used to keep its OWN hand-copied catalogue
// of each and fell seven labs behind without anything failing: k5, k6 and k18-k22 were
// live on the site and simply absent from Liberações. The registry now travels WITH the
// call, so there is one catalogue and nothing left to sync by hand.
//
// This is the ONE place that builds that payload. Every caller goes through it, so a new
// consumer cannot reintroduce a second (and eventually different) idea of the catalogue.
import { LABS } from './labs-registry.js';
import { INTERATIVOS } from './interativos-registry.js';
import { content as api } from './codex-api.js';

// Straight off the registry constants, deliberately NOT off orderedLabs()/getAllItems():
// order, archive and rename are client-only overlays living in this browser's
// localStorage, and pushing them into ct_items would make one admin's local rename
// everyone's title.
const seed = (list) => list.map((e) => ({ key: e.key, title: e.title, summary: e.summary }));

export function syncLabItems() {
  return api.ensureLabItems({ labs: seed(LABS) });
}

export function syncInterativoItems() {
  return api.ensureInterativoItems({ interativos: seed(INTERATIVOS) });
}
