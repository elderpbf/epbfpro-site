// TypeDrill task 1J -- common.js generate() functional harness.
// Run from typedrill/: node _task1j_functional.mjs

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const { generate } = await import('./js/sources/common.js');
const { WORDS } = await import('./js/data/pt-br-1000.js');

// Sanity on the imported word list
assert(WORDS.length >= 500, 'WORDS has >= 500 entries');
assert(WORDS.length <= 1100, 'WORDS has <= 1100 entries');
assert(typeof WORDS[0] === 'string' && WORDS[0].length > 0, 'WORDS[0] is a non-empty string');

// --- Test 1: letras-only charset yields no digits or ASCII symbols ---
const lettersOnly = generate(
  { letras: true, numeros: false, simbolos: false, pontuacao: false },
  null,
  { wordsPerLesson: 20, repeatWord: 1, linesPerBatch: 3 }
);
assert(lettersOnly.length === 3, 'letters-only: 3 lines produced');
let sawNonLetter = false;
for (const line of lettersOnly) {
  if (/[0-9]/.test(line)) { sawNonLetter = true; break; }
  if (/[@#$%&*()+=<>|~^_.,;:?!'"\/\\-]/.test(line)) { sawNonLetter = true; break; }
}
assert(!sawNonLetter, 'letters-only lines contain no digits or ASCII symbols');

// --- Test 2: repeatWord=2 pairs every word with itself in sequence ---
const paired = generate(
  { letras: true },
  null,
  { wordsPerLesson: 30, repeatWord: 2, linesPerBatch: 1 }
);
const tokens = paired[0].split(' ');
assert(tokens.length === 30, 'line has 30 words');
let pairsOk = true;
for (let i = 0; i + 1 < tokens.length; i += 2) {
  if (tokens[i] !== tokens[i + 1]) { pairsOk = false; break; }
}
assert(pairsOk, 'every consecutive pair matches (repeatWord=2)');

// --- Test 3: wordsPerLesson=30 produces exactly 30 words per line ---
const std = generate(
  { letras: true },
  null,
  { wordsPerLesson: 30, repeatWord: 1, linesPerBatch: 4 }
);
for (let i = 0; i < std.length; i++) {
  assert(std[i].split(' ').length === 30, `line ${i} has 30 words`);
}

// --- Test 4: impossible charset (only digits) returns [] from this source ---
const empty = generate(
  { letras: false, numeros: true, simbolos: false, pontuacao: false },
  null,
  { wordsPerLesson: 20, repeatWord: 1, linesPerBatch: 1 }
);
assert(empty.length === 0, 'digits-only charset -> no pt-BR words pass filter');

// --- Test 5: focus chip biases pool to words containing the focus char ---
const focused = generate(
  { letras: true, focus: ['z'] },
  null,
  { wordsPerLesson: 20, repeatWord: 1, linesPerBatch: 2 }
);
let allContainZ = true;
for (const line of focused) {
  for (const w of line.split(' ')) {
    if (w.toLowerCase().indexOf('z') === -1) { allContainZ = false; break; }
  }
}
assert(allContainZ, 'focus=[z] yields only words containing z');

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
