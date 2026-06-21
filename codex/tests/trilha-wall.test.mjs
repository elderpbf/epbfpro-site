// codex/trilha/js/wall.js — the registration wall (the approved a1 mock ported to
// the cdx- contract). The DOM is verified on staging; here we pin the PURE helpers
// (roadmap derivation + the compact PT date) and the PORT CONTRACT: the a1 values
// copied verbatim into the new cdx-en-* classes, dark + scoped-phone overrides, and
// wall.css linked in both served index.html copies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wall = await import('../trilha/js/wall.js');
const { shortDate, wallRoadmapRows } = wall;

// ── Pure helpers ─────────────────────────────────────────────────────────────

test('shortDate -> "dd mmm" (pt, zero-padded day like the a1 mock), empty on junk', () => {
  assert.equal(shortDate('2026-03-12'), '12 mar');
  assert.equal(shortDate('2026-01-07'), '07 jan');
  assert.equal(shortDate('2026-04-02'), '02 abr');       // a1 shows "02 abr": day is padded
  assert.equal(shortDate('2026-12-02T10:00:00'), '02 dez');
  assert.equal(shortDate(''), '');
  assert.equal(shortDate(null), '');
  assert.equal(shortDate('not-a-date'), '');
});

test('wallRoadmapRows sorts by aula_number and maps number/title/date', () => {
  const rows = wallRoadmapRows([
    { aula_number: 2, title: 'B', scheduled_for: '2026-03-19' },
    { aula_number: 1, title: 'A', happened_on: '2026-03-12' },
    { aula_number: 3 },
  ]);
  assert.deepEqual(rows.map((r) => r.number), [1, 2, 3]);
  assert.equal(rows[0].title, 'A');
  assert.equal(rows[0].date, '12 mar');
  assert.equal(rows[1].date, '19 mar');
  assert.equal(rows[2].title, 'Aula 3');   // fallback title when the aula has none
  assert.equal(rows[2].date, '');           // no scheduled/happened date
});

test('wallRoadmapRows tolerates junk input', () => {
  assert.deepEqual(wallRoadmapRows(null), []);
  assert.deepEqual(wallRoadmapRows(undefined), []);
  assert.deepEqual(wallRoadmapRows('x'), []);
});

// ── Port contract: a1 values copied verbatim into cdx-en-* ───────────────────
const css = readFileSync(join(__dirname, '..', 'trilha', 'css', 'wall.css'), 'utf8');

test('wall.css ports the a1 grid + benefit accents verbatim into cdx-en-*', () => {
  assert.match(css, /\.cdx-en-grid\s*\{[^}]*grid-template-columns:\s*1\.05fr\s+0\.95fr/);
  assert.match(css, /\.cdx-en-bene-ic--tarefa\s*\{[^}]*#0d9488/);
  assert.match(css, /\.cdx-en-bene-ic--conteudo\s*\{[^}]*#2563eb/);
  assert.match(css, /\.cdx-en-bene-ic--forum\s*\{[^}]*#7c3aed/);
  assert.match(css, /\.cdx-en-bene-ic--cert\s*\{[^}]*#d97706/);
});

test('wall.css carries the dark-mode overrides the contract requires', () => {
  assert.match(css, /\[data-theme="dark"\]\s*\.cdx-en-bene-ic--tarefa/);
  assert.match(css, /\[data-theme="dark"\]\s*\.cdx-en-bene-ic--cert/);
});

test('wall.css scopes the phone hero overrides to the wall (not a global hero restyle)', () => {
  assert.match(css, /@media\s*\(max-width:\s*560px\)/);
  // the shared hero classes are restyled ONLY under the wall marker
  assert.match(css, /\.cdx-tr-has-wall\s+\.cdx-trilha-hero/);
});

// ── wall.css linked in BOTH hand-synced index.html copies ────────────────────
for (const rel of [['..', 'trilha', 'index.html'], ['..', '..', 'trilha', 'index.html']]) {
  const path = join(__dirname, ...rel);
  test(`wall.css is linked in ${rel.join('/')}`, () => {
    const html = readFileSync(path, 'utf8');
    assert.match(html, /trilha\/css\/wall\.css/);
  });
}
