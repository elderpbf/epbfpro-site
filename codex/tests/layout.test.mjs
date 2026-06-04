// layout.test.mjs — guards the Codex token contract consolidated in the CSS
// consistency pass: codex.css is the SINGLE token home, every owned
// surface/text/border token carries a [data-theme="dark"] override, --danger is
// a themed alias (no hardcoded fallback hex), and the token block was not
// duplicated back into cohorts.css. Source-text checks; the rendered look is
// staging-verified, per the project test philosophy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const codex = read('../css/codex.css');
const cohorts = read('../cohorts/cohorts.css');
const content = read('../content/content.css');

// Concatenate the bodies of every block whose selector matches `header`. Token
// blocks are flat (no nested braces), so a non-greedy `{ ... }` grab suffices.
function blockVars(src, header) {
  const re = new RegExp(header + '\\s*\\{([^}]*)\\}', 'g');
  const vars = [];
  let m;
  while ((m = re.exec(src))) {
    for (const v of m[1].matchAll(/(--[\w-]+)\s*:/g)) vars.push(v[1]);
  }
  return vars;
}

test('codex.css is the single token home (cohorts.css no longer defines --cdx-*)', () => {
  assert.match(codex, /--cdx-card-sel-bg\s*:/, 'codex.css defines the --cdx-* tokens');
  assert.ok(!/--cdx-card-sel-bg\s*:/.test(cohorts), 'cohorts.css must not redefine the moved tokens');
});

test('--danger is a themed alias, not a hardcoded fallback', () => {
  assert.match(codex, /--danger\s*:\s*var\(--error\)/, 'codex.css defines --danger: var(--error)');
  assert.ok(!/var\(--danger,\s*#/.test(content), 'no var(--danger, #hex) fallback literals remain');
  assert.ok(!/#d33/.test(content), 'the old #d33 literal is gone');
});

test('every owned surface/text/border token in codex.css has a dark override', () => {
  const light = blockVars(codex, ':root');
  const dark = new Set(blockVars(codex, '\\[data-theme="dark"\\]'));
  // Brand accents are intentionally theme-stable; --danger inherits via --error.
  const exempt = new Set([
    '--codex-lessons', '--codex-content', '--codex-cohorts', '--codex-questions', '--danger',
  ]);
  const missing = light.filter((v) => !exempt.has(v) && !dark.has(v));
  assert.deepEqual(missing, [], 'tokens missing a [data-theme="dark"] override: ' + missing.join(', '));
});
