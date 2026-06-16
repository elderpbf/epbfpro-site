// Trail i18n discipline: the public face keeps its OWN dictionaries (separate
// bounded context), but the same rule applies — pt-BR and en carry identical key
// sets. Plus a legal pin: the LGPD consent notice must always name the data
// controller (CNPJ) and the data-subject contact, so a refactor cannot silently
// drop the legally-required disclosure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const i18n = await import('../trilha/i18n.js');
const { t, setLang } = i18n;

// Pull the raw pt/en objects by reading the source (the module only exposes t()).
const src = fs.readFileSync(fileURLToPath(new URL('../trilha/i18n.js', import.meta.url)), 'utf8');

function keysOf(objName) {
  // Grab the slice between `const <objName> = {` and the closing `};`.
  const start = src.indexOf('const ' + objName + ' = {');
  assert.ok(start !== -1, objName + ' object exists');
  const end = src.indexOf('\n};', start);
  const body = src.slice(start, end);
  const re = /'([^']+)':/g;
  const keys = new Set();
  let m;
  while ((m = re.exec(body))) keys.add(m[1]);
  return keys;
}

test('trilha pt and en have identical key sets', () => {
  const ptKeys = keysOf('pt');
  const enKeys = keysOf('en');
  const missingInEn = [...ptKeys].filter((k) => !enKeys.has(k));
  const missingInPt = [...enKeys].filter((k) => !ptKeys.has(k));
  assert.deepEqual(missingInEn, [], 'keys in pt but missing in en');
  assert.deepEqual(missingInPt, [], 'keys in en but missing in pt');
});

test('the login namespace exists in both languages', () => {
  const ptKeys = keysOf('pt');
  const loginKeys = [...ptKeys].filter((k) => k.startsWith('login.'));
  assert.ok(loginKeys.length > 0, 'pt has login.* keys');
});

test('the consent notice names the controller CNPJ and the data-subject contact', () => {
  setLang('pt-BR');
  const pt = t('login.consent_notice');
  assert.ok(pt.includes('65.254.064/0001-64'), 'pt notice carries the controller CNPJ');
  assert.ok(pt.includes('contato@pensoia.com'), 'pt notice carries the data-subject contact');
  assert.ok(/LGPD|13\.709/.test(pt), 'pt notice references the LGPD');

  setLang('en');
  const en = t('login.consent_notice');
  assert.ok(en.includes('65.254.064/0001-64'), 'en notice carries the controller CNPJ');
  assert.ok(en.includes('contato@pensoia.com'), 'en notice carries the data-subject contact');
  setLang('pt-BR');
});
