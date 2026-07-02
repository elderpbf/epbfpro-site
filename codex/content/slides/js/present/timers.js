// present/timers.js — presenter clocks that survive closing the presenter window or
// stopping the presentation. The trick: state is anchored to WALL-CLOCK time, not to a
// live interval. A running timer stores when it last resumed (`resumeAt`, epoch ms) plus
// the time banked before that (`accumMs` / `remainingMs`); elapsed/remaining are computed
// from Date.now() on read. So the count keeps advancing while nothing renders it, and a
// reopened window recomputes the true value. Persisted to localStorage. The math is pure
// (now is injected) so it is unit-tested without a clock or DOM.

export const CAP_MS = 4 * 60 * 60 * 1000; // stopwatch hard cap: 4h, so a forgotten timer stops
const KEY = "slides.pv.timers";
const DEFAULT_CD_MIN = 15;

export function defaultTimers() {
  const d = DEFAULT_CD_MIN * 60000;
  return {
    sw: { running: false, accumMs: 0, resumeAt: null },              // stopwatch (counts up)
    cd: { running: false, durationMs: d, remainingMs: d, resumeAt: null }, // countdown (counts down)
  };
}

// ── Stopwatch (counts up, capped at 4h) ──────────────────────────────────────
export function swElapsed(sw, now) {
  const raw = sw.accumMs + (sw.running && sw.resumeAt != null ? now - sw.resumeAt : 0);
  return Math.min(CAP_MS, Math.max(0, raw));
}
export function swStart(sw, now) {
  return sw.running ? sw : { ...sw, running: true, resumeAt: now };
}
export function swPause(sw, now) {
  return sw.running ? { running: false, accumMs: swElapsed(sw, now), resumeAt: null } : sw;
}
export function swReset(sw, now) {
  // zero the banked time; keep running (re-anchored to now) if it was running
  return { running: sw.running, accumMs: 0, resumeAt: sw.running ? now : null };
}
// At/over the 4h cap: auto-pause so it stops instead of running forever.
export function swNormalize(sw, now) {
  return sw.running && swElapsed(sw, now) >= CAP_MS ? swPause(sw, now) : sw;
}

// ── Countdown (counts down; stops at 0) ──────────────────────────────────────
export function cdRemaining(cd, now) {
  const raw = cd.remainingMs - (cd.running && cd.resumeAt != null ? now - cd.resumeAt : 0);
  return Math.max(0, raw);
}
export function cdStart(cd, now) {
  return cd.running || cdRemaining(cd, now) <= 0 ? cd : { ...cd, running: true, resumeAt: now };
}
export function cdPause(cd, now) {
  return cd.running ? { ...cd, running: false, remainingMs: cdRemaining(cd, now), resumeAt: null } : cd;
}
export function cdReset(cd) {
  return { ...cd, running: false, remainingMs: cd.durationMs, resumeAt: null };
}
export function cdSet(cd, minutes) {
  const d = Math.max(0, Math.round(minutes)) * 60000;
  return { running: false, durationMs: d, remainingMs: d, resumeAt: null };
}
// Reached 0 while running: stop it (so the display holds at 00:00, flagged done).
export function cdNormalize(cd, now) {
  return cd.running && cdRemaining(cd, now) <= 0 ? { ...cd, running: false, remainingMs: 0, resumeAt: null } : cd;
}

// mm:ss (or h:mm:ss past an hour) for a millisecond duration.
export function fmt(ms) {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

// ── Persistence ──────────────────────────────────────────────────────────────
export function loadTimers() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.sw && s.cd) return s;
  } catch (e) { /* ignore */ }
  return defaultTimers();
}
export function saveTimers(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}
