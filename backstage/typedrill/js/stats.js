// Session + line cpm timing. Session persists across lines; resets on source switch.

let sessionStart = null;
let lineStart = null;
let sessionCorrect = 0;
let sessionErrors = 0;
let lineCorrect = 0;

export function startSession() {
  sessionStart = null;
  lineStart = null;
  sessionCorrect = 0;
  sessionErrors = 0;
  lineCorrect = 0;
}

export function startLine() {
  lineStart = null;
  lineCorrect = 0;
}

export function recordChar(wasCorrect) {
  const now = Date.now();
  if (sessionStart === null) sessionStart = now;
  if (lineStart === null) lineStart = now;
  if (wasCorrect) {
    sessionCorrect++;
    lineCorrect++;
  } else {
    sessionErrors++;
  }
}

function cpm(chars, startMs) {
  if (startMs === null) return 0;
  const minutes = (Date.now() - startMs) / 60000;
  if (minutes <= 0) return 0;
  return Math.round(chars / minutes);
}

export function getSessionCpm() {
  return cpm(sessionCorrect, sessionStart);
}

export function getLineCpm() {
  return cpm(lineCorrect, lineStart);
}

export function tick() {
  const total = sessionCorrect + sessionErrors;
  const acc = total === 0 ? 100 : Math.round((sessionCorrect / total) * 100);
  const sessionElapsedMs = sessionStart === null ? 0 : (Date.now() - sessionStart);
  return {
    sessionCpm: getSessionCpm(),
    lineCpm: getLineCpm(),
    acc,
    sessionElapsedMs,
    sessionCorrect,
    sessionErrors,
    lineCorrect
  };
}
