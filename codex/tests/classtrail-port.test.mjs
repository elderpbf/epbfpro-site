// codex/css/classtrail.css — Codex now owns its copy of the ClassTrail widget +
// editor styles (admin type-filter chips, tarefa view, and the deferred shared
// editor/renderer). This pass is a VERBATIM relocation: codex/index.html drops the
// backstage classtrail.css link and loads the Codex copy, so Codex carries no
// backstage CSS dependency for these. No class rename here on purpose, the
// ct-tf/ct-tarefa names are also emitted by widgets the public Trail uses, so the
// cdx- contract rename is a separate, carefully-scoped later pass. Contract: the
// Codex copy is byte-identical to the frozen backstage source, and the admin page
// links the Codex copy, not backstage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Codex's ONE intentional, owner-blessed divergence from the frozen backstage
// source: dark-mode white text routes through --text-on-accent (see css/theme.css
// + js/text-tone.js). The Codex copy is the backstage source with exactly this
// substitution applied — nothing else. The test still catches any OTHER drift.
const applyDarkTextToken = (css) => css.replace(
  /(?<![-\w])(color\s*:\s*)(#fff(?:fff)?\b|white\b|rgba\(\s*255\s*,\s*255\s*,\s*255[^)]*\))/gi,
  '$1var(--text-on-accent, #fff)'
);

test('codex/css/classtrail.css = backstage source + the documented dark-text-token swap', () => {
  const codex = read('../css/classtrail.css');
  const backstage = read('../../backstage/classtrail/css/classtrail.css');
  assert.equal(codex, applyDarkTextToken(backstage),
    'the Codex copy must match the backstage source modulo the --text-on-accent swap, no other drift');
});

test('the Codex copy carries both widgets + the editor (sanity on the verbatim copy)', () => {
  const css = read('../css/classtrail.css');
  assert.match(css, /\.ct-tf-chip\s*\{/, 'type-filter chips present');
  assert.match(css, /\.ct-tarefa-row\s*\{/, 'tarefa view present');
  assert.match(css, /\.ct-editor\b/, 'deferred shared editor present');
});

test('codex/index.html loads the Codex copy and no longer links backstage classtrail.css', () => {
  const html = read('../index.html');
  assert.match(html, /href="css\/classtrail\.css/, 'links the Codex copy');
  assert.ok(!/backstage\/classtrail\/css\/classtrail\.css/.test(html), 'no backstage classtrail.css link');
});

test('the relocated copy has no relative url()/@import that the move would break', () => {
  const css = read('../css/classtrail.css');
  assert.ok(!/url\(\s*['"]?\.\.?\//.test(css), 'no relative url() refs');
  assert.ok(!/@import/.test(css), 'no @import');
});
