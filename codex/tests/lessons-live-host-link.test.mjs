// The Lessons live card now opens the Codex live host (Questions ▸ Sessions), not
// the legacy ClassPulse host page. A live session deep-links to its host via
// ?session=<code>; the admin boot forwards that param into ctx.session, and
// sessions.js mount() preselects it (so the host mounts straight away). This was
// the last functional Codex->backstage runtime link. Pinned by source (the live
// host behavior itself is covered by live-host.test.mjs / questions-unmount.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('lessons.js live card links into Codex Questions ▸ Sessions, not backstage classpulse', () => {
  const js = read('../lessons/lessons.js');
  assert.match(js, /\/codex\/\?tab=questions&sub=sessions&session=/, 'live href deep-links the Codex session host');
  assert.match(js, /\/codex\/\?tab=questions&sub=sessions'/, 'no-session href opens the Codex Sessions sub-tab');
  assert.ok(!/backstage\/classpulse/.test(js), 'no /backstage/classpulse link remains');
});

test('sessions.js mount reads the ?session deep-link and preselects it', () => {
  const js = read('../questions/sessions.js');
  assert.match(js, /ctx\s*&&\s*ctx\.session/, 'mount reads ctx.session');
  assert.match(js, /_selectedCode\s*=\s*pre/, 'the deep-linked code is preselected');
});

test('the admin boot forwards ?session into ctx for the questions tab', () => {
  const html = read('../index.html');
  assert.match(html, /tab === 'questions'\)\s*ctx\.session\s*=\s*params\.get\('session'\)/, 'boot sets ctx.session from ?session');
});
