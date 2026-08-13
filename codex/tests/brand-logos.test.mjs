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

// The brand font travels INSIDE the SVG (js/brand-font.js). Without it, the wordmark
// "ensoIA", which is <text> in Comfortaa rather than an outline, falls back to a generic
// sans in any isolated context: <img>/data: URI, a device without the font, offline use.
test('every SVG with a wordmark embeds the brand font; mark() does not pay for it', () => {
  const c = brand.stdColors('navy');
  for (const [nome, svg] of [
    ['fontWordmark', brand.fontWordmark(c)],
    ['glyphWordmark', brand.glyphWordmark(c)],
    ['glyphWordmarkTag', brand.glyphWordmarkTag(c)],
  ]) {
    assert.equal((svg.match(/@font-face/g) || []).length, 2, `${nome}: both faces (400 and 700)`);
    assert.match(svg, /url\(data:font\/woff2;base64,[A-Za-z0-9+/=]+\) format\('woff2'\)/, `${nome}: font embedded, no network`);
    assert.match(svg, /text\{font-family:'Comfortaa',sans-serif\}/, `${nome}: the family rule is still there`);
    // Without unicode-range this face claims EVERY character and draws an empty square
    // for the ones it has no glyph for, even over the full Comfortaa that theme.css
    // loads. That is what makes the topbar injection provably harmless.
    assert.match(svg, /unicode-range:U\+0020,/, `${nome}: face limited to the characters it knows how to draw`);
  }
  const soGlifo = brand.mark(c);
  assert.ok(!soGlifo.includes('@font-face'), 'mark() has no text, so it loads no font');
});

// Loaded via <img src>, the SVG is read as XML: a stray '<' or '&' inside
// <style> is a parse error that brings down the whole file. It has happened once already.
test('the generated <style> has no character that breaks the SVG read as XML', () => {
  const style = brand.glyphWordmark(brand.stdColors('navy')).match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.ok(!style.includes('<'), 'no less-than inside <style>');
  assert.ok(!style.includes('&'), 'no ampersand inside <style>');
});

// ── The plate variants and the card (track-47 4.b) ───────────────────────────
// Until 4.b they did not exist in the generator: the 12 canonical files were composed
// outside it, and so they were the only ones no test reached.

test('iconPlate centers the mark by DERIVATION, never by a typed-in number', () => {
  // An icon with the glyph off-center is the classic manual-export defect. Here
  // x and y come from markHeight, so there is nowhere to get it wrong. The checked values
  // are the ones from the canonical set in PensoIA/Brand/Logo/with bg/.
  const casos = [
    [brand.faviconSquare('navy'), 640, 'rect', 220],
    [brand.faviconCircle('navy'), 640, 'circle', null],
    [brand.appicon('navy'), 600, 'rect', 220],
    [brand.appiconAdaptiveSquircle('navy'), 560, 'rect', 380],
    [brand.appiconAdaptiveCircle('navy'), 500, 'circle', null],
  ];
  for (const [svg, h, forma, rx] of casos) {
    const w = h * (600 / 757);
    assert.match(svg, /viewBox="0 0 1000 1000"/, '1000x1000 plate');
    assert.ok(svg.includes(`x="${(1000 - w) / 2}" y="${(1000 - h) / 2}" width="${w}" height="${h}"`),
      `mark centered and at 600:757 aspect ratio (h=${h})`);
    if (forma === 'circle') assert.match(svg, /<circle cx="500" cy="500" r="500"/);
    else assert.ok(svg.includes(`<rect width="1000" height="1000" rx="${rx}"`), `radius ${rx}`);
  }
});

test('the plate does not repeat <style> or the font: the host declares once', () => {
  const svg = brand.faviconSquare('navy');
  // The plate has no <text> of its own; a text{} rule on it would be a dead rule on top
  // of the live one the nested artwork carries.
  assert.equal(svg.indexOf('<style>'), svg.lastIndexOf('<style>'), "a single <style>, the nested one's");
  assert.ok(!svg.includes('@font-face'), 'plate is pure geometry, does not pay for the font');
});

test('bizCard embeds the font ONCE and keeps the email in monospace', () => {
  const svg = brand.bizCard('navy');
  assert.match(svg, /viewBox="0 0 320 188"/);
  assert.equal((svg.match(/@font-face/g) || []).length, 2, 'both faces, just once');
  assert.ok(!svg.slice(svg.indexOf('<svg', 1)).includes('@font-face'),
    'the nested wordmark does NOT repeat the host font');
  assert.match(svg, /font-family="ui-monospace,Menlo,monospace">contato@pensoia\.com/,
    'address in monospace, easier to transcribe by eye');
  assert.match(svg, /Élder Prudente Barbosa Filho/, 'the name with accent, which the subset covers');
});

test('bizCard is the VARIABLE text variant, so it accepts another person', () => {
  // That is why it is the one that needs to keep the real font instead of an outline.
  const svg = brand.bizCard('white', { nome: 'Fulana de Tal', papel: 'Instrutora', email: 'f@pensoia.com' });
  assert.match(svg, /Fulana de Tal/);
  assert.match(svg, /Instrutora/);
  assert.ok(!svg.includes('Élder'), 'the default does not leak when another name is passed');
});

test('every new variant survives the <style> read as XML', () => {
  for (const svg of [brand.faviconSquare('navy'), brand.appiconAdaptiveCircle('white'), brand.bizCard('navy')]) {
    for (const style of svg.match(/<style>([\s\S]*?)<\/style>/g) || []) {
      const corpo = style.slice(7, -8);
      assert.ok(!corpo.includes('<') && !corpo.includes('&'), 'nothing that breaks the XML parse');
    }
  }
});
