// item-download.test.mjs, the on-the-fly item content download (js/item-download.js).
// The actual download trigger is browser-only (URL.createObjectURL + synthetic click, checked
// in preview); here lives the pure part: the file name derived from the item title.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileNameFromTitle } from '../js/item-download.js';

// Real titles in the library carry markdown markup and accents, and neither survives well on
// a file system. This is item 900028 in production.
test('strips the # from the title and the accents', () => {
  assert.equal(
    fileNameFromTitle('# Prompt: Resumo Preparatório para Audiência para Magistrados'),
    'Prompt-Resumo-Preparatorio-para-Audiencia-para-Magistrados.md',
  );
});

test('the two Modelos do not collide with each other', () => {
  const civel = fileNameFromTitle('# Modelo: Relatório Preparatório para Audiência CÍVEL para Magistrados');
  const crime = fileNameFromTitle('# Modelo: Relatório Preparatório para Audiência CRIMINAL para Magistrados');
  assert.notEqual(civel, crime);
  assert.match(civel, /CIVEL/);
  assert.match(crime, /CRIMINAL/);
});

test('collapses punctuation into a single hyphen and leaves no hyphen at the edges', () => {
  assert.equal(fileNameFromTitle('  ...Olá, mundo!!!  '), 'Ola-mundo.md');
});

test('an empty title falls back to a usable name', () => {
  assert.equal(fileNameFromTitle(''), 'item.md');
  assert.equal(fileNameFromTitle(null), 'item.md');
  assert.equal(fileNameFromTitle('###'), 'item.md');
});

test('extension is parameterizable (PDF is the next slice)', () => {
  assert.equal(fileNameFromTitle('Guia', 'pdf'), 'Guia.pdf');
});

test('truncates a long title but keeps the extension', () => {
  const n = fileNameFromTitle('a'.repeat(200));
  assert.equal(n.length, 83); // 80 + '.md'
  assert.ok(n.endsWith('.md'));
});
