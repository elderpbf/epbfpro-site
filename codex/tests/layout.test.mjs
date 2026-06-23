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
const tokens = read('../css/tokens.css');
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

test('tokens.css is the single token home (codex.css + cohorts.css no longer define --cdx-*)', () => {
  assert.match(tokens, /--cdx-card-sel-bg\s*:/, 'tokens.css defines the --cdx-* tokens');
  assert.ok(!/--cdx-card-sel-bg\s*:/.test(codex), 'codex.css must not redefine the moved tokens');
  assert.ok(!/--cdx-card-sel-bg\s*:/.test(cohorts), 'cohorts.css must not redefine the moved tokens');
});

test('--danger is a themed alias, not a hardcoded fallback', () => {
  assert.match(tokens, /--danger\s*:\s*var\(--error\)/, 'tokens.css defines --danger: var(--error)');
  assert.ok(!/var\(--danger,\s*#/.test(content), 'no var(--danger, #hex) fallback literals remain');
  assert.ok(!/#d33/.test(content), 'the old #d33 literal is gone');
});

test('every owned surface/text/border token has a dark override', () => {
  const light = blockVars(tokens, ':root');
  const dark = new Set(blockVars(tokens, '\\[data-theme="dark"\\]'));
  // Brand accents are intentionally theme-stable; --danger inherits via --error.
  // The cert-status `-ac` accents are likewise theme-stable (fixed brand hues, or
  // var(--success)/var(--error) which theme themselves), so they share the exemption.
  // The intentional-palette accent hues (--acc-*) are theme-stable by contract (the
  // hue is rendered only via the tinted-card pattern, never as text), and the teal
  // ramp's endpoints (--teal-100 highlight, --teal-900 ink) are stable; the mid
  // steps (300/500/700) DO carry dark overrides. All share the exemption.
  const exempt = new Set([
    '--codex-lessons', '--codex-content', '--codex-cohorts', '--codex-questions', '--danger',
    '--cdx-cert-issued-ac', '--cdx-cert-signed-ac', '--cdx-cert-sent-ac', '--cdx-cert-revoked-ac',
    '--teal-100', '--teal-900',
    '--acc-lessons', '--acc-content', '--acc-cohorts', '--acc-questions',
    '--acc-certs', '--acc-drive', '--acc-external', '--acc-tarefas',
  ]);
  const missing = light.filter((v) => !exempt.has(v) && !dark.has(v));
  assert.deepEqual(missing, [], 'tokens missing a [data-theme="dark"] override: ' + missing.join(', '));
});
