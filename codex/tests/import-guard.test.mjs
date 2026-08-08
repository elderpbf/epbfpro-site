// Guard: a symbol from a SHARED MODULE used without being imported.
//
// It exists because of a real near-miss (Élder 2026-07-16). In a merge, one session removed the
// `import { glyphSvg }` from wall.js while ANOTHER added a USE of glyphSvg (in the ICONS). Different
// lines, so git did not flag a conflict and merged silently, but the module ended up CALLING
// glyphSvg without importing it. The test passed on the working tree (which I had already fixed by
// hand) and the COMMIT would have been broken. This is the "semantic conflict": the text does not
// overlap, the meaning does, and git only sees text. This guard fails loudly when that happens, on
// any merge, even the "clean" one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CODEX = fileURLToPath(new URL('..', import.meta.url)); // .../codex/
const GLYPHS = path.join(CODEX, 'js', 'glyphs.js');

// PURE. Strips comments (block and line) so the call search never matches inside them.
// The `[^:]` before `//` avoids eating the `//` of a URL (http://...).
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// PURE. The LOCAL names that the file's imports bring in. `{ a, b as c }` -> {a, c};
// default and `* as ns` too. This is the "have" set the call is checked against.
function importedNames(src) {
  const names = new Set();
  const re = /import\s*(?:([\w$]+)\s*,?\s*)?(?:\{([^}]*)\})?\s*(?:\*\s*as\s*([\w$]+))?\s*from/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1]) names.add(m[1]);
    if (m[3]) names.add(m[3]);
    if (m[2]) for (const part of m[2].split(',')) {
      const p = part.trim();
      if (!p) continue;
      const as = p.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  return names;
}

// PURE. Names declared in the file itself, so it does not flag a helper the file defines itself.
function declaredNames(code) {
  const names = new Set();
  for (const m of code.matchAll(/\b(?:function|const|let|var|class)\s+([\w$]+)/g)) names.add(m[1]);
  return names;
}

// PURE. The core: of the `guarded` names, which are CALLED (`name(`) without being imported or
// declared. The lookbehind `(?<![.\w$])` requires the call to be "bare", it discards `g.glyphSvg(`
// (a method on an object, which is NOT the imported helper) and `xglyphSvg(`. Without this, an
// object with a method of the same name becomes a false positive (that is what app-card.js exposed:
// it uses glyphs through a `g` object).
function unimportedHelpers(src, guarded) {
  const code = stripComments(src);
  const have = new Set([...importedNames(src), ...declaredNames(code)]);
  return guarded.filter((name) => new RegExp('(?<![.\\w$])' + name + '\\s*\\(').test(code) && !have.has(name));
}

// The guarded set: the FUNCTIONS exported by js/glyphs.js (glyphSvg and its siblings). Derived from
// the file so it never goes stale: whoever exports a new function there gets the guard for free.
// glyphSvg was the one that broke; the siblings carry the same risk (a distinct call name, coming
// from a shared module).
function guardedHelpers() {
  return [...fs.readFileSync(GLYPHS, 'utf8').matchAll(/export\s+function\s+([\w$]+)/g)].map((m) => m[1]);
}

function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'tests' && e.name !== 'node_modules') out.push(...sourceFiles(p)); }
    else if (e.name.endsWith('.js') && p !== GLYPHS) out.push(p);
  }
  return out;
}

// ── the logic CATCHES the bug (synthetic cases: the guard only counts if it fails when it should) ──

test('flags a helper called without an import', () => {
  assert.deepEqual(unimportedHelpers("const I = { a: glyphSvg('book') };", ['glyphSvg']), ['glyphSvg']);
});

test('passes when the import is there', () => {
  const src = "import { glyphSvg } from '../../js/glyphs.js';\nconst I = { a: glyphSvg('book') };";
  assert.deepEqual(unimportedHelpers(src, ['glyphSvg']), []);
});

test('does not match a call that is inside a comment', () => {
  assert.deepEqual(unimportedHelpers("// glyphSvg('x') is just text here\nconst y = 1;", ['glyphSvg']), []);
});

test('respects aliasing: `glyphSvg as g` + `g(` is not a call to glyphSvg', () => {
  const src = "import { glyphSvg as g } from '../../js/glyphs.js';\nconst z = g('book');";
  assert.deepEqual(unimportedHelpers(src, ['glyphSvg']), []);
});

test('covers ALL exported functions, not just glyphSvg', () => {
  assert.deepEqual(unimportedHelpers("const h = iconHtml(x);", ['iconHtml']), ['iconHtml']);
});

// A METHOD call on an object (`g.glyphSvg(...)`) is not the imported helper: using glyphs through an
// object is a legitimate pattern (app-card.js does this). The guard must not flag it.
test('does not flag a method call `obj.glyphSvg(`', () => {
  assert.deepEqual(unimportedHelpers("const s = g.glyphSvg(key);", ['glyphSvg']), []);
  assert.deepEqual(unimportedHelpers("if (g.hasGlyph(k)) {}", ['hasGlyph']), []);
});

// ── the real tree is clean (this is what would run on every merge) ──

test('no codex module calls a glyphs.js helper without importing it', () => {
  const guarded = guardedHelpers();
  assert.ok(guarded.includes('glyphSvg'), 'the guard covers glyphSvg (the original offender)');
  const offenders = [];
  for (const file of sourceFiles(CODEX)) {
    const miss = unimportedHelpers(fs.readFileSync(file, 'utf8'), guarded);
    if (miss.length) offenders.push(path.relative(CODEX, file) + ' -> ' + miss.join(', '));
  }
  assert.deepEqual(offenders, [], 'helper(s) used without an import:\n' + offenders.join('\n'));
});
