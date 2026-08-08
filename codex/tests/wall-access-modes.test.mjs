// ONE wall, with a pluggable access mode. This file exists to keep the duplication from coming back.
//
// What happened: `wall-simple.js` was a copy of `wall.js` for cohorts in Emergency mode. A copy
// does not stay still. It silently diverged, on a REAL CLIENT (jfse/magistrados):
//   - it kept drawing the lesson roadmap that Elder had it removed from the wall on 2026-07-11;
//   - it drew the locked screen with the 🚫 emoji instead of the library glyph;
//   - it knew 3 error codes against the real wall's 6.
// In other words: Elder's decisions only ever reached one of the two. Elder 2026-07-15: "nao
// deveria ter sido feito a duplicacao de codigo, isso foi um erro. Elas deveriam todas acessar o
// mesmo codigo, so que existem algumas modificacoes de acesso. Isso deveria ser plugavel."
//
// The rule these tests pin down: a new way to get in is an entry in ACCESS_MODES, NEVER a
// second wall.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { accessModeFor } from '../trilha/js/wall.js';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => fs.readFileSync(path(rel), 'utf8');
const exists = (rel) => fs.existsSync(path(rel));

const wall = () => read('../trilha/js/wall.js');
const otp = () => read('../trilha/js/wall-access-otp.js');
const emerg = () => read('../trilha/js/wall-access-emergency.js');
const page = () => read('../trilha/js/page.js');

// Just the CODE, no comments. Without this, the emoji test would flag its own explanation of
// why the emoji left ("desenhava com o emoji 🚫") as if the emoji were back.
const code = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

// ── The duplication is dead and does not come back ──────────────────────────────────

test('the second wall no longer exists', () => {
  assert.ok(!exists('../trilha/js/wall-simple.js'), 'wall-simple.js was absorbed into wall.js');
  assert.ok(!/wall-simple|renderSimpleWall/.test(page()), 'page.js no longer knows about a second wall');
});

// The heart of it: page.js used to choose BETWEEN TWO RENDERERS. Now it calls just one, and the
// wall itself decides the door. If it branches here again, the duplication is coming back.
test('page.js calls ONE wall, without choosing between two', () => {
  const p = page();
  assert.ok(/renderWall\(root\)/.test(p), 'renderWall is the only wall');
  assert.equal((p.match(/import \{ renderWall \} from '\.\/wall\.js'/g) || []).length, 1);
  assert.ok(!/access \|\| \{\}\)\.simple_enroll\) render/.test(p),
    'page.js does not branch on simple_enroll: that is the wall\'s decision');
});

// benefitsHtml used to be BYTE FOR BYTE identical in both files. One copy, forever.
test('benefitsHtml exists in ONE place only', () => {
  const owners = ['../trilha/js/wall.js', '../trilha/js/wall-access-otp.js', '../trilha/js/wall-access-emergency.js']
    .filter((f) => /function benefitsHtml/.test(read(f)));
  assert.deepEqual(owners, ['../trilha/js/wall.js'], 'only the wall draws the benefits');
});

test('the benefit ICONS also live in one place only', () => {
  assert.ok(/const ICONS = \{/.test(wall()), 'the wall has the icons');
  assert.ok(!/const ICONS = \{/.test(emerg()), 'the emergency mode carries no copy of the icons');
});

// The certificate benefit only appears if the cohort REALLY issues a certificate
// (the dossier's certificates_enabled toggle, delivered on the turma view). It used to
// always show up with the "if enabled" tag, promising something the cohort might never give.
test('the certificate benefit is gated on the turma\'s certificates_enabled', () => {
  const src = wall();
  assert.ok(/certificates_enabled/.test(src), 'the wall reads the certificates_enabled flag');
  assert.ok(/certOn \? bene\('cert'/.test(src), 'the cert card only enters when certOn');
  assert.ok(!/bene_cert_tag/.test(src), 'the "if enabled" tag is gone (now a real condition, not a hedge)');
});

// The WhatsApp group button is a benefit for those who HAVE access. A second layer over the
// backend (which already omits whatsapp_url on the gated wall). The gate is `!gated ||
// approved`, which keeps the button on OPEN cohorts (status 'anonymous', no wall) and only
// hides it on the gated anonymous/pending wall. A naive gate on 'approved' alone would break
// open cohorts.
test('the WhatsApp group button only appears with access (does not leak on the gated wall)', () => {
  const src = page();
  assert.ok(/!access\.gated \|\| access\.status === 'approved'/.test(src), 'gated by access, preserving open cohorts');
  assert.ok(/turma\.whatsapp_url && hasAccess/.test(src), 'the button requires both a url AND access');
});

// ── The mode is a plugin, and only owns the card ──────────────────────────────────

test('ACCESS_MODES is the table: adding a door is an entry, not a wall', () => {
  const w = wall();
  assert.match(w, /const ACCESS_MODES = \{/);
  assert.match(w, /otp:\s*mountOtpCard/);
  assert.match(w, /emergency:\s*mountEmergencyCard/);
});

test('each mode mounts the CARD, and only the card', () => {
  assert.match(otp(), /export function mountOtpCard\(cardEl\)/);
  assert.match(emerg(), /export function mountEmergencyCard\(cardEl\)/);
  // The shell, the notices, and the benefits belong to the wall. A mode that mounts its own
  // section is a wall in disguise, which is exactly how wall-simple started.
  for (const [name, src] of [['otp', otp()], ['emergency', emerg()]]) {
    assert.ok(!/mountNoticeSection|cdx-en-grid|cdx-trilha-tabs/.test(src),
      name + ' does not mount its own shell');
  }
});

test('the wall falls back to OTP when the mode is unknown', () => {
  assert.match(wall(), /ACCESS_MODES\[accessModeFor\(.*\)\] \|\| ACCESS_MODES\.otp/);
});

// ── accessModeFor: pure, and the frontend does not re-derive the deadline ─────────────────────

test('accessModeFor: simple_enroll sends to emergency, everything else to OTP', () => {
  assert.equal(accessModeFor({ simple_enroll: true }), 'emergency');
  assert.equal(accessModeFor({ simple_enroll: false }), 'otp');
  assert.equal(accessModeFor({}), 'otp');
  assert.equal(accessModeFor(null), 'otp');
  assert.equal(accessModeFor(undefined), 'otp');
});

// Who decides whether the emergency window expired is the WORKER (isSimpleEnrollOpen). If the
// frontend recomputed the deadline, the two calculations would diverge and the wall would paint
// a form the worker rejects.
test('the frontend does NOT recompute the 12h deadline: it reads what the view sent', () => {
  const w = wall();
  assert.ok(!/simple_enroll_until|Date\.now\(\).*12|43200/.test(w),
    'the deadline is the worker\'s math, the frontend just reads access.simple_enroll');
});

// ── The divergences the copy had accumulated ──────────────────────────────

// The copy drew 🚫 by hand; the wall uses the glyph library. An emoji instead of a glyph is the
// classic symptom of code that was born copied.
test('no emoji: the locked screen uses the glyph library', () => {
  for (const [name, src] of [['wall', wall()], ['otp', otp()], ['emergency', emerg()]]) {
    assert.ok(!/🚫|⏰|✅|❌/u.test(code(src)), name + ' does not draw status with an emoji');
  }
  assert.match(wall(), /glyph: 'ban'/, 'locked uses the ban glyph');
  assert.match(wall(), /glyph: 'clock'/, 'pending uses the clock glyph');
});

// The roadmap left the wall by Elder's decision (2026-07-11) and the copy kept drawing it. Now
// that there is only one wall, the decision applies to everyone by construction.
test('the roadmap does not come back through the emergency side', () => {
  for (const [name, src] of [['wall', wall()], ['emergency', emerg()]]) {
    assert.ok(!/function roadmapHtml|cdx-en-road/.test(src), name + ' does not draw a roadmap');
  }
});

// Support ("Precisa de ajuda?") comes from the FOOTER (#cdx-tr-support-footer), mounted by
// renderHero on EVERY trilha page, wall included. So it already appears on the registration
// screen without the wall doing anything. Adding a second one on the wall DUPLICATES it on
// screen (Elder 2026-07-16: "Precisa de ajuda? esta duplicado"). The wall-simple copy mounted
// its own AND got the footer too: it silently showed two.
test('support comes from the footer, not duplicated on the wall', () => {
  assert.match(page(), /mountEntry\(root\.querySelector\('#cdx-tr-support-footer'\)/,
    'the footer (renderHero) mounts support on every page');
  const reg = wall().slice(wall().indexOf('function renderRegister'));
  assert.ok(!/entryHtml/.test(reg), 'renderRegister does NOT mount a second support entry');
  // Nor does the mode: if it lived in the mode, every new door would have to remember to
  // repeat it, which is exactly how the duplication started.
  for (const [name, src] of [['otp', otp()], ['emergency', emerg()]]) {
    assert.ok(!/entryHtml/.test(src), name + ' does not carry a copy of the support box');
  }
});

// ── Emergency behavior that must survive the refactor ─────────

test('emergency mode is still email-first (name only for a new address)', () => {
  const e = emerg();
  assert.match(e, /cdx-en-namefield hidden/, 'the name field is born hidden');
  assert.match(e, /simpleEnroll\(\{[^}]*ask_name:\s*true/, 'sends ask_name');
  assert.match(e, /res\.needs_name/, 'reveals the name when the worker asks for it');
  assert.match(e, /classList\.remove\('hidden'\)/);
});

test('emergency mode only stamps consent when a name was typed', () => {
  assert.match(emerg(), /res\.needs_profile && name/);
});

// The facade, never a raw callWorker (project rule).
test('both modes talk to the backend through the facade', () => {
  assert.match(emerg(), /from '\.\/api\.js'/);
  assert.match(otp(), /from '\.\/student-login\.js'/);
  for (const [name, src] of [['otp', otp()], ['emergency', emerg()]]) {
    assert.ok(!/callWorker\(/.test(src), name + ' does not call callWorker directly');
  }
});

// The mode that starts the timer is the mode that clears it. Leaving the poll in the wall was a
// leak between layers.
test('the OTP poll lives inside the OTP mode', () => {
  assert.match(otp(), /const clearPoll = \(\) =>/);
  assert.ok(!/POLL_CADENCE|clearPoll/.test(wall()), 'the wall carries no timer for any mode');
});
