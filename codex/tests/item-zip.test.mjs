// item-zip.test.mjs, the multi-item .zip bundle (js/item-zip.js). The download trigger is
// browser-only; here lives the packaging, which is pure: [{title,text}] goes in, a real zip
// comes out, checked by unpacking it with the same fflate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildZip } from '../js/item-zip.js';
import { uniqueNames } from '../js/item-download.js';
import { unzipSync, strFromU8 } from '../js/vendor/fflate.js';

// Élder's real project: the instruction plus the two knowledge-base templates.
const PROJETO = [
  { title: '# Prompt: Resumo Preparatório para Audiência para Magistrados', text: 'instrucao' },
  { title: '# Modelo: Relatório Preparatório para Audiência CÍVEL para Magistrados', text: 'civel' },
  { title: '# Modelo: Relatório Preparatório para Audiência CRIMINAL para Magistrados', text: 'crime' },
];

test('bundles the 3 items with readable names and intact content', () => {
  const files = unzipSync(buildZip(PROJETO));
  const names = Object.keys(files).sort();
  assert.equal(names.length, 3);
  assert.ok(names.every((n) => n.endsWith('.md')));
  const byText = Object.fromEntries(names.map((n) => [strFromU8(files[n]), n]));
  assert.ok(byText.instrucao && byText.civel && byText.crime);
});

test('accented content survives the round trip (UTF-8)', () => {
  const files = unzipSync(buildZip([{ title: 'A', text: 'Audiência preparatória: ação e ré' }]));
  assert.equal(strFromU8(files['A.md']), 'Audiência preparatória: ação e ré');
});

// Two different titles can collapse into the same name once accents and punctuation are
// stripped; in the zip one would silently overwrite the other.
test('titles that collapse into the same name do not overwrite each other', () => {
  const files = unzipSync(buildZip([
    { title: 'Relatório: ação', text: 'a' },
    { title: 'Relatorio ação!', text: 'b' },
  ]));
  assert.equal(Object.keys(files).length, 2);
  assert.deepEqual(Object.values(files).map(strFromU8).sort(), ['a', 'b']);
});

test('uniqueNames numbers starting from the second collision', () => {
  assert.deepEqual(uniqueNames(['X', 'X', 'X']), ['X.md', 'X-2.md', 'X-3.md']);
});

test('an empty bundle still produces a valid zip', () => {
  assert.deepEqual(Object.keys(unzipSync(buildZip([]))), []);
});
