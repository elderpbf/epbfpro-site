// TypeDrill task 1F renderer functional harness.
// Uses a minimal element stub ({ innerHTML }). Run from typedrill/: node _task1f_functional.mjs

let fail = 0;
const assert = (cond, msg) => {
  if (cond) console.log('  ok   ' + msg);
  else { console.log('  FAIL ' + msg); fail++; }
};

const { paint } = await import('./js/renderer.js');

function countClass(html, cls) {
  return (html.match(new RegExp('class="' + cls + '"', 'g')) || []).length;
}

function nthSpan(html, n) {
  const m = [...html.matchAll(/<span class="([^"]+)">([^<]*)<\/span>/g)];
  return m[n] ? { cls: m[n][1], content: m[n][2] } : null;
}

// --- Test 1: correct prefix all ok-char, current position cur-char, rest pending ---
const el1 = { innerHTML: '' };
paint(el1, 'hello', 'he', { whitespaceDisplay: 'bullet' });
assert(nthSpan(el1.innerHTML, 0)?.cls === 'ok-char', 'pos 0: ok-char');
assert(nthSpan(el1.innerHTML, 1)?.cls === 'ok-char', 'pos 1: ok-char');
assert(nthSpan(el1.innerHTML, 2)?.cls === 'cur-char', 'pos 2 (cursor): cur-char');
assert(nthSpan(el1.innerHTML, 3)?.cls === 'pending', 'pos 3: pending');
assert(nthSpan(el1.innerHTML, 4)?.cls === 'pending', 'pos 4: pending');
assert(countClass(el1.innerHTML, 'ok-char') === 2, 'exactly 2 ok-char spans');
assert(countClass(el1.innerHTML, 'cur-char') === 1, 'exactly 1 cur-char span');

// --- Test 2: wrong char gets bad-char ---
const el2 = { innerHTML: '' };
paint(el2, 'hello', 'hX', { whitespaceDisplay: 'bullet' });
assert(nthSpan(el2.innerHTML, 0)?.cls === 'ok-char', 'pos 0 still ok-char');
assert(nthSpan(el2.innerHTML, 1)?.cls === 'bad-char', 'pos 1 bad-char for wrong X');
assert(nthSpan(el2.innerHTML, 1)?.content === 'X', 'bad-char content is the wrong typed char');

// --- Test 3: empty value => all pending, cursor at 0 ---
const el3 = { innerHTML: '' };
paint(el3, 'abc', '', { whitespaceDisplay: 'bullet' });
assert(nthSpan(el3.innerHTML, 0)?.cls === 'cur-char', 'empty value: pos 0 is cursor');
assert(nthSpan(el3.innerHTML, 1)?.cls === 'pending', 'empty value: pos 1 pending');
assert(nthSpan(el3.innerHTML, 2)?.cls === 'pending', 'empty value: pos 2 pending');

// --- Test 4: whitespace bullet ---
const el4 = { innerHTML: '' };
paint(el4, 'a b', 'a', { whitespaceDisplay: 'bullet' });
assert(nthSpan(el4.innerHTML, 1)?.content === '·', 'space rendered as bullet');

// --- Test 5: whitespace bar ---
const el5 = { innerHTML: '' };
paint(el5, 'a b', 'a', { whitespaceDisplay: 'bar' });
assert(nthSpan(el5.innerHTML, 1)?.content === '|', 'space rendered as bar');

// --- Test 6: whitespace space (literal) ---
const el6 = { innerHTML: '' };
paint(el6, 'a b', 'a', { whitespaceDisplay: 'space' });
assert(nthSpan(el6.innerHTML, 1)?.content === ' ', 'space rendered as space glyph');

// --- Test 7: HTML-sensitive chars are escaped ---
const el7 = { innerHTML: '' };
paint(el7, '<&>', '', {});
assert(el7.innerHTML.includes('&lt;'), 'angle < escaped');
assert(el7.innerHTML.includes('&amp;'), 'ampersand escaped');
assert(el7.innerHTML.includes('&gt;'), 'angle > escaped');

// --- Test 8: default whitespace (no settings) = bullet ---
const el8 = { innerHTML: '' };
paint(el8, 'a b', 'a');
assert(nthSpan(el8.innerHTML, 1)?.content === '·', 'default whitespace is bullet');

// --- Test 9: value fully matches target => trailing cursor span ---
const el9 = { innerHTML: '' };
paint(el9, 'hi', 'hi', {});
// 2 ok-char + 1 trailing cur-char
const spans9 = [...el9.innerHTML.matchAll(/<span class="[^"]+"/g)];
assert(spans9.length === 3, 'full match yields 3 spans (2 chars + trailing cursor)');

if (fail === 0) {
  console.log('\n== ALL FUNCTIONAL TESTS PASSED ==');
  process.exit(0);
} else {
  console.log(`\n== FAILURES: ${fail} ==`);
  process.exit(1);
}
