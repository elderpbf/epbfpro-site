// TypeDrill task 1U -- Todos mode functional harness.

let fail = 0;
const assert = (c, m) => c ? console.log('  ok   ' + m) : (console.log('  FAIL ' + m), fail++);

const symbols = await import('./js/sources/symbols.js');
const { SYMBOLS } = await import('./js/data/abnt2-symbols.js');

// Test 1: Todos at level 1 returns 16 lines
const l1 = symbols.generate({ simbolos: true }, null, { level: 1, symbolChar: '*all*', wordsPerLesson: 6 });
assert(l1.length === 16, `Todos L1 returns 16 lines (got ${l1.length})`);

// Test 2: Lines in SYMBOLS order (first line uses first symbol)
const firstSym = SYMBOLS[0];
const expectedStart = firstSym.anchor + firstSym.baseKey + firstSym.anchor + firstSym.char;
assert(l1[0].startsWith(expectedStart), `first line starts with ${expectedStart} (got '${l1[0].slice(0, 10)}')`);

const secondSym = SYMBOLS[1];
const expectedSecond = secondSym.anchor + secondSym.baseKey + secondSym.anchor + secondSym.char;
assert(l1[1].startsWith(expectedSecond), `second line starts with ${expectedSecond}`);

// Test 3: Every line contains its target symbol
for (let i = 0; i < 16; i++) {
  const s = SYMBOLS[i];
  assert(l1[i].includes(s.char), `line ${i} contains ${s.char}`);
}

// Test 4: Todos at level 3 returns 16 lines, each from respective wordsL3
const l3 = symbols.generate({ simbolos: true }, null, { level: 3, symbolChar: '*all*', wordsPerLesson: 6, repeatWord: 1 });
assert(l3.length === 16, `Todos L3 returns 16 lines (got ${l3.length})`);

// Test 5: simbolos:false still returns []
const empty = symbols.generate({ simbolos: false }, null, { symbolChar: '*all*' });
assert(empty.length === 0, 'simbolos:false with Todos returns empty');

// Test 6: single-symbol behavior unchanged
const single = symbols.generate({ simbolos: true }, null, { level: 1, symbolChar: '%', wordsPerLesson: 6 });
assert(single[0].startsWith('f5f%'), `single symbol % still works (got '${single[0].slice(0, 6)}')`);

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
