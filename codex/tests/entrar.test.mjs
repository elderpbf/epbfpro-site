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
  assert.match(js, /\.requestCode\(/, 'runs the shared flow.requestCode (the OTP code path) — /trilha is an active login, always the code');
  assert.match(js, /pollValidation|pollApproval/, 'runs the shared validation + approval polls (aguardando aprovação), same as the wall');
  assert.ok(!/email_auth_method/.test(js), 'no per-turma auth-method branch — /trilha always uses the OTP code (Élder 2026-07-14)');
  assert.match(js, /requestCode|verifyCode/, 'the OTP code path is the login (requestCode/verifyCode)');
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

// ---------------------------------------------------------------------------------
// track-57: the field asked for a code that the product stopped issuing.
//
// Elder, 2026-07-31: *"na tela de trilha/entrar, pede um codigo numerico que nao
// existe mais. o codigo numerico e da turma agora. nao existe mais codigo criado na
// hora. aquele espaco deve ser para colocar o codigo da turma para acessar"*, and
// decided where to validate: *"valida la em entrar mesmo, nao tem como ir para area do
// aluno sem ter o codigo de uma turma existente"*.
//
// THE CODE IS NUMERIC, and this is pinned because the Worker's resolver accepts
// `[A-Za-z0-9]{4}`, and that slack already caused a mistake once. It exists to match the
// LEGACY `classpulse_session_id` (letters, e.g. TVKV) and not break old links; what
// the student types is the `access_code`, and it is numeric: checked against production D1 on
// 2026-07-31, 9 turmas, 9 four-digit codes. Elder: *"os codigos de turma sao
// numericos, nao alfanumericos"*.

test('the field and the gate stay numeric, like the turma access_code', () => {
  assert.match(js, /getElementById\('cdx-entrar-input'\)[\s\S]{0,160}mode:\s*'digits'/, "the field is mode:'digits'");
  assert.match(js, /\/\^\[0-9\]\{4\}\$\//, 'submit requires 4 digits');
});

test('a code that does not exist is cleared from the field, like the other screens', () => {
  // Same rule that already applies on the five code screens: on error, the field clears
  // and gets focus, instead of the student having to manually erase what they just typed.
  const bloco = js.slice(js.indexOf('async function resolveAndGo'), js.indexOf('async function autoEnter'));
  assert.match(bloco, /entrar\.not_found/, 'the inline error is still the code-not-found one');
  assert.match(bloco, /CodeInput\.clear\(/, 'the field is cleared when the code does not resolve');
});

test('the copy talks about the turma code, not the live class', () => {
  // The old copy described a code generated on the spot, which the product no longer issues,
  // and told the student to "check the screen", which no longer exists.
  assert.ok(!/aula ao vivo/.test(html), 'the live-class promise is gone from the HTML');
  assert.ok(!/aula ao vivo/.test(i18n), 'the live-class promise is gone from pt');
  assert.ok(!/live class/i.test(i18n), 'the live-class promise is gone from en');
  assert.ok(!/Confira na tela/.test(i18n), 'the error no longer tells the student to look at the class screen');
  assert.match(i18n, /'entrar\.code_sub':\s*'O código de 4 números da sua turma\.'/, 'pt talks about the turma 4-digit code');
  assert.match(i18n, /'entrar\.code_ph':\s*'0000'/, 'the field placeholder example is numeric');
  for (const k of ['entrar.code_sub', 'entrar.code_label', 'entrar.code_ph']) {
    const count = (i18n.match(new RegExp("'" + k.replace('.', '\.') + "'", 'g')) || []).length;
    assert.ok(count >= 2, `${k} still present in both languages`);
  }
});

test('a network outage is not reported to the student as a wrong code', () => {
  // Both failures fell into the SAME branch, so any transport error told the student their
  // code was wrong. That is what disguised the 2026-07-31 diagnosis for a round, and
  // is what would make a student with the right code call the teacher to complain about it.
  const bloco = js.slice(js.indexOf('async function resolveAndGo'), js.indexOf('async function autoEnter'));
  assert.match(bloco, /catch\s*\(_\)\s*\{\s*semResposta\s*=\s*true/, 'the throw is flagged, not confused with found:false');
  assert.match(bloco, /entrar\.offline/, 'transport failure has its own message');
  assert.match(bloco, /entrar\.not_found/, 'nonexistent code keeps its own');
  // And the field is NOT cleared when the network is down: the code may be perfectly fine.
  const semResposta = bloco.slice(bloco.indexOf('if (semResposta)'));
  assert.ok(semResposta.indexOf('return;') < semResposta.indexOf('CodeInput.clear('),
    'the network-outage branch returns BEFORE clearing the field');
  for (const k of ['entrar.offline']) {
    const count = (i18n.match(new RegExp("'" + k.replace('.', '\.') + "'", 'g')) || []).length;
    assert.ok(count >= 2, `${k} in both languages`);
  }
});
