// js/item-pdf.js — markdown -> PDF for a trail item.
//
// Élder's rule (2026-08-04): symbols on screen -> .md, processed on screen -> PDF. Only the
// first half existed, so everything came down as raw .md. The parts tested here are the two
// pure ones: the markdown reader and the page layout. jsPDF itself is not loaded (300KB of
// vendored binary, browser-only), so `layout` takes the doc as an argument and a stub records
// what would have been drawn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mdToBlocks, layout, PAGE } from '../js/item-pdf.js';

// ── the markdown reader ──────────────────────────────────────────────────────

test('headings collapse at 3 levels, because a PDF of prose has no use for 6', () => {
  const b = mdToBlocks('# um\n## dois\n### tres\n#### quatro');
  assert.deepEqual(b.map((x) => x.kind), ['h1', 'h2', 'h3', 'h3']);
  assert.equal(b[0].text, 'um');
});

test('consecutive lines are ONE paragraph, a blank line separates', () => {
  const b = mdToBlocks('linha um\nlinha dois\n\noutro');
  assert.deepEqual(b.map((x) => x.kind), ['p', 'p']);
  assert.equal(b[0].text, 'linha um linha dois');
});

test('lists keep their marker and their nesting', () => {
  const b = mdToBlocks('- a\n- b\n1. c');
  assert.deepEqual(b.map((x) => x.kind), ['li', 'li', 'li']);
  assert.equal(b[0].text, '• a');
  assert.equal(b[2].text, '1. c');
});

test('a fence is content, not syntax: markdown inside it survives verbatim', () => {
  const b = mdToBlocks('antes\n\n```\n# nao é titulo\n- nao é lista\n```\n\ndepois');
  const code = b.find((x) => x.kind === 'code');
  assert.ok(code, 'the fence became a code block');
  assert.equal(code.text, '# nao é titulo\n- nao é lista');
  assert.deepEqual(b.map((x) => x.kind), ['p', 'code', 'p']);
});

test('an unclosed fence still yields its content instead of swallowing it', () => {
  const b = mdToBlocks('texto\n\n```\nperdido');
  assert.equal(b[b.length - 1].kind, 'code');
  assert.equal(b[b.length - 1].text, 'perdido');
});

test('inline marks are stripped but every WORD survives', () => {
  const b = mdToBlocks('um **forte** e *fraco* e `codigo`');
  assert.equal(b[0].text, 'um forte e fraco e codigo');
});

test('a link keeps its text AND its URL, because a lost URL is lost content', () => {
  const b = mdToBlocks('veja [o manual](https://x.dev/manual)');
  assert.equal(b[0].text, 'veja o manual (https://x.dev/manual)');
});

test('an image becomes its alt text, never an empty line', () => {
  assert.equal(mdToBlocks('![diagrama](a.png)')[0].text, 'diagrama');
});

test('the real title shape of the archive survives', () => {
  // The three live items are "# Prompt: Resumo Preparatório para Audiência…".
  const b = mdToBlocks('# Prompt: Resumo Preparatório para Audiência para Magistrados');
  assert.equal(b[0].kind, 'h1');
  assert.equal(b[0].text, 'Prompt: Resumo Preparatório para Audiência para Magistrados');
});

test('empty input yields no blocks rather than one empty paragraph', () => {
  assert.deepEqual(mdToBlocks(''), []);
  assert.deepEqual(mdToBlocks(null), []);
});

// ── the layout ───────────────────────────────────────────────────────────────

// A jsPDF stand-in: enough surface for `layout`, and it records the calls.
function stubDoc(linesPerText = 1) {
  const calls = { text: [], pages: 1, fonts: [], sizes: [] };
  return {
    calls,
    setFont: (f, s) => calls.fonts.push(f + '/' + s),
    setFontSize: (n) => calls.sizes.push(n),
    splitTextToSize: (s) => (linesPerText === 1 ? [String(s)] : new Array(linesPerText).fill(String(s))),
    text: (t, x, y) => calls.text.push({ t, x, y, page: calls.pages }),
    line: () => {},
    addPage: () => { calls.pages++; },
  };
}

test('the title is drawn first, with its markdown # removed', () => {
  const d = stubDoc();
  layout(d, mdToBlocks('corpo'), '# Modelo: Relatório');
  assert.equal(d.calls.text[0].t, 'Modelo: Relatório');
});

test('no title given, nothing is drawn for it', () => {
  const d = stubDoc();
  layout(d, mdToBlocks('corpo'), '');
  assert.equal(d.calls.text[0].t, 'corpo');
});

test('content longer than a page breaks onto a new one', () => {
  const d = stubDoc(200);       // every block reports 200 lines
  layout(d, mdToBlocks('um paragrafo qualquer'), 'T');
  assert.ok(d.calls.pages > 1, 'it paginated, got ' + d.calls.pages);
});

test('the break is decided per LINE: one huge block still paginates', () => {
  // A block taller than the whole page would run off the bottom if the check happened only
  // on the way into the block.
  const d = stubDoc(80);
  layout(d, [{ kind: 'p', text: 'x' }], '');
  const maxY = Math.max(...d.calls.text.map((c) => c.y));
  assert.ok(maxY <= PAGE.h - PAGE.bottom, 'nothing was drawn past the bottom margin');
});

test('a list is indented past a paragraph, and deeper nesting indents further', () => {
  const d = stubDoc();
  layout(d, [{ kind: 'p', text: 'p' }, { kind: 'li', text: '• a', indent: 0 }, { kind: 'li', text: '• b', indent: 2 }], '');
  const [p, a, b] = d.calls.text;
  assert.equal(a.x, p.x, 'a top-level bullet lines up with the prose');
  assert.ok(b.x > a.x, 'a nested bullet is pushed right');
});

test('code is drawn in a monospaced face', () => {
  const d = stubDoc();
  layout(d, mdToBlocks('```\nx = 1\n```'), '');
  assert.ok(d.calls.fonts.some((f) => f.startsWith('courier')), 'courier was selected');
});
