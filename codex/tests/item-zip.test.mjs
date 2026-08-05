// item-zip.test.mjs, o pacote .zip de vários itens (js/item-zip.js). O disparo do download é
// browser-only; aqui fica o empacotamento, que é puro: entra [{title,text}], sai um zip real,
// conferido desempacotando com o mesmo fflate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildZip } from '../js/item-zip.js';
import { uniqueNames } from '../js/item-download.js';
import { unzipSync, strFromU8 } from '../js/vendor/fflate.js';

// O projeto real do Élder: a instrução + os dois modelos da base de conhecimento.
const PROJETO = [
  { title: '# Prompt: Resumo Preparatório para Audiência para Magistrados', text: 'instrucao' },
  { title: '# Modelo: Relatório Preparatório para Audiência CÍVEL para Magistrados', text: 'civel' },
  { title: '# Modelo: Relatório Preparatório para Audiência CRIMINAL para Magistrados', text: 'crime' },
];

test('empacota os 3 itens com nome legivel e conteudo intacto', () => {
  const files = unzipSync(buildZip(PROJETO));
  const names = Object.keys(files).sort();
  assert.equal(names.length, 3);
  assert.ok(names.every((n) => n.endsWith('.md')));
  const byText = Object.fromEntries(names.map((n) => [strFromU8(files[n]), n]));
  assert.ok(byText.instrucao && byText.civel && byText.crime);
});

test('acento no conteudo sobrevive ao round-trip (UTF-8)', () => {
  const files = unzipSync(buildZip([{ title: 'A', text: 'Audiência preparatória: ação e ré' }]));
  assert.equal(strFromU8(files['A.md']), 'Audiência preparatória: ação e ré');
});

// Dois titulos diferentes podem colapsar no mesmo nome depois de tirar acento e pontuacao;
// no zip um sobrescreveria o outro em silencio.
test('titulos que colapsam no mesmo nome nao se sobrescrevem', () => {
  const files = unzipSync(buildZip([
    { title: 'Relatório: ação', text: 'a' },
    { title: 'Relatorio ação!', text: 'b' },
  ]));
  assert.equal(Object.keys(files).length, 2);
  assert.deepEqual(Object.values(files).map(strFromU8).sort(), ['a', 'b']);
});

test('uniqueNames numera a partir da segunda colisao', () => {
  assert.deepEqual(uniqueNames(['X', 'X', 'X']), ['X.md', 'X-2.md', 'X-3.md']);
});

test('pacote vazio ainda gera um zip valido', () => {
  assert.deepEqual(Object.keys(unzipSync(buildZip([]))), []);
});
