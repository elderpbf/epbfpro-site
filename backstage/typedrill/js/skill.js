// Per-character skill tracker backed by localStorage (td_skill_v1).
// Populated in task 1D.

export function recordAttempt(expectedChar, wasCorrect, wpm) {
  console.debug('stub: skill.recordAttempt', expectedChar, wasCorrect, wpm);
}

export function get() {
  console.debug('stub: skill.get');
  return null;
}

export function set(obj) {
  console.debug('stub: skill.set', obj);
}

export function reset() {
  console.debug('stub: skill.reset');
}
