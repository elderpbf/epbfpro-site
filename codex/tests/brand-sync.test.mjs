// Piece 3 of track-47: the test that breaks when a brand artifact falls out of sync.
//
// Regenerates every line of tools/brand-manifest.js in memory and compares it BYTE FOR BYTE
// against the file on disk. Without it, "don't hand-edit .svg" is just an agreement, and it
// was that unverified agreement that produced the dot-edge divergence: someone fixed the
// path in the generator and never re-exported the files, and no one noticed for months
// because the defect is latent (renders the same in Blink and WebKit).
//
// This file is deliberately RED while there is open divergence. Today's two are named
// in DELTAS. Never print a whole SVG on a failure: an assert that dumps 20 KB is an
// assert nobody reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ARTIFACTS, RASTER_ARTIFACTS, UNBUILT_VARIANTS, SITE_SVG_ROOTS, TWIN, repoRoot, repoReachable, emit } from '../tools/brand-manifest.js';
import { emitTwin } from '../tools/brand-twin.js';
import { BRAND_FONT_CSS } from '../js/brand-font.js';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const caminho = t => path.join(repoRoot(t.repo), t.path);
const read = t => fs.readFileSync(caminho(t), 'utf8').replace(/\r\n/g, '\n').trim();
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
const rot = t => `${t.repo}:${t.path}`;
const inTree = t => t.repo === 'site';

// Targets this test can actually open on this machine. A repo whose root does not
// resolve is SKIPPED AND COUNTED (see the coverage test), never silently dropped.
const alcancavel = t => repoReachable(t.repo) && fs.existsSync(caminho(t));
const todos = () => ARTIFACTS.flatMap(a => a.targets.map(t => ({ ...t, artefato: a })));
const alvos = () => todos().filter(alcancavel);

// The known divergences, each as a transformation that takes the generator's output
// to what's on disk. A file is EXPLAINED if some combination of them reproduces it
// exactly. Any leftover is new drift, and that is what this test hunts for.
const DELTAS = {
  // Pending decision from Élder (track-47). The generator closes the dot's ring with
  // `...215 90z`, the exported files with `...215 90 320 37z`: 18 numbers (3 closed
  // cubics) versus 20, and the 2 extra don't form a curve. The generator's version is
  // the well-formed one.
  'dotEdge-dos-exports': svg => svg.replace(
    'm271 -351 c133 -67 8 -150 -29 -202 -166 -232 -188 -41 -356 201 -225 326 79 74 215 90z',
    'm271 -351 c133 -67 8 -150 -29 -202 -166 -232 -188 -41 -356 201 -225 326 79 74 215 90 320 37z'),

  // NOT a decision, it's a bug: these files stayed on the version before the font fix
  // (KD 2026-07-20, the font travels INSIDE the SVG). The fix reached Codex/Labs/Trilha/
  // Interativos and did NOT reach images/brand/, which is what the pensoia.com landing
  // and the legal pages serve. Disappears once the files are regenerated.
  'sem-a-fonte-embutida': svg => svg
    .replace(BRAND_FONT_CSS, '')
    .replace(/<style>\/\*[\s\S]*?\*\//, '<style>')
};

// Every combination of deltas, from empty to complete.
function* combinacoes(chaves) {
  for (let m = 0; m < (1 << chaves.length); m++)
    yield chaves.filter((_, i) => m & (1 << i));
}

// Which known deltas explain this file? null = none, i.e. NEW drift.
function explicar(esperado, disco) {
  for (const combo of combinacoes(Object.keys(DELTAS))) {
    const s = combo.reduce((acc, k) => DELTAS[k](acc), esperado).trim();
    if (s === disco) return combo;
  }
  return null;
}

test('every declared target exists on disk (in reachable repos)', () => {
  const faltando = todos().filter(t => repoReachable(t.repo) && !fs.existsSync(caminho(t))).map(rot);
  assert.deepEqual(faltando, [], 'the manifest points to a file that does not exist');
});

test('no brand .svg in-tree is missing from the manifest (no orphan copy)', () => {
  const declarados = new Set(todos().filter(inTree).map(t => t.path));
  const emDisco = SITE_SVG_ROOTS.flatMap(dir =>
    fs.readdirSync(path.join(SITE_ROOT, dir)).filter(f => f.endsWith('.svg')).map(f => `${dir}/${f}`));
  assert.deepEqual(emDisco.filter(p => !declarados.has(p)), [],
    'brand file with no manifest line = hand-maintained copy');
});

test('two targets of the same variant are the same file', () => {
  // logo-dark.svg and glyph-wordmark_bg.navy.svg are roles of the SAME drawing. If they
  // ever diverge, it's because someone edited one of the two thinking it only mattered there.
  const divergentes = [];
  for (const a of ARTIFACTS) {
    const ts = a.targets.filter(alcancavel);
    if (ts.length < 2) continue;
    const ref = hash(read(ts[0]));
    for (const t of ts.slice(1)) {
      const h = hash(read(t));
      if (h !== ref) divergentes.push(`${rot(t)} [${h}] != ${rot(ts[0])} [${ref}]  (${a.variant}/${a.bg})`);
    }
  }
  assert.deepEqual(divergentes, [], 'targets of the same variant with different bytes');
});

test('SYNC: every file on disk is byte for byte the generator output', () => {
  const fora = alvos()
    .filter(t => read(t) !== emit(t.artefato).trim())
    .map(t => {
      const deltas = explicar(emit(t.artefato), read(t));
      return `${rot(t)}  <- ${deltas ? deltas.join(' + ') : 'UNEXPLAINED DRIFT'}`;
    });
  assert.deepEqual(fora, [],
    'brand file out of sync with the generator:\n  ' + fora.join('\n  '));
});

test('the divergence is ONLY what is already named, nothing new got in', () => {
  // Drift guard while the track is open: the test above is red on purpose, this one
  // stays GREEN, and turns red the day a NEW divergence shows up. It's what keeps the
  // known red from turning into noise that hides things.
  const novos = alvos().filter(t => explicar(emit(t.artefato), read(t)) === null).map(rot);
  assert.deepEqual(novos, [],
    'divergence BEYOND the ones named in DELTAS (someone hand-edited a .svg):\n  ' + novos.join('\n  '));
});

test('coverage: what the manifest still does NOT reach is counted, not hidden', () => {
  // Rule 7, fail loud: a test that only looks at what it already covers measures its own shadow.
  // UNBUILT_VARIANTS can legitimately be zero (it went to zero in 4.b), so this does not
  // require there to be a gap, it requires the gap to be COUNTED. What can't happen is the
  // list vanishing from the manifest while the report still looks complete.
  const foraDaArvore = todos().filter(t => !inTree(t));
  const inalcancaveis = todos().filter(t => !alcancavel(t));
  assert.ok(Array.isArray(UNBUILT_VARIANTS), 'UNBUILT_VARIANTS disappeared from the manifest');
  assert.ok(foraDaArvore.length > 0, 'targets in backstage/Brand disappeared from the manifest');
  assert.ok(RASTER_ARTIFACTS.length > 0, 'the PNGs disappeared from the manifest');

  const porDelta = {};
  for (const t of alvos()) {
    const d = explicar(emit(t.artefato), read(t));
    const k = d === null ? 'UNEXPLAINED DRIFT' : (d.length ? d.join(' + ') : 'in sync');
    (porDelta[k] ||= []).push(rot(t));
  }
  console.log(
    `\n  [track-47 | brand state]\n` +
    Object.entries(porDelta).map(([k, v]) => `    ${String(v.length).padStart(2)}x ${k}`).join('\n') +
    `\n\n  [track-47 | reach]\n` +
    `    ${String(todos().length).padStart(2)}x declared target, of which ${alvos().length} opened and checked\n` +
    `    ${String(foraDaArvore.length).padStart(2)}x outside this repo (backstage + Brand)\n` +
    `    ${String(inalcancaveis.length).padStart(2)}x NOT checked on this machine` +
      (inalcancaveis.length ? `:\n${[...new Set(inalcancaveis.map(t => t.repo))].map(r => `         repo "${r}" -> ${repoRoot(r) || 'root not configured'}`).join('\n')}\n` : '  (all repos resolved)\n') +
    `    ${String(UNBUILT_VARIANTS.length).padStart(2)}x variant with no builder in the generator` +
      (UNBUILT_VARIANTS.length ? `: ${UNBUILT_VARIANTS.join(', ')}\n` : '  (all covered since 4.b)\n') +
    `    ${String(RASTER_ARTIFACTS.length).padStart(2)}x PNG declared, still no emitter\n`);
});

test('the backstage twin is OUTPUT of this generator, not a second generator', () => {
  // The heart of track-47: `backstage/js/brand-logos.js` was the second copy of the artwork,
  // and that's where the dot-edge divergence was born. Now it is derived. If someone edits
  // it there, this turns red the same day.
  if (!repoReachable(TWIN.repo)) {
    console.log(`\n  [track-47] twin parity NOT checked: repo "${TWIN.repo}" -> ${repoRoot(TWIN.repo) || 'root not configured'}\n`);
    return; // skipped AND announced; never silent
  }
  assert.ok(fs.existsSync(caminho(TWIN)), `${rot(TWIN)} does not exist`);
  const disco = fs.readFileSync(caminho(TWIN), 'utf8').replace(/\r\n/g, '\n');
  const esperado = emitTwin();
  assert.equal(hash(disco), hash(esperado),
    `${rot(TWIN)} diverged from the generator (disk ${disco.length}B, generated ${esperado.length}B). ` +
    `Don't edit the twin: edit codex/js/brand-logos.js and run tools/brand-build.mjs.`);
});

test('the transform to classic script leaves no module syntax behind', () => {
  // A leftover `export` makes all of backstage die with a SyntaxError on load, because
  // there the file loads as a classic script. Cheap to check, expensive to discover in prod.
  const twin = emitTwin();
  assert.ok(!/^\s*export\s/m.test(twin), 'leftover "export" in the twin');
  assert.ok(!/^\s*import\s/m.test(twin), 'leftover "import" in the twin');
  assert.match(twin, /^\/\/ GERADO — NÃO EDITE ESTE ARQUIVO\./, 'the generated-file warning opens the file');
  // And the functions the backstage pages call as globals are still declared.
  for (const g of ['stdColors', 'mark', 'fontWordmark', 'glyphWordmark', 'glyphWordmarkTag', 'embedSvg'])
    assert.ok(twin.includes(`\nfunction ${g}(`), `the global ${g}() disappeared from the twin`);
});

// ── The PNGs (track-47 4.d) ───────────────────────────────────────────────────
// Rasterizing requires a browser, and the suite is zero-dependency on purpose. So the
// everyday gate does not regenerate the PNG: it checks disk against the sha256 that
// tools/brand-raster.mjs recorded when it emitted. Catches hand edits and stale files,
// which is what this track exists to catch. A real regeneration is `brand-raster --check`.
const LOCK = JSON.parse(fs.readFileSync(new URL('../tools/brand-raster.lock.json', import.meta.url), 'utf8'));

test('every declared PNG has a lockfile line, and vice versa', () => {
  const declarados = RASTER_ARTIFACTS.flatMap(a => a.targets.filter(inTree).map(t => t.path)).sort();
  assert.deepEqual(Object.keys(LOCK).sort(), declarados,
    'manifest and lockfile disagree about which PNGs exist');
});

test('every PNG on disk is what the rasterizer emitted (sha256)', () => {
  const fora = [];
  for (const [rel, meta] of Object.entries(LOCK)) {
    const abs = path.join(SITE_ROOT, rel);
    if (!fs.existsSync(abs)) { fora.push(`${rel}  <- MISSING`); continue; }
    const atual = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    if (atual !== meta.sha256) fora.push(`${rel}  <- ${atual.slice(0, 12)} != ${meta.sha256.slice(0, 12)}`);
  }
  assert.deepEqual(fora, [],
    'brand PNG out of sync. Do not hand-edit PNGs: run tools/brand-raster.mjs.\n  ' + fora.join('\n  '));
});

test('the lockfile records variant and size, not just the hash', () => {
  // A lockfile that stores only the hash says "it changed" but not WHAT changed. With
  // variant and size you can tell, just by reading the file, that logo-mark is the round
  // plate and not the bare mark (which was the wrong hypothesis that the pixel diff busted).
  for (const [rel, m] of Object.entries(LOCK)) {
    assert.ok(m.variant && m.bg, `${rel}: lockfile missing variant/bg`);
    assert.ok(Number.isInteger(m.w) && Number.isInteger(m.h) && m.w > 0 && m.h > 0, `${rel}: lockfile missing size`);
  }
});
