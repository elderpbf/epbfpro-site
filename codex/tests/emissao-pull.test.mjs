// Emissão pulls from the turma (source contract): the issue flow auto-fills the
// certificate fields from the selected turma and flattens its nested ementa into
// the cert module list via the shared js/ementa.js model. Rendered behavior is
// staging-verified (Playwright readback of the auto-filled fields).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const certs = read('../certificates/certificates.js');

test('issue flow imports the shared ementa flattener (not a cross-tab cohorts import)', () => {
  assert.match(certs, /import \{ ementaToCertModules \} from '\.\.\/js\/ementa\.js'/, 'imports from js/ementa.js');
  assert.ok(!certs.includes("from '../cohorts/ementa.js'"), 'does not reach into the cohorts tab');
});

test('issue flow auto-fills the form from the selected turma', () => {
  assert.match(certs, /function _autofillIssueFromTurma/, 'has the auto-fill helper');
  assert.match(certs, /_issueTurma = _issueTurmas\.find/, 'resolves the selected turma');
  assert.match(certs, /if \(_issueTurma\) \{ _autofillIssueFromTurma/, 'calls auto-fill on turma change');
  // pulls each field from the turma
  for (const f of ['turma.course_title', 'turma.hours', 'turma.place', 'turma.meetings', 'turma.format', 'turma.ementa_json']) {
    assert.ok(certs.includes(f), `auto-fill reads ${f}`);
  }
});

test('issue flow freezes the course period from the turma into the snapshot', () => {
  assert.match(certs, /meta\.course_start = _issueTurma\.date_start/, 'captures course_start');
  assert.match(certs, /meta\.course_end = _issueTurma\.date_end/, 'captures course_end');
});

test('issue flow fetches full turmas fresh (the all-turmas cache lacks the new columns)', () => {
  assert.match(certs, /cohortsApi\.listTurmas\(\{ client_slug: slug \}\)/, 'fetches ct_list_turmas for the auto-fill source');
});
