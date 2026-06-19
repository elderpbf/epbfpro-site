// Trilha QR-return contract (Élder 2026-06-19). Reading the in-class QR (?et=) only
// deposits a presence grant silently; it NEVER force-opens a login on its own, and the
// frictionless instant-join is gone. The login opens here only when the turma opted into
// the cadastro prompt (access.enroll_prompt), and then as the magic-link request — email
// is always confirmed by the link. Source assertions: page.js DOM is verified on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const page = read('../trilha/js/page.js');
const modal = read('../trilha/js/student-login-modal.js');
const login = read('../trilha/js/student-login.js');
const i18n = read('../trilha/i18n.js');

test('the QR return claims presence silently and never forces a login on its own', () => {
  assert.match(page, /enrollClaim\(/, 'claims a presence grant on the scan');
  assert.match(page, /setPresence\(/, 'keeps the grant on the device (localStorage)');
  assert.match(page, /access\.enroll_prompt/, 'opens the login only when the turma opted in');
  assert.ok(!/enrollToken:/.test(page), 'never opens the modal in the instant-join enroll mode');
});

test('the login modal + flow have no frictionless enroll/instant-join path', () => {
  assert.ok(!/enrollJoin/.test(modal), 'modal no longer calls the instant join');
  assert.ok(!/login\.enroll_/.test(modal), 'modal no longer renders the enroll-mode copy');
  assert.ok(!/enrollJoin/.test(login), 'the flow exposes no enrollJoin');
});

test('the name field no longer mentions the certificate (no cert talk without certs)', () => {
  const placeholders = (i18n.match(/'login\.name_placeholder':[^\n]*/g) || []).join('\n');
  assert.ok(placeholders.length > 0, 'name_placeholder exists');
  assert.ok(!/certificad|certificate/i.test(placeholders), 'name placeholder is certificate-neutral');
});
