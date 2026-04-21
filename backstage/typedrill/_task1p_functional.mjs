// TypeDrill task 1P -- strip-not-drop + stats wiring functional harness.

const storage = new Map();
globalThis.localStorage = {
  getItem: (k) => storage.has(k) ? storage.get(k) : null,
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear()
};
globalThis.window = { addEventListener: () => {} };

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const custom = await import('./js/sources/custom.js');
const common = await import('./js/sources/common.js');
const stats = await import('./js/stats.js');

// --- strip-not-drop: custom preserves adjacent words when pontuacao toggles off ---
const r1 = custom.generate(
  { letras: true, pontuacao: false },
  { settings: { wordsPerLesson: 10 } },
  { text: 'Olá, mundo! Como vai? agora' }
);
assert(r1.length > 0, '1P: custom returns lines with pontuacao:false');
const joined = r1.join(' ');
assert(joined.includes('Olá'), 'Olá retained');
assert(joined.includes('mundo'), 'mundo retained');
assert(joined.includes('Como'), 'Como retained');
assert(joined.includes('vai'), 'vai retained');
assert(!joined.includes(','), 'comma stripped');
assert(!joined.includes('!'), 'exclaim stripped');
assert(!joined.includes('?'), 'question mark stripped');

// --- custom with pontuacao:true retains punct in words ---
const r2 = custom.generate(
  { letras: true, pontuacao: true },
  {},
  { text: 'Olá, mundo!' }
);
const joined2 = r2.join(' ');
assert(joined2.includes(',') || joined2.includes('!'), 'with pontuacao:true punct remains somewhere');

// --- custom with numeros:false strips digits but keeps the word ---
const r3 = custom.generate(
  { letras: true, numeros: false },
  {},
  { text: 'ano 2024 foi bom' }
);
const joined3 = r3.join(' ');
assert(joined3.includes('ano'), 'ano retained');
assert(joined3.includes('foi'), 'foi retained');
assert(joined3.includes('bom'), 'bom retained');
assert(!/\d/.test(joined3), 'digits stripped entirely');

// --- pure-digit word becomes empty and is dropped ---
const r4 = custom.generate({ letras: true }, {}, { text: 'abc 123 def' });
const tokens4 = r4.join(' ').split(' ').filter(Boolean);
assert(tokens4.includes('abc'), 'abc retained');
assert(tokens4.includes('def'), 'def retained');
assert(!tokens4.includes('123'), '123 dropped (empty after strip)');
assert(!tokens4.some(t => t === ''), 'no empty tokens');

// --- common.js letters-only pool still functions (regression) ---
const r5 = common.generate({ letras: true }, null, { wordsPerLesson: 10, repeatWord: 1, linesPerBatch: 1 });
assert(r5.length === 1 && r5[0].split(' ').length === 10, 'common still emits proper line');

// --- stats wiring: recordChar + tick produce non-zero values ---
stats.startSession();
stats.startLine();
await new Promise(r => setTimeout(r, 30));
for (let i = 0; i < 5; i++) stats.recordChar(true);
stats.recordChar(false);
await new Promise(r => setTimeout(r, 30));
const t = stats.tick();
assert(t.sessionCorrect === 5, `stats.tick sessionCorrect === 5 (got ${t.sessionCorrect})`);
assert(t.sessionErrors === 1, `stats.tick sessionErrors === 1 (got ${t.sessionErrors})`);
assert(t.sessionElapsedMs > 0, 'sessionElapsedMs advances');
assert(t.acc > 0 && t.acc <= 100, `accuracy within range (got ${t.acc})`);

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
