// Session and line cpm timing. Populated in task 1E.

export function startSession() {
  console.debug('stub: stats.startSession');
}

export function startLine() {
  console.debug('stub: stats.startLine');
}

export function tick() {
  console.debug('stub: stats.tick');
  return { sessionCpm: 0, lineCpm: 0, acc: 100 };
}
