// Module-hygiene / anti-duplication guard for the Codex static-site project.
// Asserts structural rules: no orphaned shared modules, no duplicate-named
// modules outside the sealed Slides boundary, intact Slides inbound and
// outbound boundaries, and no un-allowlisted cross-tab imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolve a path relative to this test file (which lives in tests/).
const read = (rel) => {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  assert.ok(fs.existsSync(p), `${rel} exists`);
  return fs.readFileSync(p, 'utf8');
};

// Root of the codex project (one level above tests/).
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// Walk the tree recursively; skip desktop.ini and non-.js files (unless
// the caller passes a custom filter). Returns posix-style relative paths
// from ROOT (e.g. "content/items.js").
function walkJs(dir, files) {
  if (!files) files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'desktop.ini') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJs(full, files);
    } else if (entry.name.endsWith('.js')) {
      // Store as a forward-slash relative path from ROOT.
      files.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return files;
}

// Extract all static import specifiers (relative paths starting with .) from
// a JS source string.
function extractImports(src) {
  const re = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
  const results = [];
  let m;
  while ((m = re.exec(src)) !== null) results.push(m[1]);
  return results;
}

// Resolve a relative import specifier against the directory of the importing
// file. Both arguments are posix-style relative paths from ROOT.
function resolveImport(fromFile, importSpec) {
  const dir = fromFile.substring(0, fromFile.lastIndexOf('/'));
  return path.posix.normalize(dir + '/' + importSpec);
}

// The only sanctioned cross-tab import today.
const ALLOWED_CROSS_TAB = ['../content/item-form.js'];

// Sealed vendored prefix: everything under this path is excluded from the
// duplicate-name check and treated specially in boundary tests.
const SLIDES_PREFIX = 'content/slides/';

// The sanctioned mount wrapper for the Slides sub-tree (inbound boundary).
const SLIDES_WRAPPER = 'content/slides.js';

// The vendored Slides CORE (the standalone app). Only this sub-tree is held to
// the strict outbound rule. The Codex integration glue (the content/slides.js
// wrapper and content/slides/adapters/) is the seam to the backend and is
// allowed to use the js/codex-api.js facade, so it is NOT part of the core.
const SLIDES_CORE_PREFIX = 'content/slides/js/';

// Tab directories.
const TABS = ['cohorts', 'content', 'questions', 'lessons'];

// All .js files in the tree.
const allJs = walkJs(ROOT);

// index.html, which counts as a module consumer (imports codex-topbar.js).
const indexHtml = read('../index.html');

// ── Test 1: no orphaned shared module ────────────────────────────────────────
// For each js/*.js file, its basename must appear in at least one import
// statement somewhere across all other .js files PLUS index.html.
test('no orphaned shared module', () => {
  const sharedDir = path.join(ROOT, 'js');
  const sharedFiles = fs.readdirSync(sharedDir)
    .filter((f) => f.endsWith('.js') && f !== 'desktop.ini');

  for (const mod of sharedFiles) {
    const ownPath = 'js/' + mod;
    // Build a combined corpus of all other JS sources plus index.html.
    let found = false;
    for (const f of allJs) {
      if (f === ownPath) continue; // skip the module's own file
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      const imports = extractImports(src);
      if (imports.some((imp) => resolveImport(f, imp) === ownPath.replace(/\.js$/, '') || resolveImport(f, imp) === ownPath)) {
        found = true;
        break;
      }
    }
    // Also check index.html (uses string-match since it is not a .js file).
    if (!found && indexHtml.includes(mod)) found = true;
    assert.ok(found, `shared module js/${mod} is imported by at least one consumer`);
  }
});

// ── Test 2: no duplicate-named module outside the Slides boundary ────────────
// Gather basenames of all *.js files EXCLUDING anything under content/slides/.
// No basename may appear more than once.
test('no duplicate-named module outside the Slides boundary', () => {
  const nonSlidesFiles = allJs.filter((f) => !f.startsWith(SLIDES_PREFIX));
  const counts = Object.create(null);
  for (const f of nonSlidesFiles) {
    const base = f.substring(f.lastIndexOf('/') + 1);
    counts[base] = (counts[base] || 0) + 1;
  }
  for (const [base, count] of Object.entries(counts)) {
    assert.ok(count === 1, `basename "${base}" appears ${count} times outside content/slides/ (must be unique)`);
  }
});

// ── Test 3: Slides boundary intact inbound ───────────────────────────────────
// No file OUTSIDE content/slides/ statically imports a path that resolves
// inside content/slides/js/, except the sanctioned mount wrapper content/slides.js.
test('Slides boundary intact inbound', () => {
  const outsideFiles = allJs.filter((f) => !f.startsWith(SLIDES_PREFIX));
  for (const f of outsideFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const imports = extractImports(src);
    for (const imp of imports) {
      const resolved = resolveImport(f, imp);
      if (resolved.startsWith('content/slides/js/')) {
        assert.ok(
          f === SLIDES_WRAPPER,
          `"${f}" imports "${imp}" (resolves to "${resolved}") inside content/slides/js/; only ${SLIDES_WRAPPER} may do this`,
        );
      }
    }
  }
});

// ── Test 4: Slides boundary intact outbound (vendored core) ──────────────────
// The VENDORED CORE (content/slides/js/) is the standalone app: any import whose
// resolved path escapes the content/slides/ tree must be "js/i18n.js" (t()) and
// nothing else. The Codex integration glue (content/slides.js wrapper +
// content/slides/adapters/) is NOT part of the sealed core; it is the seam to the
// backend and may use the js/codex-api.js facade, so it is exempt from this rule.
test('Slides boundary intact outbound (vendored core)', () => {
  const coreFiles = allJs.filter((f) => f.startsWith(SLIDES_CORE_PREFIX));
  for (const f of coreFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const imports = extractImports(src);
    for (const imp of imports) {
      const resolved = resolveImport(f, imp);
      if (!resolved.startsWith(SLIDES_PREFIX)) {
        // This import escapes the slides tree; the core may only reach js/i18n.js.
        assert.ok(
          resolved === 'js/i18n.js',
          `"${f}" imports "${imp}" which escapes content/slides/ to "${resolved}"; the vendored core may only reach js/i18n.js (use the codexStore adapter for backend access)`,
        );
      }
    }
  }
});

// ── Test 5: no un-allowlisted cross-tab import ───────────────────────────────
// For each module under cohorts/ | content/ | questions/ | lessons/ (excluding
// content/slides/), any import of the form ../<siblingTab>/... where sibling is
// one of the four tabs must appear in ALLOWED_CROSS_TAB.
test('no un-allowlisted cross-tab import', () => {
  const tabRe = new RegExp('^\\.\\.\\./(' + TABS.join('|') + ')/');
  const tabFiles = allJs.filter((f) => {
    if (f.startsWith(SLIDES_PREFIX)) return false;
    return TABS.some((t) => f.startsWith(t + '/'));
  });
  for (const f of tabFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const imports = extractImports(src);
    for (const imp of imports) {
      if (tabRe.test(imp)) {
        assert.ok(
          ALLOWED_CROSS_TAB.includes(imp),
          `"${f}" has un-allowlisted cross-tab import "${imp}"; add it to ALLOWED_CROSS_TAB if intentional`,
        );
      }
    }
  }
});
