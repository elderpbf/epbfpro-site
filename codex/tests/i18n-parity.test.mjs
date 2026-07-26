// i18n discipline: pt.js and en.js carry the SAME keys, and every t('...') key
// referenced by the Content modules exists in BOTH dictionaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (rel) => fileURLToPath(new URL(rel, import.meta.url));

import { collectSources, deadKeys, CODEX_DYNAMIC_PREFIXES } from './_i18n-usage.mjs';

const pt = (await import('../i18n/pt.js')).default;
const en = (await import('../i18n/en.js')).default;

test('pt.js and en.js have identical key sets', () => {
  const ptKeys = new Set(Object.keys(pt));
  const enKeys = new Set(Object.keys(en));
  const missingInEn = [...ptKeys].filter((k) => !enKeys.has(k));
  const missingInPt = [...enKeys].filter((k) => !ptKeys.has(k));
  assert.deepEqual(missingInEn, [], 'keys in pt but missing in en');
  assert.deepEqual(missingInPt, [], 'keys in en but missing in pt');
});

test('every t() key used by the Content modules exists in both dictionaries', () => {
  const files = [
    '../content/content.js', '../content/items.js', '../content/presets.js',
    '../content/releases.js', '../content/turma-picker.js', '../content/apostila.js',
    '../content/tarefas.js', '../content/labs.js', '../content/interativos.js',
    '../content/drive.js', '../content/slides.js', '../lessons/lessons.js',
  ];
  const used = new Set();
  for (const rel of files) {
    const p = here(rel);
    assert.ok(fs.existsSync(p), `${rel} exists`);
    const src = fs.readFileSync(p, 'utf8');
    // Match t('key') / t("key") — static keys only (dynamic t(var) is skipped).
    const re = /\bt\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src))) used.add(m[1]);
  }
  assert.ok(used.size > 0, 'Content modules reference at least one t() key');
  const missing = [...used].filter((k) => !(k in pt) || !(k in en));
  assert.deepEqual(missing, [], 'all referenced keys present in pt AND en');
});

test('Content dictionaries cover the content.* namespace in both langs', () => {
  const ptContent = Object.keys(pt).filter((k) => k.startsWith('content.'));
  assert.ok(ptContent.length > 0, 'pt has content.* keys');
  for (const k of ptContent) {
    assert.ok(k in en, `en mirrors ${k}`);
  }
});

// The REVERSE direction (track-30 [i18n-05]): the checks above prove every key a
// module asks for exists; this one proves the dictionary is not accumulating keys
// nothing asks for. That rot is what let the 2026-06-27 audit ledger claim 43 open
// findings when 35 were already fixed.
//
// The sweep that introduced this guard found 179 dead keys (~9% of the dictionary),
// residue of retired features: the cert-template namespace, the apostila importer,
// a batch of tarefas.*. Élder had them deleted 2026-07-26, so this starts at zero
// and carries NO baseline: a dead key is now a red suite, not a backlog entry.
test('the Codex dictionary carries no dead keys', () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const blob = collectSources(
    [repo + 'codex', repo + 'trilha', repo + 'js'],
    ['codex/i18n/', 'codex/trilha/i18n.js'],
  );
  const dead = deadKeys(Object.keys(pt), blob, CODEX_DYNAMIC_PREFIXES);
  assert.deepEqual(dead, [],
    'dead key(s): wire them up, or delete from BOTH pt.js and en.js');
});
