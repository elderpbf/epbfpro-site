// Source-contract for the draggable panel dividers (js/resizable.js). One shared
// helper, persisted to localStorage via the --cdx-rz-w CSS var, reused by the
// Liberações/Tarefas split. (Cohorts moved its CLIENTES nav to the auto-hide rail,
// mirroring Questions; and its Aulas-hub resizer now rides the shared list-rail's
// width:resize capability, track-21, so cohorts no longer imports installResizer
// directly.) Pins the clamp math + that both split consumers install it, plus the CSS
// hooks (grip, Clientes title).
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

// TAREFAS SAIU DAQUI em 2026-07-16 (track-41). Ela nunca foi um "split consumer" de verdade:
// o `_renderShell` só emitia o pane t1b, então NINGUÉM criava `#cdx-tarefas-split` e o
// `installResizer(_q('cdx-tarefas-split'))` rodava sobre `null`, atrás de um ramo
// `_lockedAula == null` inalcançável (content.js monta bankOnly, cohorts.js sempre passa
// aulaNumber). Este teste lia só o FONTE, então passava verde sobre código morto. Contraste
// que prova: `releases.js` EMITE `<div class="cdx-items-split cdx-releases-split" ...>`; o
// tarefas.js não emitia nada equivalente. O CSS `.cdx-tarefas-split` fica (regra órfã não
// pinta nada, e mexer em CSS é onde mora o risco de desvio visual).
test('the split surface installs the shared resizer (no duplicated drag code)', () => {
  assert.match(releasesJs, /from '\.\.\/js\/resizable\.js'/, 'releases imports the helper');
  assert.match(releasesJs, /installResizer\(/, 'releases installs the resizer');
  assert.match(releasesJs, /cdx-releases-split'[\s\S]{0,80}cdx_rz_releases_split|cdx_rz_releases_split/, 'releases installs on its split');
  assert.ok(!/installResizer/.test(tarefasJs), 'tarefas no longer installs a resizer (it has no split to resize)');
  // The CLIENTES nav is the auto-hide rail (no resizer there). The Aulas hub IS a
  // resizable list | detail split, but it now adopts the shared list-rail (track-21),
  // so the resizer is wired through the rail's width:resize capability — the module
  // imports the ONE shared installResizer, cohorts just configures the storeKey.
  assert.match(read('../js/list-rail.js'), /import \{ installResizer \} from '\.\/resizable\.js'/, 'list-rail wires the ONE shared resizer');
  assert.match(cohortsJs, /storeKey:\s*'cdx_rz_aulas_hub'/, 'cohorts drives the aula-hub resize via the rail width capability');
  assert.match(cohortsJs, /cdx-sm--open/, 'cohorts still wires the auto-hide rail');
});

test('CSS keeps the split grid var, the grip, and the Clientes title', () => {
  // Cohorts' three-pane no longer uses the var (it is the auto-hide rail now);
  // only the Liberações/Tarefas split drives a grid from --cdx-rz-w (asserted below).
  assert.match(cohortsCss, /\.cdx-rz-grip\s*\{/, 'grip styled (for the Liberações/Tarefas split)');
  assert.match(cohortsCss, /\.cdx-rz-grip\s*\{\s*display:\s*none|cdx-rz-grip\s*\{\s*display:\s*none/, 'grip hidden on mobile (in a media query)');
  // Clientes title: dossiê size (1.25rem), no uppercase.
  const title = cohortsCss.match(/\.cdx-pane-title\s*\{[^}]*\}/);
  assert.ok(title, '.cdx-pane-title rule present');
  assert.match(title[0], /font-size:\s*1\.25rem/, 'title at the dossiê size');
  assert.ok(!/text-transform:\s*uppercase/.test(title[0]), 'title is not uppercased');
  assert.match(contentCss, /\.cdx-releases-split,\s*\.cdx-tarefas-split[^}]*var\(--cdx-rz-w/, 'split uses the var');
});
