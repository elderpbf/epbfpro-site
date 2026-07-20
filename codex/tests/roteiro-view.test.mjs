// tests/roteiro-view.test.mjs
// track-46 fatia 1 — RED contract (by source) for the two-panel view + wiring.
// Source-based on purpose: the view is DOM code; we assert its shape, its injected-store
// seam, and its plug into the aula sub-tab without importing/executing it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => fs.readFileSync(path.join(__dirname, rel), 'utf8').replace(/\r\n/g, '\n');

test('roteiro-view.js exporta mount e unmount', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  assert.match(src, /export\s+function\s+mount\b|export\s*\{[^}]*\bmount\b/);
  assert.match(src, /export\s+function\s+unmount\b|export\s*\{[^}]*\bunmount\b/);
});

test('roteiro-view.js usa o store INJETADO, não conhece persistência', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  assert.ok(!/localStorage/.test(src), 'a view não pode citar localStorage');
  assert.ok(!/roteiro-store-stub/.test(src), 'a view não pode importar o stub (seam trocável na fatia 2)');
});

test('roteiro-view.js consome a lógica do roteiro-model.js', () => {
  const src = readSrc('../roteiro/roteiro-view.js');
  assert.match(src, /from\s+['"]\.\.\/js\/roteiro-model\.js['"]/);
});

// Fatia 2.5: o gate `bs_debug` CAIU nos dois lugares (Élder é o único admin e quer
// usar a coisa; o gate só existia pra entrar dormente enquanto estava pela metade).
// Isso inverte o teste da fatia 1: antes exigia o gate, agora exige a ausência dele.
test('a sub-aba roteiro está plugada em cohorts.js e NÃO é mais gated', () => {
  const src = readSrc('../cohorts/cohorts.js');
  assert.match(src, /data-aulatab=["']roteiro["']/, 'botão da sub-aba roteiro');
  assert.match(src, /roteiro-view\.js/, 'monta a view no pane da aula');
  const railBlock = src.slice(Math.max(0, src.indexOf('data-aulatab="roteiro"') - 800),
    src.indexOf('data-aulatab="roteiro"') + 400);
  assert.ok(!/cdx-dev-only/.test(railBlock), 'a sub-aba roteiro não carrega mais o marcador dev-only');
});

test('o editor de bases do Cursos também saiu do gate bs_debug', () => {
  const src = readSrc('../cohorts/courses.js');
  assert.match(src, /roteiro-view\.js/, 'o Cursos reusa a MESMA view');
  assert.ok(!/bs_debug/.test(src), 'nenhum gate de debug sobrou no courses.js');
});

test('a chave i18n da sub-aba existe em pt.js E en.js', () => {
  const pt = readSrc('../i18n/pt.js');
  const en = readSrc('../i18n/en.js');
  assert.match(pt, /['"]cohorts\.aula_tab_roteiro['"]\s*:/);
  assert.match(en, /['"]cohorts\.aula_tab_roteiro['"]\s*:/);
});
