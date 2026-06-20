// codex/css/classvault.css — Codex owns its copy of the ClassVault styles it still
// uses (the cv-sm sub-module list and a few cv-* leaves; cv-renderer/cv-slides are
// also covered by drive-viewer.css, but cv-sm is classvault-only). Verbatim
// relocation: codex/index.html drops the backstage classvault.css link, its LAST
// backstage CSS dependency, and loads the Codex copy. No rename here (a dead-rule
// trim + cdx- pass comes later). Contract: byte-identical to the frozen backstage
// source, the admin page links the Codex copy, and NO backstage CSS link remains.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Codex's ONE intentional, owner-blessed divergence from the frozen backstage
// source: dark-mode white text routes through --text-on-accent (the dark-mode
// text-tone token; see css/theme.css + js/text-tone.js). The Codex copy is the
// backstage source with exactly this substitution applied — nothing else. The
// test still catches any OTHER drift.
const applyDarkTextToken = (css) => css.replace(
  /(?<![-\w])(color\s*:\s*)(#fff(?:fff)?\b|white\b|rgba\(\s*255\s*,\s*255\s*,\s*255[^)]*\))/gi,
  '$1var(--text-on-accent, #fff)'
);

test('codex/css/classvault.css = backstage source + the documented dark-text-token swap', () => {
  const codex = read('../css/classvault.css');
  const backstage = read('../../backstage/_archive/classvault/css/classvault.css');
  assert.equal(codex, applyDarkTextToken(backstage),
    'the Codex copy must match the backstage source modulo the --text-on-accent swap, no other drift');
});

test('the Codex copy carries the classvault-only live family (sanity on the copy)', () => {
  const css = read('../css/classvault.css');
  assert.match(css, /\.cv-sm\b/, 'cv-sm sub-module list present');
  assert.match(css, /\.cv-sm-chip\b/, 'cv-sm chips present');
});

test('codex/index.html loads the Codex copy and no longer links backstage classvault.css', () => {
  const html = read('../index.html');
  assert.match(html, /href="css\/classvault\.css/, 'links the Codex copy');
  assert.ok(!/backstage\/classvault\/css\/classvault\.css/.test(html), 'no backstage classvault.css link');
});

test('milestone: codex/index.html has NO backstage CSS <link> left (CSS fully de-backstaged)', () => {
  const html = read('../index.html');
  assert.ok(!/<link rel="stylesheet" href="\.\.\/backstage\/[^"]*\.css/.test(html),
    'a backstage stylesheet link still remains');
});

test('the relocated copy has no relative url()/@import that the move would break', () => {
  const css = read('../css/classvault.css');
  assert.ok(!/url\(\s*['"]?\.\.?\//.test(css), 'no relative url() refs');
  assert.ok(!/@import/.test(css), 'no @import');
});
