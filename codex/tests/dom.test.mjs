// dom.test.mjs — unit tests for js/dom.js (esc + slugify).
// Zero-dependency; no DOM globals needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, slugify } from '../js/dom.js';

// ── esc ───────────────────────────────────────────────────────────────────────

test('esc escapes ampersand', () => {
  assert.equal(esc('a&b'), 'a&amp;b');
});

test('esc escapes less-than', () => {
  assert.equal(esc('<b>'), '&lt;b&gt;');
});

test('esc escapes greater-than', () => {
  assert.equal(esc('a>b'), 'a&gt;b');
});

test('esc escapes double-quote', () => {
  assert.equal(esc('"hello"'), '&quot;hello&quot;');
});

test('esc escapes single-quote', () => {
  assert.equal(esc("it's"), 'it&#39;s');
});

test('esc escapes all five special chars in one string', () => {
  assert.equal(esc('<a href="x&y" title=\'z\'>'), '&lt;a href=&quot;x&amp;y&quot; title=&#39;z&#39;&gt;');
});

test('esc returns empty string for null', () => {
  assert.equal(esc(null), '');
});

test('esc returns empty string for undefined', () => {
  assert.equal(esc(undefined), '');
});

test('esc coerces a number to string', () => {
  assert.equal(esc(42), '42');
});

test('esc returns plain text unchanged', () => {
  assert.equal(esc('hello world'), 'hello world');
});

// ── slugify ───────────────────────────────────────────────────────────────────

test('slugify lowercases', () => {
  assert.equal(slugify('Hello'), 'hello');
});

test('slugify strips diacritics (NFD normalization)', () => {
  assert.equal(slugify('Ação'), 'acao');
  assert.equal(slugify('ñoño'), 'nono');
  assert.equal(slugify('Ödland'), 'odland');
});

test('slugify turns spaces to hyphens', () => {
  assert.equal(slugify('hello world'), 'hello-world');
});

test('slugify turns multiple non-alnum chars to a single hyphen', () => {
  assert.equal(slugify('a -- b'), 'a-b');
});

test('slugify trims leading hyphens', () => {
  assert.equal(slugify('-start'), 'start');
});

test('slugify trims trailing hyphens', () => {
  assert.equal(slugify('end-'), 'end');
});

test('slugify handles a realistic name with accents and spaces', () => {
  assert.equal(slugify('Turma de Verão 2025'), 'turma-de-verao-2025');
});

test('slugify returns empty string for empty input', () => {
  assert.equal(slugify(''), '');
});

test('slugify returns empty string for null-like (falsy) input', () => {
  assert.equal(slugify(null), '');
  assert.equal(slugify(undefined), '');
});
