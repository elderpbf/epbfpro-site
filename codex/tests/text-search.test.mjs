// text-search.test.mjs — unit tests for js/text-search.js.
// Zero-dependency; no DOM globals needed.
//
// The accent cases are the REASON this module exists: every search in Codex
// compared raw strings before it, so none of them could answer a query typed
// without accents — which is how people type in a hurry, on a phone, and on a
// keyboard whose layout is not the one the content was written on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, makeMatcher, matchesAny } from '../js/text-search.js';

// ── normalize ─────────────────────────────────────────────────────────────────

test('normalize lowercases', () => {
  assert.equal(normalize('Hello'), 'hello');
});

test('normalize strips Portuguese diacritics', () => {
  assert.equal(normalize('Citação'), 'citacao');
  assert.equal(normalize('Dúvida'), 'duvida');
  assert.equal(normalize('Órgão'), 'orgao');
  assert.equal(normalize('Ação Penal'), 'acao penal');
});

test('normalize keeps interior spacing and punctuation (substring search needs them)', () => {
  assert.equal(normalize('A B  C'), 'a b  c');
  assert.equal(normalize('k22: Próximo Token'), 'k22: proximo token');
});

test('normalize returns empty string for null-like input', () => {
  assert.equal(normalize(null), '');
  assert.equal(normalize(undefined), '');
  assert.equal(normalize(''), '');
});

test('normalize coerces a number to string', () => {
  assert.equal(normalize(42), '42');
});

// ── makeMatcher: the accent contract ──────────────────────────────────────────

test('an unaccented query matches accented content (the defect this module fixes)', () => {
  const m = makeMatcher('citacao');
  assert.equal(m('Aposta na Citação'), true);
});

test('an accented query matches unaccented content (symmetric)', () => {
  const m = makeMatcher('citação');
  assert.equal(m('Aposta na Citacao'), true);
});

test('matching is case-insensitive in both directions', () => {
  assert.equal(makeMatcher('TOKEN')('Próximo Token'), true);
  assert.equal(makeMatcher('token')('PRÓXIMO TOKEN'), true);
});

test('matching is substring, not prefix', () => {
  assert.equal(makeMatcher('ximo')('Próximo Token'), true);
});

test('a non-matching query returns false', () => {
  assert.equal(makeMatcher('embeddings')('Aposta na Citação'), false);
});

// ── makeMatcher: blank query ──────────────────────────────────────────────────

test('a blank query matches everything, so call sites need no `if (q)` guard', () => {
  for (const blank of ['', '   ', null, undefined]) {
    const m = makeMatcher(blank);
    assert.equal(m('anything'), true, 'blank: ' + JSON.stringify(blank));
    assert.equal(m(''), true);
    assert.equal(m(null), true);
  }
});

test('a query that is only whitespace around text still matches (query is trimmed)', () => {
  assert.equal(makeMatcher('  token  ')('Próximo Token'), true);
});

// ── makeMatcher: value shapes ─────────────────────────────────────────────────

test('matches across several variadic values, hitting on any one of them', () => {
  const m = makeMatcher('pipeline');
  assert.equal(m('Próximo Token', 'O pipeline do transformer'), true);
  assert.equal(m('O pipeline do transformer', 'Próximo Token'), true);
});

test('accepts one array of values (the shape the rail passes from fields())', () => {
  const m = makeMatcher('k22');
  assert.equal(m(['Próximo Token', 'pipeline', 'k22']), true);
  assert.equal(m(['Próximo Token', 'pipeline', 'k21']), false);
});

test('skips null and undefined values without throwing', () => {
  const m = makeMatcher('token');
  assert.equal(m(null, undefined, 'Próximo Token'), true);
  assert.equal(m(null, undefined), false);
});

test('matches a numeric value coerced to string', () => {
  assert.equal(makeMatcher('22')(22), true);
});

// ── matchesAny ────────────────────────────────────────────────────────────────

test('matchesAny takes an array of values', () => {
  assert.equal(matchesAny(['Aposta na Citação', 'alucinação'], 'citacao'), true);
  assert.equal(matchesAny(['Aposta na Citação', 'alucinação'], 'tokens'), false);
});

test('matchesAny takes a single bare value', () => {
  assert.equal(matchesAny('Aposta na Citação', 'citacao'), true);
});

test('matchesAny with a blank query matches everything', () => {
  assert.equal(matchesAny(['whatever'], ''), true);
});

// ── the query is normalized once per matcher ─────────────────────────────────

test('one matcher is reusable across many rows (the rail re-filters on every keystroke)', () => {
  const m = makeMatcher('acao');
  const rows = ['Ação Penal', 'Petição', 'Ação Civil', 'Tokens'];
  assert.deepEqual(rows.filter((r) => m(r)), ['Ação Penal', 'Ação Civil']);
});
