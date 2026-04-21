// TypeDrill task 1I -- symbols source functional harness.
// No DOM needed for generate(); import data + source and drive levels 1-5.
// Run from typedrill/: node _task1i_functional.mjs

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const { SYMBOLS } = await import('./js/data/abnt2-symbols.js');
const { LAYOUT } = await import('./js/data/abnt2-layout.js');
const symbols = await import('./js/sources/symbols.js');

// --- Test 1: 16 entries, all chars in LAYOUT, all baseKey in LAYOUT ---
assert(SYMBOLS.length === 16, `SYMBOLS.length === 16 (got ${SYMBOLS.length})`);
for (const s of SYMBOLS) {
  assert(LAYOUT[s.char] != null, `LAYOUT has entry for char ${s.char}`);
  assert(LAYOUT[s.baseKey] != null, `LAYOUT has entry for baseKey ${s.baseKey} (of ${s.char})`);
  assert((s.wordsL3 || []).length >= 10, `${s.char}.wordsL3 has >= 10 items`);
  assert((s.phrasesL4 || []).length >= 5, `${s.char}.phrasesL4 has >= 5 items`);
  assert((s.paragraphsL5 || []).length >= 2, `${s.char}.paragraphsL5 has >= 2 items`);
}

// --- Test 2: Level 1 for % starts with f5f% ---
const l1pct = symbols.generate({ simbolos: true }, null, { level: 1, symbolChar: '%', wordsPerLesson: 6 });
assert(l1pct.length === 5, 'level 1 returns linesPerBatch default (5 lines)');
assert(l1pct[0].startsWith('f5f%'), `level 1 % starts with 'f5f%' (got '${l1pct[0].slice(0, 10)}')`);

// --- Test 3: Level 1 for & starts with j7j& ---
const l1amp = symbols.generate({ simbolos: true }, null, { level: 1, symbolChar: '&', wordsPerLesson: 6 });
assert(l1amp[0].startsWith('j7j&'), `level 1 & starts with 'j7j&' (got '${l1amp[0].slice(0, 10)}')`);

// --- Test 4: simbolos:false returns [] ---
const empty1 = symbols.generate({ simbolos: false }, null, { level: 1, symbolChar: '%' });
assert(empty1.length === 0, 'simbolos:false returns empty array');

// --- Test 5: unknown symbolChar returns [] ---
const empty2 = symbols.generate({ simbolos: true }, null, { level: 1, symbolChar: 'Z' });
assert(empty2.length === 0, 'unknown symbolChar returns empty array');

// --- Test 6: Level 2 for % contains only left-index letters + % + space ---
const l2pct = symbols.generate({ simbolos: true }, null, { level: 2, symbolChar: '%', wordsPerLesson: 4 });
const ALLOWED = new Set(['r', 't', 'f', 'g', 'v', 'b', '%', ' ']);
let outOfSet = null;
for (const line of l2pct) {
  for (const ch of line) {
    if (!ALLOWED.has(ch)) { outOfSet = ch; break; }
  }
  if (outOfSet) break;
}
assert(outOfSet === null, `level 2 % uses only {r,t,f,g,v,b,%,space} (stray: ${JSON.stringify(outOfSet)})`);

// --- Test 7: Level 3 for % returns words from wordsL3 ---
const l3pct = symbols.generate({ simbolos: true }, null, { level: 3, symbolChar: '%', wordsPerLesson: 6, repeatWord: 1 });
assert(l3pct.length > 0, 'level 3 returns at least one line');
const entry = SYMBOLS.find(s => s.char === '%');
const pool = new Set(entry.wordsL3);
let allInPool = true;
for (const w of l3pct[0].split(' ')) {
  if (!pool.has(w)) { allInPool = false; break; }
}
assert(allInPool, 'level 3 words come from wordsL3 pool');

// --- Test 8: Level 4 returns phrases ---
const l4 = symbols.generate({ simbolos: true }, null, { level: 4, symbolChar: '!' });
assert(l4.length > 0 && typeof l4[0] === 'string' && l4[0].includes('!'),
       `level 4 returns phrases containing the symbol (got '${l4[0]}')`);

// --- Test 9: Level 5 returns sentences ---
const l5 = symbols.generate({ simbolos: true }, null, { level: 5, symbolChar: '%' });
assert(l5.length > 0 && typeof l5[0] === 'string' && l5[0].length > 0,
       'level 5 returns a non-empty sentence');

// --- Test 10: default level (omitted) falls back to 1 ---
const lDef = symbols.generate({ simbolos: true }, null, { symbolChar: '%', wordsPerLesson: 6 });
assert(lDef[0].startsWith('f5f%'), 'missing level defaults to 1');

// --- Test 11: default symbolChar is % ---
const lSymDef = symbols.generate({ simbolos: true }, null, { level: 1, wordsPerLesson: 6 });
assert(lSymDef[0].startsWith('f5f%'), 'missing symbolChar defaults to %');

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
