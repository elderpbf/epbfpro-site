// js/text-search.js
// The ONE free-text matcher for every client-side search in Codex.
//
//   normalize(s)            fold case + STRIP DIACRITICS ('Citação' -> 'citacao')
//   makeMatcher(query)      (…values) => bool, with the query normalized ONCE
//   matchesAny(values, q)   one-shot convenience over makeMatcher
//
// Why a module and not a helper inside js/list-rail.js: FOUR of the seven live
// searches are not rails and never will be (the presets picker, the releases
// composer, certificates, alunos), so a matcher that lived in the rail could not
// reach them and they would keep the accent bug. Same shape as width:resize,
// which is thin rail wiring over the pre-existing js/resizable.js
// (architecture/list-rail.md §6: "o módulo só encapsula o WIRING").
//
// STRIPPING DIACRITICS IS THE POINT, not a nicety: Codex content is Portuguese,
// so a search that compares raw strings answers nothing for "citacao" typed
// against "Aposta na Citação", or "duvida" against "Dúvida". Every search in the
// repo did exactly that before this module. The repo already knew how to fold
// accents (js/dom.js slugify, js/audiences.js slug) but only ever for SLUGS.
//
// Substring, not fuzzy or token-wise, deliberately: it is what all seven call
// sites already did, so adopting this module changes WHICH ACCENTS match and
// nothing else. Fuzzy matching would change every result set at once and is not
// separable from the accent fix during review.

// NFD splits a composed letter into base + combining mark; ̀-ͯ is the
// combining-diacritic block, so dropping it leaves the bare ASCII letter.
export function normalize(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Returns a predicate over any number of candidate values (a row's title, its
// summary, its key...). A BLANK query yields a matcher that accepts everything,
// so a call site never has to guard `if (q)` before filtering.
//
// The query is normalized once per matcher, not once per row: normalize() runs
// two regex passes and a Unicode renormalization, and a rail re-filters its whole
// list on every keystroke.
// Values may be passed variadically (m(it.title, it.summary)) or as one array
// (m(cfg.fields(it))) — the rail hands over whatever a consumer's fields()
// returned, while a hand-written call site reads better spelled out.
export function makeMatcher(query) {
  const q = normalize(query).trim();
  if (!q) return () => true;
  return (...values) => values.flat().some((v) => normalize(v).includes(q));
}

// One-shot form for a call site that matches a single row against a single query
// (a pure filter function that already receives the query as an argument). Inside
// a loop prefer makeMatcher, which hoists the query normalization out of it.
export function matchesAny(values, query) {
  return makeMatcher(query)(...(Array.isArray(values) ? values : [values]));
}
