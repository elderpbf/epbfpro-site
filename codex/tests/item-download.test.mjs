// item-download.test.mjs, o download de conteúdo de item gerado na hora (js/item-download.js).
// O disparo do download é browser-only (URL.createObjectURL + clique sintético, conferido no
// preview); aqui fica a parte pura: o nome do arquivo tirado do título do item.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileNameFromTitle } from '../js/item-download.js';

// Os títulos reais do acervo trazem marcação de markdown e acentos, e nenhum dos dois
// sobrevive bem a um sistema de arquivos. Este é o item 900028 em produção.
test('tira o # do título e os acentos', () => {
  assert.equal(
    fileNameFromTitle('# Prompt: Resumo Preparatório para Audiência para Magistrados'),
    'Prompt-Resumo-Preparatorio-para-Audiencia-para-Magistrados.md',
  );
});

test('os dois Modelos não colidem entre si', () => {
  const civel = fileNameFromTitle('# Modelo: Relatório Preparatório para Audiência CÍVEL para Magistrados');
  const crime = fileNameFromTitle('# Modelo: Relatório Preparatório para Audiência CRIMINAL para Magistrados');
  assert.notEqual(civel, crime);
  assert.match(civel, /CIVEL/);
  assert.match(crime, /CRIMINAL/);
});

test('colapsa pontuação em um hífen só e não deixa hífen nas pontas', () => {
  assert.equal(fileNameFromTitle('  ...Olá, mundo!!!  '), 'Ola-mundo.md');
});

test('título vazio cai num nome utilizável', () => {
  assert.equal(fileNameFromTitle(''), 'item.md');
  assert.equal(fileNameFromTitle(null), 'item.md');
  assert.equal(fileNameFromTitle('###'), 'item.md');
});

test('extensão é parametrizável (o PDF é a próxima fatia)', () => {
  assert.equal(fileNameFromTitle('Guia', 'pdf'), 'Guia.pdf');
});

test('trunca título longo mas mantém a extensão', () => {
  const n = fileNameFromTitle('a'.repeat(200));
  assert.equal(n.length, 83); // 80 + '.md'
  assert.ok(n.endsWith('.md'));
});
