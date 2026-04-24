// Session + line cpm timing. Session persists across lines; resets on source switch.
// Idle-pause: any gap between keystrokes longer than IDLE_THRESHOLD_MS is excluded
// from elapsed time, so pausing for a sip of water doesn't drag cpm down.

const IDLE_THRESHOLD_MS = 2000;

let sessionActiveMs = 0;
let lineActiveMs = 0;
let lastKeyTs = null;
let sessionStarted = false;
let sessionCorrect = 0;
let sessionErrors = 0;
let lineCorrect = 0;

export function startSession() {
  sessionActiveMs = 0;
  lineActiveMs = 0;
  lastKeyTs = null;
  sessionStarted = false;
  sessionCorrect = 0;
  sessionErrors = 0;
  lineCorrect = 0;
}

export function startLine() {
  lineActiveMs = 0;
  lineCorrect = 0;
}

export function recordChar(wasCorrect) {
  const now = Date.now();
  if (!sessionStarted) {
    sessionStarted = true;
    lastKeyTs = now;
  } else if (lastKeyTs !== null) {
    const delta = Math.min(now - lastKeyTs, IDLE_THRESHOLD_MS);
    sessionActiveMs += delta;
    lineActiveMs += delta;
    lastKeyTs = now;
  } else {
    lastKeyTs = now;
  }
  if (wasCorrect) {
    sessionCorrect++;
    lineCorrect++;
  } else {
    sessionErrors++;
  }
}

function graceMs(now) {
  if (lastKeyTs === null) return 0;
  return Math.min(now - lastKeyTs, IDLE_THRESHOLD_MS);
}

function cpmFrom(chars, ms) {
  if (ms <= 0) return 0;
  return Math.round(chars / (ms / 60000));
}

export function getSessionCpm() {
  return cpmFrom(sessionCorrect, sessionActiveMs + graceMs(Date.now()));
}

export function getLineCpm() {
  return cpmFrom(lineCorrect, lineActiveMs + graceMs(Date.now()));
}

export function tick() {
  const now = Date.now();
  const grace = graceMs(now);
  const sMs = sessionActiveMs + grace;
  const lMs = lineActiveMs + grace;
  const total = sessionCorrect + sessionErrors;
  const acc = total === 0 ? 100 : Math.round((sessionCorrect / total) * 100);
  return {
    sessionCpm: cpmFrom(sessionCorrect, sMs),
    lineCpm: cpmFrom(lineCorrect, lMs),
    acc,
    sessionElapsedMs: sMs,
    sessionCorrect,
    sessionErrors,
    lineCorrect
  };
}
