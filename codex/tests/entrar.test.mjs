// codex/trilha/entrar.html — typed-entry landing (pensoia.com/trilha/<code>), ported
// from go/index.html into the Codex/trilha contract. Source-contract pins: the go
// container values copied value-for-value, Codex chrome (no backstage), facade-only
// resolution, the route wired, and the served copy in sync.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readCode, buildTurmaUrl } from '../trilha/js/entrar.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../trilha/entrar.html');
const served = read('../../trilha/entrar.html');
const css = read('../trilha/css/entrar.css');
const js = read('../trilha/js/entrar.js');
const htaccess = read('../../trilha/.htaccess');
const i18n = read('../trilha/i18n.js');
const home = read('../../index.html');

test('entrar rides Codex chrome, no backstage in the appearance layer', () => {
  // The debug pill (infra, gated by bs_debug, invisible to students) is now codex-owned
  // (/codex/js/debug.js), so the Trail no longer loads ANYTHING from /backstage/ — the
  // decoupling that lets backstage move out to its own repo (item 12).
  assert.ok(!/backstage\/(css|js)\//.test(html), 'no backstage CSS/JS (the debug pill is now codex-owned)');
  assert.match(html, /\/codex\/js\/debug\.js/, 'the debug pill is loaded (error capture on the entry page)');
  assert.match(html, /\/codex\/css\/theme\.css/, 'codex theme tokens');
  assert.match(html, /\/codex\/trilha\/css\/entrar\.css/, 'entrar css');
  assert.match(html, /<pensoia-header mode="student"/, 'codex pensoia-header');
  assert.match(html, /\/codex\/trilha\/js\/pensoia-header\.js/, 'codex header component');
});

test('entrar.css carries the mock-D card layout values (prefixed)', () => {
  assert.match(css, /\.cdx-entrar\b[^}]*max-width: 720px/, 'container max-width (the 2-card layout)');
  assert.match(css, /\.cdx-entrar\b[^}]*padding: 1\.5rem 1\.25rem 4rem/, 'container padding');
  assert.match(css, /\.cdx-entrar-title\b[^}]*font-size: 1\.5rem/, 'title size');
  assert.match(css, /\.cdx-entrar-note\b[^}]*border-top: 1px solid var\(--border\)/, 'note rule');
  assert.match(css, /\.cdx-entrar-step-code[^{]*\.cdx-entrar-card-code\b[^}]*display: none/, 'e-mail step hides the código card');
  assert.ok(!/\.container\s*\{/.test(css), 'old .container selector gone (prefixed to cdx-entrar)');
});

test('entrar.js resolves the code via the facade and forwards with k + et', () => {
  assert.match(js, /from '\.\/api\.js'/, 'uses the trilha facade');
  assert.match(js, /resolveCode\(/, 'resolves the code server-side (permanent access_code or legacy letters)');
  assert.match(js, /location\.replace\(/, 'forwards into the trilha');
  assert.match(js, /'\?k='/, 'carries the public token (k)');
  assert.match(js, /'&et='/, 'carries the enrollment token (et), like the QR');
  assert.match(js, /location\.origin/, 'redirects on the current origin (staging stays on staging)');
  assert.ok(!/callWorker\s*\(/.test(js), 'never calls callWorker directly');
});

test('readCode reads a 4-char code (digits or legacy letters) from the path or the query', () => {
  assert.equal(readCode('?code=1234', '/trilha/entrar'), '1234');
  assert.equal(readCode('', '/trilha/4321'), '4321');
  assert.equal(readCode('', '/trilha/4321/'), '4321');
  assert.equal(readCode('', '/trilha/TVKV'), 'TVKV');          // legacy 4-letter code resolves too
  assert.equal(readCode('?code=abc', '/trilha/entrar'), '');   // 3 chars: not a code
  assert.equal(readCode('', '/trilha/entrar'), '');            // the entry route word is not a code
  assert.equal(readCode('', '/trilha/foo/bar'), '');           // last segment 'bar' is 3 chars
});

test('buildTurmaUrl builds the public turma launch URL with k (url-encoded)', () => {
  assert.equal(
    buildTurmaUrl({ client_slug: 'jfse', turma_slug: 'geral', k: 'KTOK' }, 'https://staging.pensoia.com'),
    'https://staging.pensoia.com/trilha/jfse/geral?k=KTOK');
  // tolerates the OTP-verify entry shape (token instead of k) and encodes
  assert.equal(
    buildTurmaUrl({ client_slug: 'a b', turma_slug: 't', token: 'a/b' }, 'https://x.com'),
    'https://x.com/trilha/a%20b/t?k=a%2Fb');
});

test('entrar auto-enters a valid device session (no Continuar banner, no hub)', () => {
  assert.match(js, /getKnownTurmas/, 'reads the device turma registry');
  assert.match(js, /sessionCheck\(/, 'validates the device session server-side before entering');
  assert.match(js, /location\.replace\(/, 'a valid session goes straight into its turma');
  assert.match(js, /createLoginFlow/, 'drives the shared login controller for the e-mail path');
  assert.match(js, /requestCode|verifyCode/, 'uses the OTP code flow (not the magic link)');
  assert.ok(!/clearToken\(/.test(js), 'a failed device-session check never deletes the token (a network blip must not strand a logged-in student on the registration screen)');
  assert.match(js, /cdx-entrar-step-code/, 'choosing e-mail hides the código card (focus the e-mailed code)');
  assert.ok(!/renderContinue|cdx-entrar-cont/.test(js), 'the Continuar banner is gone');
  assert.ok(!/renderHub|cdx-entrar-hub/.test(js), 'the minhas-turmas hub is gone');
  assert.ok(!/callWorker\s*\(/.test(js), 'never calls callWorker directly');
});

test('entrar.html hosts the código + e-mail entry, no Continuar banner, no hub (both copies in sync)', () => {
  assert.match(html, /id="cdx-entrar-email"/, 'e-mail container present');
  assert.match(html, /id="cdx-entrar-form"/, 'código form present');
  assert.ok(!/id="cdx-entrar-cont"/.test(html), 'the Continuar banner is gone');
  assert.ok(!/id="cdx-entrar-hub"/.test(html), 'the hub container is gone');
  assert.equal(served, html, 'served copy still matches the source copy');
});

test('the served copy is in sync and the 4-digit route is wired', () => {
  assert.equal(served, html, 'Site/trilha/entrar.html matches the source copy');
  assert.match(htaccess, /\^\(\[0-9\]\{4\}\)\/\?\$ entrar\.html\?code=\$1/, '/trilha/<4-digit> routes to entrar.html');
  assert.match(htaccess, /\^\$ entrar\.html/, 'bare /trilha/ falls back to the manual entry form');
});

test('the homepage student entry points at /trilha and reads "Acessar minha trilha"', () => {
  assert.match(home, /href="\/trilha"/, 'homepage links to the consolidated /trilha entry');
  assert.match(home, /aria-label="Acessar minha trilha"/, 'the student entry is clearly labelled');
});

test('entrar i18n keys exist in both pt and en', () => {
  for (const k of ['entrar.title', 'entrar.submit', 'entrar.not_found', 'entrar.note']) {
    const count = (i18n.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || []).length;
    assert.ok(count >= 2, `${k} present in pt + en`);
  }
});

test('entrar i18n carries the new entry copy in both langs', () => {
  assert.match(i18n, /'entrar\.email_lead':\s*'Enviaremos um código por e-mail para autenticar\.'/, 'pt e-mail copy (authenticate, not "4 letras / sem senha")');
  for (const k of ['entrar.continue', 'entrar.eyebrow', 'entrar.email_h', 'entrar.code_sent', 'entrar.other_email']) {
    const count = (i18n.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || []).length;
    assert.ok(count >= 2, `${k} present in pt + en`);
  }
});
