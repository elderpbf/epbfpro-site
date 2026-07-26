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
// The 179-key baseline is pre-existing debt, NOT an approval: it freezes today's
// dead keys so the guard can catch anything NEW from 2026-07-26 onward. Deleting a
// batch from the dictionary means deleting it from the baseline in the same commit.
// The list is intentionally a visible fixture rather than an inline allowlist.
test('the Codex dictionary grows no NEW dead keys (baseline frozen 2026-07-26)', () => {
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const blob = collectSources(
    [repo + 'codex', repo + 'trilha', repo + 'js'],
    ['codex/i18n/', 'codex/trilha/i18n.js'],
  );
  const baseline = new Set(JSON.parse(
    fs.readFileSync(here('./fixtures/i18n-dead-baseline.json'), 'utf8')));
  const dead = deadKeys(Object.keys(pt), blob, CODEX_DYNAMIC_PREFIXES);

  const fresh = dead.filter((k) => !baseline.has(k));
  assert.deepEqual(fresh, [],
    'new dead key(s): either wire them up, or delete them from pt.js + en.js');

  const revived = [...baseline].filter((k) => !dead.includes(k) && (k in pt));
  assert.deepEqual(revived, [],
    'baseline key(s) now in use or removed — drop them from fixtures/i18n-dead-baseline.json');
});
