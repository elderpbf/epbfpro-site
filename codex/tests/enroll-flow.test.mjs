// Trilha QR-return contract (Élder 2026-06-19, updated for direct-access). Reading the
// in-class QR (?et=) always claims a presence grant SILENTLY and never force-opens a login
// on its own. What opens is the turma's choice: direct_access (register + access on the
// spot, no magic link — for the pre-email-provider period) takes precedence, else
// enroll_prompt (the magic-link request). The fixed ?k= link never reaches this path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const page = read('../trilha/js/page.js');
const modal = read('../trilha/js/student-login-modal.js');
const login = read('../trilha/js/student-login.js');
const i18n = read('../trilha/i18n.js');

test('the QR return claims presence silently and opens a login only on an opt-in turma', () => {
  assert.match(page, /enrollClaim\(/, 'claims a presence grant on the scan');
  assert.match(page, /setPresence\(/, 'keeps the grant on the device (localStorage)');
  assert.match(page, /access\.direct_access/, 'direct access opens the instant-join form');
  assert.match(page, /access\.enroll_prompt/, 'else the cadastro prompt opens the magic-link');
  // The enroll (instant-join) mode is reached ONLY via direct_access (enrollToken passed there).
  assert.match(page, /access\.direct_access[\s\S]*enrollToken: et/, 'enrollToken only under direct_access');
});

test('the frictionless direct-access join exists (gated), no magic link', () => {
  assert.match(modal, /enrollJoin/, 'modal calls the instant join in enroll mode');
  assert.match(modal, /login\.enroll_/, 'modal renders the enroll-mode copy');
  assert.match(login, /async enrollJoin\(/, 'the flow exposes enrollJoin');
});

test('the name field no longer mentions the certificate (no cert talk without certs)', () => {
  const placeholders = (i18n.match(/'login\.name_placeholder':[^\n]*/g) || []).join('\n');
  assert.ok(placeholders.length > 0, 'name_placeholder exists');
  assert.ok(!/certificad|certificate/i.test(placeholders), 'name placeholder is certificate-neutral');
});
