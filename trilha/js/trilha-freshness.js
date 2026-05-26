'use strict';

// Trilha.Freshness -- 5-day NOVO window derived from ct_releases.released_at
// (Unix epoch seconds, shipped inline in the trilha payload). Pure derivation,
// no state, no server round-trip beyond the existing payload.

(function () {
  var Trilha = window.Trilha = window.Trilha || {};

  var WINDOW_DAYS = 5;
  var WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1000;

  function _toMs(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v * 1000;
    var ms = Date.parse(v);
    return isFinite(ms) ? ms : 0;
  }

  function isFresh(item, now) {
    var ts = _toMs(item && item.released_at);
    if (!ts) return false;
    var current = now == null ? Date.now() : now;
    return (current - ts) < WINDOW_MS;
  }

  function countFreshIn(items, now) {
    if (!Array.isArray(items)) return 0;
    var n = 0;
    for (var i = 0; i < items.length; i++) if (isFresh(items[i], now)) n++;
    return n;
  }

  Trilha.Freshness = {
    WINDOW_DAYS: WINDOW_DAYS,
    isFresh: isFresh,
    countFreshIn: countFreshIn,
  };
})();
