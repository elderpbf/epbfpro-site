// questions/auto-reveal.js
// Pure helpers for the live-host "Auto-revelar" control. Given an expected
// headcount and a percentage, compute the answer count at which the host wants
// the correct answer revealed; then, on each poll tick, decide whether to reveal
// now, either because the target was reached, or because answers stopped coming
// in (the plateau safety net) so the room never hangs waiting for the last few.
//
// No DOM, no timers, no Date.now(): live-host feeds in the live answer count plus
// the timestamps it already tracks across polls, so this stays unit-testable in
// a plain node --test run.

export const PLATEAU_MS = 12000;   // answers idle this long => plateau backstop
export const DEFAULT_PCT = 80;     // sensible default for the percentage field

// The answer count that satisfies `pct`% of `headcount`, clamped to
// [1, headcount]. Returns null when either input is missing or invalid, so the
// caller simply treats auto-reveal as having "no target" (and stays inert).
export function revealTarget(headcount, pct) {
  const h = Number(headcount);
  const p = Number(pct);
  if (!Number.isFinite(h) || h < 1) return null;
  if (!Number.isFinite(p) || p <= 0) return null;
  const capped = Math.min(p, 100);
  const whole = Math.round(h);
  return Math.max(1, Math.min(whole, Math.ceil(whole * capped / 100)));
}

// Decide whether to reveal now.
//   enabled       host turned the control on
//   count         live answers to the active question
//   target        from revealTarget() (null => never auto-reveal)
//   lastChangeAt  ms timestamp of the last time `count` changed
//   now           current ms timestamp
//   plateauMs     idle window before the backstop fires
// The plateau only fires once at least half the target has answered, so a stuck
// near-empty count never closes the question prematurely.
export function autoRevealDecision({ enabled, count, target, lastChangeAt, now, plateauMs = PLATEAU_MS }) {
  if (!enabled || target == null) return { reveal: false, reason: null };
  const c = Number(count) || 0;
  if (c >= target) return { reveal: true, reason: 'target' };
  const floor = Math.max(1, Math.ceil(target / 2));
  if (plateauMs > 0 && lastChangeAt != null && c >= floor && (now - lastChangeAt) >= plateauMs) {
    return { reveal: true, reason: 'plateau' };
  }
  return { reveal: false, reason: null };
}
