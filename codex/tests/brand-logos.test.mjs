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
    // Sem unicode-range esta face reivindica TODO caractere e desenha quadrado vazio
    // nos que nao tem glifo -- inclusive por cima da Comfortaa completa que o theme.css
    // carrega. E o que torna a injecao no topbar provadamente inofensiva.
    assert.match(svg, /unicode-range:U\+0020,/, `${nome}: face limitada aos caracteres que sabe desenhar`);
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

// ── As variantes de placa e o cartao (track-47 4.b) ──────────────────────────
// Ate o 4.b elas nao existiam no gerador: os 12 arquivos canonicos eram compostos
// fora dele, e por isso eram os unicos que nenhum teste alcancava.

test('iconPlate centra a marca por DERIVACAO, nunca por numero digitado', () => {
  // Um icone com o glifo fora do centro e o defeito classico de export manual. Aqui
  // x e y saem de markHeight, entao nao ha onde errar. Os valores conferidos sao os
  // do conjunto canonico em PensoIA/Brand/Logo/with bg/.
  const casos = [
    [brand.faviconSquare('navy'), 640, 'rect', 220],
    [brand.faviconCircle('navy'), 640, 'circle', null],
    [brand.appicon('navy'), 600, 'rect', 220],
    [brand.appiconAdaptiveSquircle('navy'), 560, 'rect', 380],
    [brand.appiconAdaptiveCircle('navy'), 500, 'circle', null],
  ];
  for (const [svg, h, forma, rx] of casos) {
    const w = h * (600 / 757);
    assert.match(svg, /viewBox="0 0 1000 1000"/, 'placa de 1000x1000');
    assert.ok(svg.includes(`x="${(1000 - w) / 2}" y="${(1000 - h) / 2}" width="${w}" height="${h}"`),
      `marca centrada e no aspecto 600:757 (h=${h})`);
    if (forma === 'circle') assert.match(svg, /<circle cx="500" cy="500" r="500"/);
    else assert.ok(svg.includes(`<rect width="1000" height="1000" rx="${rx}"`), `raio ${rx}`);
  }
});

test('a placa nao repete <style> nem fonte: quem hospeda declara uma vez', () => {
  const svg = brand.faviconSquare('navy');
  // A placa nao tem <text> proprio; uma regra text{} nela seria regra morta por cima
  // da viva que o artwork aninhado carrega.
  assert.equal(svg.indexOf('<style>'), svg.lastIndexOf('<style>'), 'um unico <style>, o do aninhado');
  assert.ok(!svg.includes('@font-face'), 'placa e geometria pura, nao paga fonte');
});

test('bizCard embute a fonte UMA vez e mantem o e-mail em monoespacada', () => {
  const svg = brand.bizCard('navy');
  assert.match(svg, /viewBox="0 0 320 188"/);
  assert.equal((svg.match(/@font-face/g) || []).length, 2, 'as duas faces, uma vez so');
  assert.ok(!svg.slice(svg.indexOf('<svg', 1)).includes('@font-face'),
    'o wordmark aninhado NAO repete a fonte do hospedeiro');
  assert.match(svg, /font-family="ui-monospace,Menlo,monospace">contato@pensoia\.com/,
    'endereco em monoespacada, mais facil de transcrever a olho');
  assert.match(svg, /Élder Prudente Barbosa Filho/, 'o nome com acento, que o subset cobre');
});

test('bizCard e a variante de texto VARIAVEL, entao aceita outra pessoa', () => {
  // E por isso que ela e a que precisa manter fonte de verdade em vez de contorno.
  const svg = brand.bizCard('white', { nome: 'Fulana de Tal', papel: 'Instrutora', email: 'f@pensoia.com' });
  assert.match(svg, /Fulana de Tal/);
  assert.match(svg, /Instrutora/);
  assert.ok(!svg.includes('Élder'), 'o padrao nao vaza quando se passa outro nome');
});

test('toda variante nova sobrevive ao <style> lido como XML', () => {
  for (const svg of [brand.faviconSquare('navy'), brand.appiconAdaptiveCircle('white'), brand.bizCard('navy')]) {
    for (const style of svg.match(/<style>([\s\S]*?)<\/style>/g) || []) {
      const corpo = style.slice(7, -8);
      assert.ok(!corpo.includes('<') && !corpo.includes('&'), 'nada que quebre o parse XML');
    }
  }
});
