// Browser check for the Trilha student login (OTP) at /trilha/entrar, run against the
// branch preview (never production): https://track-61-acoes.epbfpro-site-staging.pages.dev
//
// WHY THIS EXISTS: OTP migration item 4 ("Trilha") is the last one. The server-side cut
// described in the platform's `otp` recipe (issuance -> platform, verify falls back to
// legacy) DOES NOT EXIST YET for the Trilha: `codex-api/src/actions/student.js`'s
// `studentOtpRequest`/`studentOtpVerify` call `lib/student-auth.js` directly, no
// `platform-otp.js`, no flag (grep confirmed: `FLAG_ADMIN` is the ONLY flow flag defined,
// and it gates the Codex ADMIN login, not the student one). So this check exercises the
// LEGACY Trilha flow that is live today, not a platform path — see the report this script
// prints, and the parent task's summary, for that distinction.
//
// The recipe's three defects (5.1: resend as its own action / visible 60s countdown /
// separate confirmation line) were measured on the CODEX ADMIN screen, a fresh
// reimplementation, AFTER ITS OWN cutover (`codex/js/codex-login.js`). The recipe itself
// says the Trilha is "the reference [...] running in production with real students since
// 2026-07". This check verifies which of the three actually show up on `entrar.html`'s own
// code screen (`codex/trilha/js/entrar.js` renderCodeStep) rather than assuming they do.
//
// THE CODE IS NEVER STORED IN PLAINTEXT (recipe 2: SHA-256 only), so it cannot be "read"
// from D1 in the literal sense. What CAN be read is `code_hash`, and the alphabet is 24
// letters x 4 = 331,776 combinations (the recipe's own point: that keyspace is not what
// protects the code, the 5-attempt lock is) — small enough to brute-force in milliseconds.
// bruteForceCode() below does exactly that against the hash read from
// `classpulse-db-staging`, which is the honest way to "get the code out of D1" here.
//
// Playwright is NOT a repo dependency on purpose:
//   CDX_PLAYWRIGHT=<path>/node_modules node codex/tests/visual/otp-trilha-check.mjs [screenshotDir]
//
// PREREQUISITES this script does NOT set up for you:
//   - `npx wrangler` must already be authenticated for Cloudflare (the d1() helper below shells
//     out to it); an unauthenticated wrangler fails with a cryptic "Unknown arguments" usage dump
//     rather than an auth error.
//   - CDX_CODEX_API_DIR (env var, default: a `codex-api` checkout next to this repo) must point at
//     a local `codex-api` clone — it is only used to run `wrangler d1 execute` from the directory
//     that holds its `wrangler.toml` (staging D1 binding), no code from it is imported.
//   - CDX_PREVIEW (env var, default below) must be a live branch preview already pinned to
//     STAGING via `codex/js/worker-call.js` resolveWorkerUrl (any `*.epbfpro-site-staging.
//     pages.dev` host qualifies) — never point this at production.
//
// TEST DATA: each run inserts throwaway `ct_participants` rows (email LIKE 'otp-check-%') into
// turma id 15 (teste/turma-otp on classpulse-db-staging — confirmed non-archived, non-simple-
// enroll, `PRAGMA table_info` + a direct SELECT before this script was written) and deletes them
// again at the end, so the script is safe to re-run without accumulating rows.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join } from 'node:path';

const PREVIEW = process.env.CDX_PREVIEW || 'https://track-61-acoes.epbfpro-site-staging.pages.dev';
// Sibling checkout by default: this repo's root's PARENT + codex-api (both usually live
// under the same git-repos/ directory).
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url)); // .../epbfpro-site/
const CODEX_API_DIR = process.env.CDX_CODEX_API_DIR || join(REPO_ROOT, '..', 'codex-api');
const D1_DB = 'classpulse-db-staging';
const OTP_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // must match src/lib/student-auth.js OTP_ALPHABET

async function loadPlaywright() {
  try { return await import('playwright'); } catch (_) { /* not a local dep, by design */ }
  const p = process.env.CDX_PLAYWRIGHT;
  if (!p) throw new Error('playwright not found: set CDX_PLAYWRIGHT (see the header)');
  const m = await import(pathToFileURL(join(p, 'playwright', 'index.js')).href);
  return m.chromium ? m : m.default;
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();

const fails = [];
const ok = (cond, label) => { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) fails.push(label); };
const note = (label) => console.log('note ' + label);
const shot = (page, name) => page.screenshot({
  path: (process.argv[2] ? process.argv[2] + '/' : '') + name + '.png', fullPage: true });

// ── D1 access (staging, --remote; classpulse-db-staging is the pinned staging D1) ──────────
function d1(sql) {
  // Windows/cmd.exe quoting: wrap the SQL in double quotes and escape the embedded ones.
  const escaped = sql.replace(/"/g, '\\"');
  const cmd = `npx wrangler d1 execute ${D1_DB} --remote --json --command "${escaped}"`;
  const out = execSync(cmd, { cwd: CODEX_API_DIR, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const parsed = JSON.parse(out);
  return (parsed[0] && parsed[0].results) || [];
}

// Brute-force the 4-letter code from its SHA-256 hash. 24^4 = 331,776 candidates,
// well under a second in Node. This is what "reading the code from D1" means here,
// since only the hash is ever persisted (recipe 2, "storage: SHA-256 only").
function bruteForceCode(hashHex) {
  const A = OTP_ALPHABET;
  for (let a = 0; a < A.length; a++)
    for (let b = 0; b < A.length; b++)
      for (let c = 0; c < A.length; c++)
        for (let d = 0; d < A.length; d++) {
          const cand = A[a] + A[b] + A[c] + A[d];
          if (createHash('sha256').update(cand).digest('hex') === hashHex) return cand;
        }
  return null;
}

function latestOtpRow(email) {
  const rows = d1(`SELECT id, code_hash, expires_at, used_at, fail_count, created_at FROM ct_email_otp WHERE lower(email) = '${email.toLowerCase()}' ORDER BY id DESC LIMIT 1`);
  return rows[0] || null;
}

// ── Test fixture: a real, non-archived, non-simple-enroll turma participant on staging.
// Inserted once by hand ahead of this run (teste/turma-otp, id 15, simple_enroll_until IS
// NULL — confirmed via PRAGMA table_info + a direct SELECT before writing this script).
const TS = Date.now();
function freshEmail(tag) { return `otp-check-${tag}-${TS}@pensoia-test.com`; }

function insertParticipant(email, opts = {}) {
  d1(`INSERT INTO ct_participants (turma_id, name, email, access_status, approved_via, approved_at${opts.consented ? ', consent_at' : ''}) VALUES (15, 'OTP Check', '${email}', 'approved', 'manual', unixepoch()${opts.consented ? ', unixepoch()' : ''})`);
}

async function openEntrar() {
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(PREVIEW + '/trilha/entrar', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cdx-entrar-email', { timeout: 15000 });
  return { page, errs };
}

async function requestCode(page, email) {
  // The email card's form is rendered client-side by entrar.js' startEmail/renderForm.
  await page.waitForSelector('.cdx-entrar-email-input', { timeout: 10000 });
  await page.fill('.cdx-entrar-email-input', email);
  await page.click('.cdx-entrar-email-send');
  await page.waitForSelector('.cdx-entrar-code-input', { timeout: 15000 });
}

// Poll instead of a fixed sleep after clicking "Entrar" on the code step: this script's own
// load (six-plus round-trips to the same turma in one run) makes the worker's response time
// variable, and a fixed wait either flakes early or wastes time late.
async function waitForVerifySettled(page) {
  await page.waitForFunction(() => {
    const b = document.querySelector('.cdx-entrar-verify');
    return !b || !b.disabled;
  }, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300); // let the settle()/render() that follows finish painting
}

// ── 1. Happy path: a RETURNING (already consented) student — request, brute-force the
//    code from D1, verify, land on the turma. A brand-new (unconsented) participant does
//    NOT reach 'authenticated' here; see the "profile step" case below for what happens then. ─
{
  const { page, errs } = await openEntrar();
  const email = freshEmail('happy');
  insertParticipant(email, { consented: true });
  await requestCode(page, email);
  ok(await page.$('.cdx-entrar-code-input') !== null, 'happy: code screen rendered after requesting');
  const row = latestOtpRow(email);
  ok(!!row && !!row.code_hash, 'happy: a ct_email_otp row exists for the address' + (row ? '' : ' -> NO ROW FOUND'));
  const code = row ? bruteForceCode(row.code_hash) : null;
  ok(!!code, 'happy: the code was recovered from its D1 hash' + (code ? ' (' + code + ')' : ' -> BRUTE FORCE FAILED'));
  if (code) {
    await page.fill('.cdx-entrar-code-input', code);
    await page.click('.cdx-entrar-verify');
    await page.waitForURL(/\/trilha\/teste\/turma-otp/, { timeout: 15000 }).catch(() => {});
    ok(/\/trilha\/teste\/turma-otp/.test(page.url()), 'happy: verifying the real code lands on the turma -> ' + page.url());
  }
  ok(errs.length === 0, 'happy: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'otp-trilha-happy');
  await page.close();
}

// ── 1b. A BRAND-NEW participant (no consent_at yet, the real first-time signup shape):
//    the server correctly returns needs_profile, so student-login.js sets flow.state =
//    'profile' — but entrar.js's settle() has NO branch for 'profile' at all (only
//    authenticated / validating / pendingApproval / code, then an unconditional
//    renderForm() else). The code is already burned (single-use) when this happens, so the
//    student is silently bounced back to the blank e-mail step with no error and no way to
//    finish consenting, other than requesting an entirely new code. Recipe §4: "Consent is
//    separate from login" — this is that step, missing on this screen. ─────────────────────
{
  const { page, errs } = await openEntrar();
  const email = freshEmail('profile');
  insertParticipant(email); // no consent_at: needs_profile will be true
  await requestCode(page, email);
  const row = latestOtpRow(email);
  const code = row ? bruteForceCode(row.code_hash) : null;
  ok(!!code, 'profile-step: code minted and recovered for the fresh participant');
  if (code) {
    await page.fill('.cdx-entrar-code-input', code);
    await page.click('.cdx-entrar-verify');
    await waitForVerifySettled(page);
    const backToEmailForm = await page.$eval('.cdx-entrar-email-input', (el) => el.value).catch(() => null) === '';
    const stillOnCodeScreen = await page.$('.cdx-entrar-code-input') !== null;
    const visibleError = (await page.$eval('.cdx-entrar-code-error', (el) => el.textContent).catch(() => null))
      || (await page.$eval('.cdx-entrar-email-error', (el) => el.textContent).catch(() => null)) || '';
    ok(backToEmailForm && !stillOnCodeScreen,
      'profile-step: a CORRECT, first-time code silently resets the screen to the blank e-mail form instead of asking for name+consent (entrar.js settle() has no "profile" branch) -> back-to-email-form=' + backToEmailForm);
    ok(visibleError === '', 'profile-step: and there is NO error/explanation shown for why -> visible text="' + visibleError + '"');
  }
  ok(errs.length === 0, 'profile-step: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'otp-trilha-profile-step');
  await page.close();
}

// ── 2. Wrong code: rejected, field cleared, focused, message matches login.code_invalid. ───
{
  const { page, errs } = await openEntrar();
  const email = freshEmail('wrong');
  insertParticipant(email);
  await requestCode(page, email);
  await page.fill('.cdx-entrar-code-input', 'ZZZZ'); // not a real candidate for a length-4 alphabet code drawn at random
  await page.click('.cdx-entrar-verify');
  await waitForVerifySettled(page);
  const errText = await page.$eval('.cdx-entrar-code-error', (el) => el.textContent).catch(() => '');
  ok(errText.indexOf('inválido') >= 0, 'wrong-code: shows the invalid-code message -> "' + errText + '"');
  const val = await page.$eval('.cdx-entrar-code-input', (el) => el.value).catch(() => '?');
  ok(val === '', 'wrong-code: the field is cleared after a miss -> value="' + val + '"');
  ok(errs.length === 0, 'wrong-code: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'otp-trilha-wrong-code');
  await page.close();
}

// ── 3. Expired code: D1 UPDATE ages the row out (no 15-minute sleep), then verify. ─────────
{
  const { page, errs } = await openEntrar();
  const email = freshEmail('expired');
  insertParticipant(email);
  await requestCode(page, email);
  const row = latestOtpRow(email);
  const code = row ? bruteForceCode(row.code_hash) : null;
  ok(!!row && !!code, 'expired: a real code was minted and recovered' + (code ? '' : ' -> setup failed, skipping'));
  if (row && code) {
    d1(`UPDATE ct_email_otp SET expires_at = 0 WHERE id = ${row.id}`);
    await page.fill('.cdx-entrar-code-input', code);
    await page.click('.cdx-entrar-verify');
    await waitForVerifySettled(page);
    const errText = await page.$eval('.cdx-entrar-code-error', (el) => el.textContent).catch(() => '');
    ok(errText.indexOf('expirado') >= 0, 'expired: the CORRECT code, once expired, is refused as expired, not "invalid" -> "' + errText + '"');
  }
  ok(errs.length === 0, 'expired: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'otp-trilha-expired');
  await page.close();
}

// ── 4. No resend button on this screen at all (a finding, not one of the 5.1 defects,
//    since there is nothing to click) + retyping the same e-mail reuses the live code. ──────
{
  const { page, errs } = await openEntrar();
  const email = freshEmail('resend');
  insertParticipant(email);
  await requestCode(page, email);
  const resendBtn = await page.$('button:has-text("reenviar"), button:has-text("Reenviar"), .tr-login-resend, .cdx-entrar-resend');
  ok(resendBtn === null, 'resend: entrar.js code screen has NO "não recebi o código" / resend control (confirmed absent)');
  // "usar outro e-mail" -> retype the SAME address -> code_still_valid (no new mail fired,
  // same behaviour student-login-modal.js gets from a real resend, just without a dedicated button).
  await page.click('.cdx-entrar-back');
  await page.waitForSelector('.cdx-entrar-email-input', { timeout: 5000 });
  await page.fill('.cdx-entrar-email-input', email);
  await page.click('.cdx-entrar-email-send');
  await page.waitForSelector('.cdx-entrar-code-error', { timeout: 15000 });
  const stillValidText = await page.$eval('.cdx-entrar-code-error', (el) => el.textContent).catch(() => '');
  ok(stillValidText.indexOf('Já enviamos') >= 0, 'resend: re-submitting the same e-mail shows "já enviamos um código" -> "' + stillValidText + '"');
  ok(errs.length === 0, 'resend: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'otp-trilha-resend');
  await page.close();
}

// ── 5. The real gap: `too_many_attempts` has no branch in entrar.js's entryErrorText.
//    Server-side (student-auth.js verifyOtpCode): the fail_count >= MAX_OTP_ATTEMPTS (5)
//    check runs BEFORE the increment, so wrong guesses 1-5 each still read 'invalid_code'
//    (fail_count goes 0->5) and only the 6th call — right or wrong — sees the lock and
//    returns 'too_many_attempts'. So: 5 wrong guesses to arm the lock, then a 6th call
//    with the CORRECT code to observe what the screen says once it's genuinely locked
//    (recipe §5: "ask for a new one, don't retry" — the screen must say that, not "try again"). ─
{
  const { page, errs } = await openEntrar();
  const email = freshEmail('lockout');
  insertParticipant(email);
  await requestCode(page, email);
  let lastErr = '';
  for (let i = 0; i < 5; i++) {
    await page.fill('.cdx-entrar-code-input', 'ZZZZ');
    await page.click('.cdx-entrar-verify');
    await waitForVerifySettled(page);
    lastErr = await page.$eval('.cdx-entrar-code-error', (el) => el.textContent).catch(() => '');
  }
  note('lockout: message after wrong guess #5 (fail_count now at the cap, not yet checked) -> "' + lastErr + '"');
  // Even the CORRECT code, once locked, must now fail (recipe §2: locking the CODE, not
  // the account — "not even the correct code works" until a new one is requested).
  const row = latestOtpRow(email);
  const code = row ? bruteForceCode(row.code_hash) : null;
  ok(!!code, 'lockout: the still-correct code was recovered for the 6th (locked) attempt');
  if (code) {
    await page.fill('.cdx-entrar-code-input', code);
    await page.click('.cdx-entrar-verify');
    await waitForVerifySettled(page);
    const afterLockText = await page.$eval('.cdx-entrar-code-error', (el) => el.textContent).catch(() => '');
    const isGenericFallback = afterLockText.indexOf('Não foi possível entrar') >= 0; // login.error, entryErrorText's default branch
    ok(afterLockText !== '', 'lockout: the CORRECT code is refused once the code is locked -> "' + afterLockText + '"');
    ok(isGenericFallback,
      'lockout: and the message is the GENERIC "could not sign in, try again" fallback, not a too_many_attempts-specific one telling the student to request a new code instead of retrying (entryErrorText has no branch for that reason) -> "' + afterLockText + '"');
  }
  ok(errs.length === 0, 'lockout: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'otp-trilha-lockout');
  await page.close();
}

await browser.close();

// Leave staging D1 as this script found it: every fixture row this run created carries the
// 'otp-check-' prefix + this run's timestamp, so this only ever removes this script's own rows.
try { d1(`DELETE FROM ct_participants WHERE turma_id = 15 AND email LIKE 'otp-check-%-${TS}@pensoia-test.com'`); }
catch (e) { console.log('warn: fixture cleanup failed, remove by hand -> ' + (e && e.message)); }

console.log(fails.length ? '\nFAILED: ' + fails.length : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
