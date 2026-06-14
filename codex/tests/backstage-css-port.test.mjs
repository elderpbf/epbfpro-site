// codex/css/backstage.css — Codex owns its copy of the admin shell chrome
// (bs-app/bs-main/bs-topbar, theme-transition) and the inline login card (bs-auth-*).
// Verbatim relocation: codex/index.html drops the backstage backstage.css link and
// loads the Codex copy, so Codex carries no backstage CSS dependency for the shell.
// No rename here: the bs-auth-* login classes are emitted by auth.js (stays
// backstage), and the cdx- rename of the Codex-emitted shell classes is a separate
// later pass. Contract: byte-identical to the frozen backstage source, and the
// admin page links the Codex copy, not backstage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('codex/css/backstage.css is a verbatim copy of the frozen backstage source', () => {
  const codex = read('../css/backstage.css');
  const backstage = read('../../backstage/css/backstage.css');
  assert.equal(codex, backstage, 'the Codex copy must match the backstage source byte-for-byte');
});

test('the Codex copy carries the shell chrome + the login card (sanity on the copy)', () => {
  const css = read('../css/backstage.css');
  assert.match(css, /\.bs-app\b/, 'bs-app shell present');
  assert.match(css, /\.bs-main\b/, 'bs-main present');
  assert.match(css, /\.bs-topbar\b/, 'bs-topbar present');
  assert.match(css, /\.bs-auth-card\b/, 'inline login card present');
});

test('codex/index.html loads the Codex copy and no longer links backstage backstage.css', () => {
  const html = read('../index.html');
  assert.match(html, /href="css\/backstage\.css/, 'links the Codex copy');
  assert.ok(!/\.\.\/backstage\/css\/backstage\.css/.test(html), 'no backstage backstage.css link');
});

test('the relocated copy has no relative url()/@import that the move would break', () => {
  const css = read('../css/backstage.css');
  assert.ok(!/url\(\s*['"]?\.\.?\//.test(css), 'no relative url() refs');
  assert.ok(!/@import/.test(css), 'no @import');
});
