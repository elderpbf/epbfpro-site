// slides-t-shadow.test.mjs, in a file that imports the translator as `t`, the
// identifier `t` is RESERVED: nothing may redeclare it.
//
// Exists because of a bug I put into production myself (commit 11f1061, 2026-07-16,
// while translating the ⚠ badge tooltip): navigator.js did `const t =
// createElement("div")` inside the forEach and called `t("slides.ed_reflow_warn")`
// in the SAME closure. The local `t` shadows the import for the whole scope, so every
// slide with `reflowWarn` turned into "t is not a function" and KILLED the whole
// ruler's render. Not hypothetical: the same class of bug had already bitten
// helpers.js's `imgInner` (renamed to `tf`) hours earlier.
//
// The rule is the CLASS, not the instance: "imported `t`, do not redeclare `t`". A
// test that tried to decide whether `t()` falls INSIDE the shadowed scope would need
// a parser; banning the redeclaration outright is checkable by regex and has no
// costly false negative (the price is renaming a local variable, which is what we
// actually want anyway).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SLIDES = fileURLToPath(new URL('../content/slides/js/', import.meta.url));

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

// The core files that bring in the translator from outside.
function filesImportingT() {
  return walk(SLIDES).filter((f) => {
    const src = fs.readFileSync(f, 'utf8');
    return /^import\s*\{[^}]*\bt\b[^}]*\}\s*from\s*["'][^"']*i18n\.js["']/m.test(src);
  });
}

// Every redeclaration of `t` in a file: declaration (const/let/var), single-argument
// arrow parameter, or a parameter in a list. Returns [{line, text}].
function rebindsOfT(src) {
  const PATTERNS = [
    /\b(?:const|let|var)\s+t\s*[=;,)]/,   // const t = ... / let t;
    /\(\s*t\s*\)\s*=>/,                     // (t) => ...
    /\(\s*t\s*,/,                           // function f(t, ...) / (t, i) => ...
    /,\s*t\s*\)\s*(?:=>|\{)/,               // (a, t) => ... / function f(a, t) {
    /\bfunction\s*\w*\s*\(\s*t\b/,          // function f(t...
  ];
  const out = [];
  src.split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\*)/.test(line)) return;          // comment: the navigator explains the scar
    if (/^\s*import\b/.test(line)) return;           // the `t` import itself
    if (PATTERNS.some((re) => re.test(line))) out.push({ line: i + 1, text: line.trim() });
  });
  return out;
}

test('`t` is never redeclared in a file that imports the translator', () => {
  const offenders = [];
  for (const f of filesImportingT()) {
    for (const hit of rebindsOfT(fs.readFileSync(f, 'utf8'))) {
      offenders.push(`${path.relative(SLIDES, f)}:${hit.line}  ${hit.text}`);
    }
  }
  assert.deepEqual(offenders, [],
    'These shadow the `t` translator. Rename the local (navigator uses `th`, helpers uses `tf`):\n' +
    offenders.join('\n'));
});

test('the test recognizes the REAL case that broke production', () => {
  // The exact snippet from commit 11f1061, so this guard does not become a regex that passes on everything.
  const bug = [
    'import { t } from "../../../../js/i18n.js";',
    'deck.slides.forEach((s, i) => {',
    '  const t = document.createElement("div");',
    '  t.innerHTML = (s.reflowWarn ? `<div title="${t("slides.ed_reflow_warn")}">⚠</div>` : "");',
    '});',
  ].join('\n');
  assert.equal(rebindsOfT(bug).length, 1, 'the `const t = createElement` must be caught');
});

test('the navigator calls t() and does not redeclare t', () => {
  const src = fs.readFileSync(path.join(SLIDES, 'edit/navigator.js'), 'utf8');
  assert.match(src, /t\("slides\.ed_reflow_warn"\)/, 'the ⚠ tooltip stays translated');
  assert.equal(rebindsOfT(src).length, 0, 'no local `t` call in the navigator');
});
