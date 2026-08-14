// js/aula-reminder-prompt.js (track-55) — the question asked when a class is saved too late for
// the daily sweep to reach it.
//
// What these pin is the SAFETY of the flow, not a snapshot. Before this, saving an aula less than
// 24h out mailed the whole turma with the screen saying nothing. So: the save asks instead of
// sending, the dialog states what refusing costs, and exactly one module is allowed to fire the
// send action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shouldAsk, reachText } from '../js/aula-reminder-prompt.js';
import pt from '../i18n/pt.js';
import en from '../i18n/en.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const src = read('../js/aula-reminder-prompt.js');
const cohortsJs = read('../cohorts/cohorts.js');
const releasesJs = read('../content/releases.js');
const facadeJs = read('../js/codex-api.js');

const preview = (o = {}) => Object.assign({
  imminent: true, aula_id: 7, aula_number: 3, scheduled_for: '2026-08-14',
  start_hour: '19:00', today: false, recipients: 13, email: 13, push: 4,
}, o);

test('a preview that is not imminent asks nothing', () => {
  assert.equal(shouldAsk(null), false);
  assert.equal(shouldAsk(undefined), false);
  assert.equal(shouldAsk({ imminent: false, reason: 'not-imminent' }), false);
  assert.equal(shouldAsk({ imminent: false, reason: 'already-sent' }), false);
  assert.equal(shouldAsk({ imminent: false, reason: 'no-recipients' }), false);
});

test('imminent without an aula_id is not askable: there would be nothing to send', () => {
  assert.equal(shouldAsk({ imminent: true }), false);
  assert.equal(shouldAsk(preview()), true);
});

test('the reach reads as a sentence the admin can authorize', () => {
  assert.equal(reachText(preview()), '13 e-mails e 4 push');
  assert.equal(reachText({ email: 1, push: 0 }), '1 e-mail');
  assert.equal(reachText({ email: 0, push: 4 }), '4 push');
});

test('no reachable channel produces no reach line at all, instead of "0 e-mails"', () => {
  assert.equal(reachText({ email: 0, push: 0 }), '');
  assert.equal(reachText({}), '');
  assert.equal(reachText(null), '');
});

// ── the dialog ────────────────────────────────────────────────────────────────────────
// Élder 2026-07-29: it must say "less than 24 hours" (the class can be TODAY, so "tomorrow"
// would be a lie), and it must name the consequence of refusing.

test('the question names the consequence of NO, in both languages', () => {
  assert.match(src, /reminder\.ask_consequence/);
  assert.match(pt['reminder.ask_consequence'], /ninguém será avisado/i);
  assert.match(en['reminder.ask_consequence'], /nobody will be warned/i);
});

test('the wording talks about 24 hours, never only about "tomorrow"', () => {
  assert.match(pt['reminder.ask_what'], /24 horas/);
  assert.match(en['reminder.ask_what'], /24 hours/);
});

test('both dictionaries carry every reminder key, with no orphan on either side', () => {
  const keys = (d) => Object.keys(d).filter((k) => k.startsWith('reminder.')).sort();
  assert.deepEqual(keys(pt), keys(en));
  assert.ok(keys(pt).length >= 15, 'the reminder family is present');
  for (const k of keys(pt)) {
    assert.ok(src.includes(k), `${k} is actually used by the module (no dead key)`);
  }
});

test('clicking beside the box cannot answer the question', () => {
  // A stray click would be an implicit "no" to a question whose "no" is permanent silence.
  assert.match(src, /disableBackdropClose:\s*true/);
});

test('the send is reported, and a refusal by the Worker is not swallowed', () => {
  assert.match(src, /notice\.warn\(/, 'a refused send warns');
  assert.match(src, /notice\.internal\(/, 'a thrown error reaches the debug pill');
  assert.match(src, /toast\.ok\(/, 'a completed send confirms with its reach');
});

// ── one owner ─────────────────────────────────────────────────────────────────────────

test('the facade exposes the send, and ONLY this module fires it', () => {
  assert.match(facadeJs, /sendAulaReminder:\s*\(p\)\s*=>\s*call\('ct_send_aula_reminder'/);
  assert.match(src, /api\.sendAulaReminder\(/);
  // A second call site would be a second dialog, and eventually a second set of rules about
  // when a turma gets mailed. The screens ask; this module sends.
  for (const [name, js] of Object.entries({ 'cohorts.js': cohortsJs, 'releases.js': releasesJs })) {
    assert.ok(!/sendAulaReminder\(/.test(js), `${name} does not send directly`);
    assert.match(js, /promptAulaReminder\(/, `${name} asks through the shared module`);
  }
});

test('every path that saves an aula passes the reminder on', () => {
  // Two in Cohorts (the Dados editor, "marcar como ocorrida") and one in Releases. A save that
  // drops `reminder` is a class nobody will ever hear about, with nothing on screen to say so.
  assert.equal((cohortsJs.match(/promptAulaReminder\(/g) || []).length, 2);
  assert.equal((releasesJs.match(/promptAulaReminder\(/g) || []).length, 1);
});

test('module source rules: facade only, i18n, cdx- classes, no inline handler, no em dash', () => {
  assert.ok(!/\bcallWorker\s*\(/.test(src));
  assert.match(src, /from\s+['"]\.\/i18n\.js['"]/);
  assert.match(src, /from\s+['"]\.\/codex-api\.js['"]/);
  assert.match(src, /cdx-/);
  assert.ok(!/onclick\s*=/.test(src));
  assert.ok(!/—/.test(src));
});
