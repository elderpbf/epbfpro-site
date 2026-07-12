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
const html = read('../../trilha/entrar.html');
const css = read('../trilha/css/entrar.css');
const js = read('../trilha/js/entrar.js');
const redirects = read('../../_redirects');
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

test('entrar.js validates the code via the facade and lands on the permanent /trilha/<code>', () => {
  assert.match(js, /from '\.\/api\.js'/, 'uses the trilha facade');
  assert.match(js, /resolveCode\(/, 'resolves the code server-side to validate (permanent access_code or legacy letters)');
  assert.match(js, /location\.replace\(/, 'forwards into the trilha');
  assert.match(js, /'\/trilha\/'\s*\+\s*encodeURIComponent\(code\)/, 'lands ON the code URL (the turma permanent identity); the page resolves it in place');
  assert.match(js, /location\.origin/, 'redirects on the current origin (staging stays on staging)');
  // resolveAndGo no longer builds the slug/token URL; the &et= hand-off is gone (the page picks
  // up the et from the resolution). buildTurmaUrl still uses ?k= for the e-mail / trocar-turma
  // paths — the page normalizes those to the code on load — so ?k= legitimately remains.
  assert.ok(!/'&et='/.test(js), 'the entry no longer threads the enrollment token in the URL (the page resolves it)');
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
  assert.match(js, /createLoginFlow/, 'drives the SHARED login flow (same module as the wall) — the two screens converge');
  assert.match(js, /\.entrar\(/, 'runs the shared flow.entrar (the magic-link path), not a divergent impl');
  assert.match(js, /pollValidation|pollApproval/, 'runs the shared validation + approval polls (aguardando aprovação), same as the wall');
  assert.ok(!/requestCode|verifyCode/.test(js), 'the OTP code flow is retired on the landing (magic link via the shared flow)');
  assert.ok(!/clearToken\(/.test(js), 'a failed device-session check never deletes the token (a network blip must not strand a logged-in student on the registration screen)');
  assert.match(js, /cdx-entrar-step-code/, 'choosing e-mail hides the código card (focus the e-mailed code)');
  assert.ok(!/renderContinue|cdx-entrar-cont/.test(js), 'the Continuar banner is gone');
  assert.ok(!/renderHub|cdx-entrar-hub/.test(js), 'the minhas-turmas hub is gone');
  assert.ok(!/callWorker\s*\(/.test(js), 'never calls callWorker directly');
});

test('entrar.html hosts the código + e-mail entry, no Continuar banner, no hub', () => {
  assert.match(html, /id="cdx-entrar-email"/, 'e-mail container present');
  assert.match(html, /id="cdx-entrar-form"/, 'código form present');
  assert.ok(!/id="cdx-entrar-cont"/.test(html), 'the Continuar banner is gone');
  assert.ok(!/id="cdx-entrar-hub"/.test(html), 'the hub container is gone');
});

test('the code route serves the student page in place', () => {
  // Inversion: /trilha/<code> now serves the student area (the code is the resting URL),
  // NOT the entrar page. The routing lives in _redirects (Cloudflare Pages), .htaccess is dead.
  assert.match(redirects, /\/trilha\/:code\s+\/trilha\/\?code=:code\s+200/, '/trilha/<code> serves the student area in place');
  assert.match(redirects, /\/trilha\/\s+\/trilha\/entrar\s+200/, 'bare /trilha/ still falls back to the manual entry form');
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
  assert.match(i18n, /'entrar\.email_lead':\s*'Enviaremos um link por e-mail para validar\.'/, 'pt e-mail copy (send a validation link, not a code)');
  for (const k of ['entrar.continue', 'entrar.eyebrow', 'entrar.email_h', 'entrar.code_sent', 'entrar.other_email']) {
    const count = (i18n.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || []).length;
    assert.ok(count >= 2, `${k} present in pt + en`);
  }
});
