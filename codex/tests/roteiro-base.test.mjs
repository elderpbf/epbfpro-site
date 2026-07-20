// tests/roteiro-base.test.mjs
// track-46 fatia 2b/2c, source-level contract for roteiro/roteiro-base.js (the
// aula base selector + promote controls): mount/unmount, facade-only, i18n keys
// in both dicts, and the BINDING RULE that nothing is copied down until the
// teacher's explicit "Selecionar" click (a bare dropdown change must never apply).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const readSrc = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const src = readSrc('../roteiro/roteiro-base.js');
const pt = (await import('../i18n/pt.js')).default;
const en = (await import('../i18n/en.js')).default;

test('exports mount and unmount', () => {
  assert.match(src, /export\s+function\s+mount\s*\(/);
  assert.match(src, /export\s+function\s+unmount\s*\(/);
});

test('reaches the backend ONLY through the roteiro facade group', () => {
  assert.match(src, /import\s*\{\s*roteiro\s+as\s+api\s*\}\s*from\s*['"]\.\.\/js\/codex-api\.js['"]/);
  assert.ok(!/\bcallWorker\s*\(/.test(src), 'no direct callWorker() call');
  assert.ok(!/localStorage/.test(src), 'no localStorage reference');
});

test('BINDING RULE: the select alone never applies a base (only an explicit click does)', () => {
  const onChangeMatch = src.match(/function _onChange\s*\([^)]*\)\s*\{([^}]*)\}/);
  assert.ok(onChangeMatch, '_onChange handler found');
  assert.ok(!/api\.setAula/.test(onChangeMatch[1]), '_onChange body never calls setAula directly');
  assert.match(src, /data-rb-apply/, 'an explicit apply button exists');
  assert.match(src, /_applySelection/, 'the apply button is wired to a dedicated handler');
});

test('promote offers all 3 scopes and both promote target modes', () => {
  for (const v of ["value=\"ponto\"", "value=\"aula\"", "value=\"todas\""]) {
    assert.ok(src.includes(v), `scope option ${v}`);
  }
  for (const fn of ['_promotePonto', '_promoteAula', '_promoteTodas']) {
    assert.match(src, new RegExp('function ' + fn + '\\s*\\('));
  }
  assert.match(src, /patchPonto\(/, 'ponto scope patches via the pure model helper, no ad-hoc merge');
});

test('"todas" targets each aula\'s own base pointer, falling back to its position', () => {
  const fn = src.slice(src.indexOf('function _promoteTodas'));
  assert.match(fn, /roteiro_base_number\s*!=\s*null.*Number\(res\.roteiro_base_number\).*:.*Number\(a\.aula_number\)|Number\(res\.roteiro_base_number\)[\s\S]{0,40}Number\(a\.aula_number\)/);
});

test('every literal i18n key referenced exists in BOTH pt.js and en.js', () => {
  const keys = new Set();
  const re = /['"]((?:roteiro|cohorts)\.[a-zA-Z0-9_.]+)['"]/g;
  let m;
  while ((m = re.exec(src))) keys.add(m[1]);
  assert.ok(keys.size > 5, 'found a meaningful number of keys');
  const missing = [...keys].filter((k) => !(k in pt) || !(k in en));
  assert.deepEqual(missing, [], 'all referenced keys exist in pt AND en');
});

test('a failed base-apply / promote surfaces via notice.internal (never swallowed)', () => {
  assert.match(src, /import\s+\*\s+as\s+notice\s+from\s+['"]\.\.\/js\/notice\.js['"]/);
  const catchCount = (src.match(/notice\.internal\(/g) || []).length;
  assert.ok(catchCount >= 3, 'multiple async error paths route to notice.internal');
});
