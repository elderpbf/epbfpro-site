// codex/js/brand-logos.js — the Codex-owned PensoIA brand helpers (ES-module port
// of the shared backstage artwork). Pure functions, so tested directly: the
// stdColors palette recipes (Scheme B + recipe-A teal) and the SVG builders
// (mark / fontWordmark / glyphWordmark / glyphWordmarkTag) with the canonical
// colors, viewBoxes, wordmark, tagline, and Comfortaa font.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as brand from '../js/brand-logos.js';

const NAVY = '#061a51';
const TEAL = '#14b8a6';
const WHITE = '#ffffff';

test('stdColors: white and transp share the light recipe (Scheme B)', () => {
  const expected = { pOuter: NAVY, pBrain: TEAL, pDot: TEAL, ensoColor: NAVY, iaColor: TEAL, taglineColor: NAVY };
  assert.deepEqual(brand.stdColors('white'), expected);
  assert.deepEqual(brand.stdColors('transp'), expected, 'transp mirrors white');
});

test('stdColors: navy keeps teal accents on a dark surface', () => {
  assert.deepEqual(brand.stdColors('navy'),
    { pOuter: WHITE, pBrain: TEAL, pDot: TEAL, ensoColor: WHITE, iaColor: TEAL, taglineColor: WHITE });
});

test('stdColors: teal collapses the whole lockup to white (recipe A)', () => {
  assert.deepEqual(brand.stdColors('teal'),
    { pOuter: WHITE, pBrain: WHITE, pDot: WHITE, ensoColor: WHITE, iaColor: WHITE, taglineColor: WHITE });
});

test('every SVG carries the xmlns, the Comfortaa style, and the meet aspect ratio', () => {
  for (const svg of [brand.mark(brand.stdColors('white')), brand.glyphWordmark(brand.stdColors('navy')), brand.glyphWordmarkTag(brand.stdColors('teal')), brand.fontWordmark(brand.stdColors('white'))]) {
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, /font-family:'Comfortaa',sans-serif/, 'Comfortaa injected for iOS Safari');
    assert.match(svg, /preserveAspectRatio="xMidYMid meet"/);
  }
});

test('mark renders the standalone P glyph at the 600x757 viewBox with the recipe colors', () => {
  const svg = brand.mark(brand.stdColors('white'));
  assert.match(svg, /viewBox="0 0 600 757"/);
  assert.match(svg, new RegExp('fill="' + NAVY + '"'), 'navy P outer on a light surface');
  assert.match(svg, new RegExp('fill="' + TEAL + '"'), 'teal brain/dot');
  assert.match(svg, /fill-rule="evenodd"/, 'the 3-layer edge overlay is present');
  assert.ok(!/<text/.test(svg), 'mark has no wordmark text');
});

test('fontWordmark is the typographic pensoIA with no glyph', () => {
  const svg = brand.fontWordmark(brand.stdColors('white'));
  assert.match(svg, /viewBox="0 0 2200 550"/);
  assert.match(svg, />penso<tspan[^>]*>IA<\/tspan>/);
  assert.ok(!/fill-rule="evenodd"/.test(svg), 'no glyph layers');
});

test('glyphWordmark composites the glyph + ensoIA wordmark', () => {
  const svg = brand.glyphWordmark(brand.stdColors('navy'));
  assert.match(svg, /viewBox="0 0 2400 870"/);
  assert.match(svg, />enso<tspan[^>]*>IA<\/tspan>/);
  assert.match(svg, new RegExp('fill="' + WHITE + '"'), 'white wordmark on navy');
  assert.match(svg, /fill-rule="evenodd"/, 'glyph present');
});

test('glyphWordmark can hide the symbol (wordmark only)', () => {
  const svg = brand.glyphWordmark(brand.stdColors('white'), { showSymbol: false });
  assert.ok(!/fill-rule="evenodd"/.test(svg), 'no glyph when showSymbol is false');
  assert.match(svg, />enso<tspan[^>]*>IA<\/tspan>/);
});

test('glyphWordmarkTag adds the canonical tagline, right-aligned', () => {
  const svg = brand.glyphWordmarkTag(brand.stdColors('white'));
  assert.match(svg, /pensamento humano, inteligência ampliada/, 'the tagline verbatim');
  assert.match(svg, /text-anchor="end"/, 'tagline right-aligned');
  assert.match(svg, /textLength="1790"/, 'wordmark span pinned (2400 - 610)');
  assert.match(svg, /fill-rule="evenodd"/, 'glyph present');
});

// A fonte da marca viaja DENTRO do SVG (js/brand-font.js). Sem isso o wordmark
// "ensoIA", que e <text> em Comfortaa e nao contorno, cai numa sans generica em
// qualquer contexto isolado: <img>/data: URI, aparelho sem a fonte, uso offline.
test('todo SVG com wordmark embute a fonte da marca; mark() nao paga por ela', () => {
  const c = brand.stdColors('navy');
  for (const [nome, svg] of [
    ['fontWordmark', brand.fontWordmark(c)],
    ['glyphWordmark', brand.glyphWordmark(c)],
    ['glyphWordmarkTag', brand.glyphWordmarkTag(c)],
  ]) {
    assert.equal((svg.match(/@font-face/g) || []).length, 2, `${nome}: as duas faces (400 e 700)`);
    assert.match(svg, /url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\) format\('woff2'\)/, `${nome}: fonte embutida, sem rede`);
    assert.match(svg, /text\{font-family:'Comfortaa',sans-serif\}/, `${nome}: a regra de familia continua`);
  }
  const soGlifo = brand.mark(c);
  assert.ok(!soGlifo.includes('@font-face'), 'mark() nao tem texto, entao nao carrega fonte');
});

// Carregado por <img src>, o SVG e lido como XML: '<' ou '&' soltos dentro do
// <style> sao erro de parse e derrubam o arquivo inteiro. Ja aconteceu uma vez.
test('o <style> gerado nao tem caractere que quebre o SVG lido como XML', () => {
  const style = brand.glyphWordmark(brand.stdColors('navy')).match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.ok(!style.includes('<'), 'nada de menor-que dentro do <style>');
  assert.ok(!style.includes('&'), 'nada de E-comercial dentro do <style>');
});
