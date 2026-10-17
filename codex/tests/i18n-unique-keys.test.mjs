// A key written twice in a dictionary is silently resolved by the LAST one, so a new string can
// overwrite an old one that other screens still read. It happened on 2026-10-16: a second
// 'cohorts.aula_label' ('Aula {n}') turned every lesson header into "Aula {n} 2".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

for (const lang of ['pt', 'en']) {
  test(`i18n/${lang}.js declares each key once`, () => {
    const src = fs.readFileSync(fileURLToPath(new URL(`../i18n/${lang}.js`, import.meta.url)), 'utf8');
    const keys = [...src.matchAll(/^\s*'([^']+)'\s*:/gm)].map((m) => m[1]);
    const seen = new Set();
    const dupes = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
    assert.deepEqual(dupes, []);
  });
}
