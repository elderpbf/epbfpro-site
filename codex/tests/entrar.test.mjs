// codex/trilha/entrar.html — typed-entry landing (pensoia.com/trilha/<code>), ported
// from go/index.html into the Codex/trilha contract. Source-contract pins: the go
// container values copied value-for-value, Codex chrome (no backstage), facade-only
// resolution, the route wired, and the served copy in sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readCode } from '../trilha/js/entrar.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../trilha/entrar.html');
const served = read('../../trilha/entrar.html');
const css = read('../trilha/css/entrar.css');
const js = read('../trilha/js/entrar.js');
const htaccess = read('../../trilha/.htaccess');
const i18n = read('../trilha/i18n.js');
const home = read('../../index.html');

test('entrar rides Codex chrome, no backstage in the appearance layer', () => {
  assert.ok(!/backstage\/(css|js)\//.test(html), 'no backstage CSS/JS');
  assert.match(html, /\/codex\/css\/theme\.css/, 'codex theme tokens');
  assert.match(html, /\/codex\/trilha\/css\/entrar\.css/, 'entrar css');
  assert.match(html, /<pensoia-header mode="student"/, 'codex pensoia-header');
  assert.match(html, /\/codex\/trilha\/js\/pensoia-header\.js/, 'codex header component');
});

test('entrar.css copied the go container values verbatim (prefixed)', () => {
  assert.match(css, /\.cdx-entrar\b[^}]*max-width: 480px/, 'container max-width');
  assert.match(css, /\.cdx-entrar\b[^}]*padding: 64px 20px/, 'container padding');
  assert.match(css, /\.cdx-entrar-title\b[^}]*font-size: 1\.2rem/, 'title size');
  assert.match(css, /\.cdx-entrar-note\b[^}]*border-top: 1px solid var\(--border\)/, 'note rule');
  assert.ok(!/\.container\s*\{/.test(css), 'old .container selector gone (prefixed to cdx-entrar)');
});

test('entrar.js resolves the code via the facade and forwards with k + et', () => {
  assert.match(js, /from '\.\/api\.js'/, 'uses the trilha facade');
  assert.match(js, /resolveEnrollCode\(/, 'resolves the 4-digit code server-side');
  assert.match(js, /location\.replace\(/, 'forwards into the trilha');
  assert.match(js, /'\?k='/, 'carries the public token (k)');
  assert.match(js, /'&et='/, 'carries the enrollment token (et), like the QR');
  assert.match(js, /location\.origin/, 'redirects on the current origin (staging stays on staging)');
  assert.ok(!/callWorker\s*\(/.test(js), 'never calls callWorker directly');
});

test('readCode reads the 4-digit code from the path or the query', () => {
  assert.equal(readCode('?code=1234', '/trilha/entrar'), '1234');
  assert.equal(readCode('', '/trilha/4321'), '4321');
  assert.equal(readCode('', '/trilha/4321/'), '4321');
  assert.equal(readCode('?code=abc', '/trilha/entrar'), '');   // non-numeric query ignored
  assert.equal(readCode('', '/trilha/foo/bar'), '');           // not a code path
});

test('the served copy is in sync and the 4-digit route is wired', () => {
  assert.equal(served, html, 'Site/trilha/entrar.html matches the source copy');
  assert.match(htaccess, /\^\(\[0-9\]\{4\}\)\/\?\$ entrar\.html\?code=\$1/, '/trilha/<4-digit> routes to entrar.html');
  assert.match(htaccess, /\^\$ entrar\.html/, 'bare /trilha/ falls back to the manual entry form');
});

test('the homepage offers an Área do Aluno entry to /trilha/entrar', () => {
  assert.match(home, /href="\/trilha\/entrar"/, 'homepage links to the student entry page');
  assert.match(home, /aria-label="Área do Aluno"/, 'the entry is labelled for students');
});

test('entrar i18n keys exist in both pt and en', () => {
  for (const k of ['entrar.title', 'entrar.submit', 'entrar.not_found', 'entrar.note']) {
    const count = (i18n.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || []).length;
    assert.ok(count >= 2, `${k} present in pt + en`);
  }
});
