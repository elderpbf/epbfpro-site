// Manual "Revelar agora" + persistent host controls. The close-options
// checkboxes (show results / reveal correct answer) and the simulator count
// persist across questions AND sessions (localStorage); a "Revelar agora" button
// reveals + closes the active question on demand (the manual twin of auto-reveal,
// since revealing the correct answer requires closing in the frozen backend).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const src = () => read('../questions/live-host.js');

test('live-host adds a "Mostrar respostas" button that shows results WITHOUT closing', () => {
  const s = src();
  assert.match(s, /data-act=["']reveal-now["']/, 'has the show-responses button');
  assert.match(s, /function _revealNow\s*\(/, 'has the _revealNow handler');
  assert.match(s, /act === ['"]reveal-now['"]\s*\)\s*return _revealNow/, 'click handler routes the button');
  // It SHOWS results live (setVisibility) and must NOT close the question.
  const fn = s.slice(s.indexOf('function _revealNow'));
  assert.match(fn.slice(0, 320), /setVisibility\(\{[^}]*show_results:\s*true/, 'shows results live via setVisibility');
  assert.ok(!/closeQuestion/.test(fn.slice(0, 320)), 'the show-responses button does not close the question');
});

test('close-options checkboxes persist across questions and sessions', () => {
  const s = src();
  assert.match(s, /codex_host_close_opts/, 'persists close-options under a localStorage key');
  assert.match(s, /cdx-chk-show/, 'still has the show-results checkbox');
  assert.match(s, /cdx-chk-reveal/, 'still has the reveal checkbox');
});

test('the simulator count persists too', () => {
  const s = src();
  assert.match(s, /codex_host_sim_n/, 'persists the simulator count under a localStorage key');
});

test('auto-reveal settings already persist (regression guard)', () => {
  const s = src();
  assert.match(s, /codex_host_autoreveal/, 'auto-reveal prefs persist');
});

test('Revelar agora i18n key exists in BOTH dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  assert.ok('questions.host_reveal_now' in pt, 'pt has host_reveal_now');
  assert.ok('questions.host_reveal_now' in en, 'en has host_reveal_now');
});
