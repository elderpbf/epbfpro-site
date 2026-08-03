// Session ↔ turma coupling on the front (Élder 2026-07-04):
//   B. the Questions session card shows "Cliente · Turma" (from list_sessions' join).
//   A. deleting a turma offers to delete its auto-created session; deleting a turma-linked
//      session warns first. Source-regex + i18n-parity checks (the house style for these
//      DOM-light modules, matching sessions-module.test.mjs / cohorts-turma-lifecycle.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const read = (rel) => fs.readFileSync(path(rel), 'utf8');

const sessionsSrc = read('../questions/sessions.js');
const cohortsSrc = read('../cohorts/cohorts.js');

test('B: session card labels a turma-linked session "Cliente · Turma", avulsa keeps its title', () => {
  assert.match(sessionsSrc, /s\.client_name\s*&&\s*s\.turma_name/, 'card branches on the joined names');
  assert.match(sessionsSrc, /client_name[\s\S]{0,40}·[\s\S]{0,40}turma_name/, 'linked card renders Cliente · Turma');
  assert.match(sessionsSrc, /s\.title\s*\|\|\s*t\('questions\.sessions_untitled'\)/, 'avulsa falls back to its own title');
});

test('A: deleting a turma-linked session warns before deleting', () => {
  assert.match(sessionsSrc, /turma_name[\s\S]{0,160}window\.confirm/, 'guards the delete on a linked turma');
  assert.match(sessionsSrc, /questions\.sessions_delete_linked_warn/, 'uses the linked-turma warning key');
});

test('A: deleting a turma offers to delete its linked session too', () => {
  const del = cohortsSrc.match(/function _deleteTurma\([\s\S]*?\n}/);
  assert.ok(del, '_deleteTurma defined');
  assert.match(del[0], /cdx-del-session-opt/, 'renders the delete-session checkbox');
  assert.match(del[0], /delete_session:/, 'passes delete_session to the facade');
  assert.match(del[0], /cohorts\.delete_turma_session_opt/, 'labels the checkbox via i18n');
});

test('A: the shared delete-confirm modal forwards the extra flags to onConfirm', () => {
  assert.match(cohortsSrc, /opts\.extraHtml\s*\|\|\s*''/, 'injects optional extra HTML');
  assert.match(cohortsSrc, /opts\.onConfirm\(flags\)/, 'passes captured flags to the caller');
});

test('the new i18n keys exist in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  for (const k of ['cohorts.delete_turma_session_opt', 'questions.sessions_delete_linked_warn']) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});

test('creating a turma never sends classpulse_session_id (it would unlink the fresh session)', () => {
  // ct_create_turma mints the session and links it; ct_update_turma_meta reads the KEY'S
  // PRESENCE as the instruction, so sending it as null right after (which the create form
  // did whenever a WhatsApp URL was filled in) wiped the link. Prod hit this on
  // tjse/curso-de-formacao-2026, 2026-08-03.
  assert.match(cohortsSrc, /if \(isEdit\) meta\.classpulse_session_id = cpSession \|\| null;/,
    'the meta key is set on edit only');
  assert.match(cohortsSrc, /const needMeta = isEdit \? metaChanged : !!whatsapp;/,
    'create decides on the WhatsApp field alone');
  assert.ok(!/classpulse_session_id: cpSession \|\| null/.test(cohortsSrc),
    'the unconditional payload key is gone');
});

test('the session select is offered on EDIT only (on create the session does not exist yet)', () => {
  assert.match(cohortsSrc, /\(isEdit\s*\n?\s*\?\s*'<div class="cdx-field"><label>' \+ t\('cohorts\.field_classpulse'\)/,
    'the form renders the select behind isEdit');
  assert.match(cohortsSrc, /cpSessionEl \? cpSessionEl\.value : ''/,
    'save reads the select defensively, since it is absent on create');
});

test('the dossier deps re-render matches the turma by client/slug, not object identity', () => {
  // _loadAll() swaps in a fresh turma object, so an identity check dropped the re-render
  // that fills the course/session selects and the just-created turma showed "Nenhuma".
  assert.match(cohortsSrc, /cur\.client_slug === turma\.client_slug/);
  assert.ok(!/_ensureDossierDeps\(\(\) => \{ if \(_dossierTurma === turma\)/.test(cohortsSrc),
    'the identity comparison is gone');
});

test('no em dashes in the touched module sources', () => {
  assert.ok(!/—/.test(sessionsSrc), 'sessions.js has no em dash');
});
