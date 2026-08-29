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

// Sanctioned cross-tab imports. Each entry is the exact import specifier as it
// appears in the importing file (the relative path the importing module uses).
const ALLOWED_CROSS_TAB = [
  '../content/item-form.js',
  // certificates/certificates.js imports the Slides editor + core directly
  // (it is a sanctioned inbound wrapper alongside content/slides.js).
  '../content/slides/js/app.js',
  '../content/slides/js/core/deck.js',
  '../content/slides/js/ai/aiService.js',
  '../content/slides/adapters/library.js',
  // track-64: the survey's admin tab aggregates its results with the renderer the
  // Questions tab already owns. §3.3 chose the stored `kind` vocabulary (rating |
  // poll | wordcloud | open) precisely so this is an import and not a second chart
  // library; the alternative was copying the average-plus-bars drawing, which is
  // the drift this suite exists to stop.
  '../questions/question-render.js',
];

// Sealed vendored prefix: everything under this path is excluded from the
// duplicate-name check and treated specially in boundary tests.
const SLIDES_PREFIX = 'content/slides/';

// The public Trail student app (trilha/) is a separate bounded context: it is
// served as its own public page(s), NOT a tab in the auth'd shell, and owns its
// own i18n + backend facade by design (the admin app never imports it). Like the
// Slides tree, it is excluded from the cross-tree duplicate-name check.
const TRILHA_PREFIX = 'trilha/';

// The sanctioned mount wrappers for the Slides sub-tree (inbound boundary).
// content/slides.js is the authored-deck sub-tab; certificates/certificates.js
// is the certificate template editor face (added 2026-06-12).
const SLIDES_WRAPPER = 'content/slides.js';
const SLIDES_INBOUND_ALLOWLIST = new Set([
  'content/slides.js',
  'certificates/certificates.js',
]);

// The vendored Slides CORE (the standalone app). Only this sub-tree is held to
// the strict outbound rule. The Codex integration glue (the content/slides.js
// wrapper and content/slides/adapters/) is the seam to the backend and is
// allowed to use the js/codex-api.js facade, so it is NOT part of the core.
const SLIDES_CORE_PREFIX = 'content/slides/js/';

// The ONLY modules the sealed core may import from outside content/slides/. Membership rule
// + the honest caveats: see Test 4's header. Adding an entry is an architecture decision
// (track-35 E), not a convenience: check the candidate against the rule and say so here.
//   js/i18n.js    t(): keys -> strings. No state, no backend.
//   js/glyphs.js  glyphSvg(): key -> inline SVG. No state, no backend.
// js/vendor/fflate.js joined in track-61, when the student trail started ZIPPING a project's
// package with the same lib the .pptx importer already used to UNzip. It meets the membership
// criterion: a pure codec, turns bytes into bytes, no app state, no store, no facade, no
// network. Two vendored copies of the same lib would be the worse problem.
const SLIDES_CORE_OUTBOUND = new Set(['js/i18n.js', 'js/glyphs.js', 'js/vendor/fflate.js']);

// Tab directories.
const TABS = ['cohorts', 'content', 'questions', 'lessons', 'certificates'];

// All .js files in the tree.
const allJs = walkJs(ROOT);

// HTML entry points that count as module consumers (they import shared js/
// modules directly, not via a .js file). The admin index.html imports
// codex-topbar.js; the Trail entry HTMLs import the shared transport
// (js/worker-call.js). Joined into one corpus for the string-match below.
const indexHtml = [
  read('../index.html'),
  read('../../trilha/index.html'),
  read('../../trilha/validar.html'),
].join('\n');

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
    // Also check the HTML entry points (string-match, since they are not .js).
    if (!found && indexHtml.includes(mod)) found = true;
    assert.ok(found, `shared module js/${mod} is imported by at least one consumer`);
  }
});

// ── Test 2: no duplicate-named module outside the sealed trees ───────────────
// Gather basenames of all *.js files EXCLUDING the sealed bounded trees
// (content/slides/ and trilha/). No basename may appear more than once.
test('no duplicate-named module outside the Slides/Trail boundaries', () => {
  const checkedFiles = allJs.filter((f) => !f.startsWith(SLIDES_PREFIX) && !f.startsWith(TRILHA_PREFIX));
  const counts = Object.create(null);
  for (const f of checkedFiles) {
    const base = f.substring(f.lastIndexOf('/') + 1);
    counts[base] = (counts[base] || 0) + 1;
  }
  for (const [base, count] of Object.entries(counts)) {
    assert.ok(count === 1, `basename "${base}" appears ${count} times outside content/slides/ and trilha/ (must be unique)`);
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
          SLIDES_INBOUND_ALLOWLIST.has(f),
          `"${f}" imports "${imp}" (resolves to "${resolved}") inside content/slides/js/; only ${[...SLIDES_INBOUND_ALLOWLIST].join(', ')} may do this`,
        );
      }
    }
  }
});

// ── Test 4: Slides boundary intact outbound (vendored core) ──────────────────
// The VENDORED CORE (content/slides/js/) may reach OUT of content/slides/ only into the
// modules on SLIDES_CORE_OUTBOUND below. The Codex integration glue (content/slides.js
// wrapper + content/slides/adapters/) is NOT part of the sealed core; it is the seam to the
// backend and may use the js/codex-api.js facade, so it is exempt from this rule.
//
// The criterion for membership (track-35 E, Élder 2026-07-16), so this never degrades into
// "whatever someone needed that day": a shared PRESENTATION-ONLY library — it turns data into
// strings/markup, holds no app state, and never reaches the store, the facade or the network.
// That is a rule you can check a candidate against; the old rule was the bare list "i18n and
// nothing else", which answered "may glyphs.js in?" with taste instead of a reason.
//
// What this does NOT claim, because it is not true: that these are dependency-free leaves.
// js/i18n.js pulls i18n/pt.js + i18n/en.js, js/glyphs.js pulls js/dom.js. The test also only
// inspects DIRECT imports, so those tails are not checked here. The bar is the ROLE of the
// module the core names, not the size of its tail.
test('Slides boundary intact outbound (vendored core)', () => {
  const coreFiles = allJs.filter((f) => f.startsWith(SLIDES_CORE_PREFIX));
  for (const f of coreFiles) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const imports = extractImports(src);
    for (const imp of imports) {
      const resolved = resolveImport(f, imp);
      if (!resolved.startsWith(SLIDES_PREFIX)) {
        assert.ok(
          SLIDES_CORE_OUTBOUND.has(resolved),
          `"${f}" imports "${imp}" which escapes content/slides/ to "${resolved}"; the vendored core may only reach ${[...SLIDES_CORE_OUTBOUND].join(' / ')} (shared presentation-only libraries). Use the codexStore adapter for backend access.`,
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

// ── Test 6: no orphaned tab-entry module (tests the REAL thing: is it mounted) ─
// A "tab-entry module" is a file "<dir>/<dir>.js" directly under the codex root
// (the admin-tab convention: cohorts/cohorts.js, content/content.js, ...). The
// boot — index.html — MUST import each one, or it is DEAD CODE the running app
// never mounts. This is the guard that would have caught a "participants tab"
// being redesigned in an UNMOUNTED file (alunos/alunos.js) with zero on-screen
// effect while its unit tests still "passed". The lesson it encodes: pure-logic
// tests on an unmounted module are FALSE CONFIDENCE — a module is only real once
// the boot wires it in. trilha/ + content/slides/ are sealed contexts with their
// own entry points, never admin shell tabs, so they are excluded.
const ENTRY_EXEMPT = new Set([
  // (none today) Add a "<dir>/<dir>.js" here ONLY if it is intentionally not an
  // admin shell tab AND has its own real entry point.
]);
test('no orphaned tab-entry module (every <dir>/<dir>.js is mounted by index.html)', () => {
  const adminIndex = read('../index.html');
  const entryModules = allJs.filter((f) => {
    if (f.startsWith(TRILHA_PREFIX) || f.startsWith(SLIDES_PREFIX)) return false;
    const parts = f.split('/');
    return parts.length === 2 && parts[1] === parts[0] + '.js'; // "<dir>/<dir>.js"
  });
  for (const f of entryModules) {
    if (ENTRY_EXEMPT.has(f)) continue;
    assert.ok(
      adminIndex.includes('./' + f),
      `tab-entry module "${f}" is NOT imported by index.html. Either wire it into the boot TABS, or delete it as dead code. Building on (or unit-testing) an unmounted module has ZERO effect in the running app.`,
    );
  }
});
