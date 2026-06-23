// Source-contract for the draggable panel dividers (js/resizable.js). One shared
// helper, persisted to localStorage via the --cdx-rz-w CSS var, reused by the
// Liberações/Tarefas split. (Cohorts moved its CLIENTES nav to the auto-hide rail,
// mirroring Questions, so it no longer installs the resizer.) Pins the clamp math
// + that both split consumers install it, plus the CSS hooks (grip, Clientes title).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { clampWidth } from '../js/resizable.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const resizableJs = read('../js/resizable.js');
const cohortsJs = read('../cohorts/cohorts.js');
const releasesJs = read('../content/releases.js');
const tarefasJs = read('../content/tarefas.js');
const cohortsCss = read('../cohorts/cohorts.css');
const contentCss = read('../content/content.css');

test('clampWidth keeps the width within [min, max] and rounds', () => {
  assert.equal(clampWidth(50, 200, 520), 200, 'below min clamps up');
  assert.equal(clampWidth(900, 200, 520), 520, 'above max clamps down');
  assert.equal(clampWidth(333.6, 200, 520), 334, 'in range rounds');
  assert.equal(clampWidth('NaN', 200, 520), 200, 'garbage falls back to min');
});

test('the resizer persists to localStorage via the --cdx-rz-w var', () => {
  assert.match(resizableJs, /export function installResizer/, 'exports installResizer');
  assert.match(resizableJs, /localStorage\.getItem\(storeKey\)/, 'restores the saved width');
  assert.match(resizableJs, /localStorage\.setItem\(storeKey/, 'persists on drop');
  assert.match(resizableJs, /setProperty\('--cdx-rz-w'/, 'drives the grid via the CSS var');
  assert.match(resizableJs, /class="cdx-rz-grip"|className = 'cdx-rz-grip'/, 'creates the grip element');
});

test('the split surfaces install the shared resizer (no duplicated drag code)', () => {
  for (const [name, src] of [['releases', releasesJs], ['tarefas', tarefasJs]]) {
    assert.match(src, /from '\.\.\/js\/resizable\.js'/, `${name} imports the helper`);
    assert.match(src, /installResizer\(/, `${name} installs the resizer`);
  }
  assert.match(releasesJs, /cdx-releases-split'[\s\S]{0,80}cdx_rz_releases_split|cdx_rz_releases_split/, 'releases installs on its split');
  assert.match(tarefasJs, /cdx_rz_tarefas_split/, 'tarefas installs on its split');
  // Cohorts no longer installs the resizer (its CLIENTES nav is the auto-hide rail).
  assert.ok(!/installResizer\(/.test(cohortsJs), 'cohorts does not install the resizer anymore');
  assert.match(cohortsJs, /cdx-sm--open/, 'cohorts wires the auto-hide rail instead');
});

test('CSS drives the grids from the var and the Clientes title matches the dossiê', () => {
  assert.match(cohortsCss, /\.cdx-three-pane[^}]*grid-template-columns:\s*var\(--cdx-rz-w/, 'three-pane uses the var');
  assert.match(cohortsCss, /\.cdx-rz-grip\s*\{/, 'grip styled');
  assert.match(cohortsCss, /\.cdx-rz-grip\s*\{\s*display:\s*none|cdx-rz-grip\s*\{\s*display:\s*none/, 'grip hidden on mobile (in a media query)');
  // Clientes title: dossiê size (1.25rem), no uppercase.
  const title = cohortsCss.match(/\.cdx-pane-title\s*\{[^}]*\}/);
  assert.ok(title, '.cdx-pane-title rule present');
  assert.match(title[0], /font-size:\s*1\.25rem/, 'title at the dossiê size');
  assert.ok(!/text-transform:\s*uppercase/.test(title[0]), 'title is not uppercased');
  assert.match(contentCss, /\.cdx-releases-split,\s*\.cdx-tarefas-split[^}]*var\(--cdx-rz-w/, 'split uses the var');
});
