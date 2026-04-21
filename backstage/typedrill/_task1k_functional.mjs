// TypeDrill task 1K -- custom.js + buildAllowedChars functional harness.
// Run from typedrill/: node _task1k_functional.mjs

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const { generate } = await import('./js/sources/custom.js');
const { buildAllowedChars } = await import('./js/charset.js');

// --- buildAllowedChars sanity (extraction check) ---
const sLetras = buildAllowedChars({ letras: true });
assert(sLetras.has('a'), 'buildAllowedChars({letras:true}) has a');
assert(!sLetras.has('1'), 'buildAllowedChars({letras:true}) does not have 1');
const sNum = buildAllowedChars({ numeros: true });
assert(sNum.has('1'), 'buildAllowedChars({numeros:true}) has 1');
assert(!sNum.has('a'), 'buildAllowedChars({numeros:true}) does not have a');

// --- Test 1: pasted paragraph produces lines at wordsPerLesson grouping ---
const r1 = generate(
  { letras: true },
  { settings: { wordsPerLesson: 5 } },
  { text: 'O rato roeu a roupa do rei de Roma hoje cedo demais' }
);
assert(r1.length > 0, 'paragraph produces at least one line');
assert(r1[0].split(' ').length === 5, 'first line has 5 words (from stats.settings.wordsPerLesson)');

// --- Test 2: stripPunct removes .,;:!?"()[] ---
const r2 = generate(
  { letras: true },
  {},
  { text: 'Ola, mundo! Como vai? (foo) [bar]', stripPunct: true, wordsPerLesson: 10 }
);
const joined = r2.join(' ');
let stray = null;
for (const ch of '.,;:!?"()[]') {
  if (joined.includes(ch)) { stray = ch; break; }
}
assert(stray === null, `stripPunct removes all of .,;:!?"()[] (stray: ${JSON.stringify(stray)}; out='${joined}')`);

// --- Test 3: lowercase ---
const r3 = generate({ letras: true }, {}, { text: 'AbCdE', lowercase: true });
assert(r3.length > 0 && r3[0] === 'abcde', `lowercase AbCdE -> abcde (got '${r3[0]}')`);

// --- Test 4: shuffleWords deterministic with seed ---
const text4 = 'um dois tres quatro cinco seis sete oito nove dez';
const r4a = generate({ letras: true }, {}, { text: text4, shuffleWords: true, seed: 42, wordsPerLesson: 30 });
const r4b = generate({ letras: true }, {}, { text: text4, shuffleWords: true, seed: 42, wordsPerLesson: 30 });
assert(r4a[0] === r4b[0], 'seeded shuffle is deterministic across runs');
assert(r4a[0] !== text4, `seeded shuffle differs from input order (input='${text4}', shuffled='${r4a[0]}')`);

// --- Test 5: empty text returns [] ---
const r5 = generate({ letras: true }, {}, { text: '' });
assert(r5.length === 0, 'empty text returns empty array');
const r5b = generate({ letras: true }, {}, { text: '   ' });
assert(r5b.length === 0, 'whitespace-only text returns empty array');

// --- Test 6: digits dropped under letras-only charset ---
const r6 = generate({ letras: true }, {}, { text: 'Numero 42 hoje', wordsPerLesson: 10 });
const tokens6 = r6.join(' ').split(' ').filter(Boolean);
assert(!tokens6.includes('42'), '42 dropped under letras-only charset');
assert(tokens6.includes('Numero') && tokens6.includes('hoje'), 'letter-only tokens retained');

// --- Test 7: wordsPerLesson default from stats.settings ---
const r7 = generate(
  { letras: true },
  { settings: { wordsPerLesson: 3 } },
  { text: 'a b c d e f g h i j' }
);
assert(r7[0].split(' ').length === 3, 'wordsPerLesson default pulled from stats.settings.wordsPerLesson');

// --- Test 8: missing charset defaults to letras:true (safe) ---
const r8 = generate(null, {}, { text: 'o rato' });
assert(r8.length > 0 && r8[0].includes('rato'), 'null charset falls back to letras-only');

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
