// Module-contract source-assertions for the Content tab (ARCHITECTURE.md):
// facade-only backend, no inline JS in markup, cdx- prefix on authored classes,
// i18n via t(), no em dashes, shell router + topbar wiring.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  assert.ok(fs.existsSync(p), `${rel} exists`);
  return fs.readFileSync(p, 'utf8');
};

const itemsJs = read('../content/items.js');
const contentJs = read('../content/content.js');
const presetsJs = read('../content/presets.js');
const releasesJs = read('../content/releases.js');
const apostilaJs = read('../content/apostila.js');
const tarefasJs = read('../content/tarefas.js');
const labsJs = read('../content/labs.js');
const turmaPickerJs = read('../content/turma-picker.js');
const indexHtml = read('../index.html');
const topbarJs = read('../js/codex-topbar.js');
// Tab/sub-tab modules: full contract incl. mount/unmount.
const moduleFiles = {
  'content.js': contentJs, 'items.js': itemsJs, 'presets.js': presetsJs,
  'releases.js': releasesJs, 'apostila.js': apostilaJs, 'tarefas.js': tarefasJs,
  'labs.js': labsJs,
};
// Helper modules: same source rules, but not tabs (no mount/unmount contract).
const helperFiles = { 'turma-picker.js': turmaPickerJs };

test('backend reached ONLY through the facade (no direct callWorker)', () => {
  for (const [name, src] of Object.entries(moduleFiles)) {
    assert.ok(!/\bcallWorker\s*\(/.test(src), `${name} makes no direct callWorker() call`);
  }
  assert.match(itemsJs, /from\s+['"]\.\.\/js\/codex-api\.js['"]/, 'items.js imports the facade');
});

test('no inline JavaScript in authored markup (no onclick=)', () => {
  for (const [name, src] of Object.entries(moduleFiles)) {
    assert.ok(!/onclick\s*=/.test(src), `${name} authors no inline onclick handlers`);
  }
});

test('authored classes use the cdx- prefix, not legacy ct-/cv-', () => {
  for (const [name, src] of Object.entries(moduleFiles)) {
    assert.ok(/cdx-/.test(src), `${name} authors cdx- classes`);
    assert.ok(!/class="ct-/.test(src), `${name} authors no ct- classes`);
    assert.ok(!/class="cv-/.test(src), `${name} authors no cv- classes`);
  }
});

test('all user-facing strings go through t() (i18n imported)', () => {
  for (const [name, src] of Object.entries(moduleFiles)) {
    assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, `${name} imports t()`);
  }
});

test('no em dashes in authored source', () => {
  for (const [name, src] of Object.entries(moduleFiles)) {
    assert.ok(!/—/.test(src), `${name} has no em dashes`);
  }
});

test('tab contract: items + content export mount/unmount', () => {
  for (const [name, src] of Object.entries(moduleFiles)) {
    assert.match(src, /export\s+function\s+mount\s*\(/, `${name} exports mount`);
    assert.match(src, /export\s+function\s+unmount\s*\(/, `${name} exports unmount`);
  }
});

test('helper modules obey the source rules (facade-only, no inline, cdx-, i18n, no em dash)', () => {
  for (const [name, src] of Object.entries(helperFiles)) {
    assert.ok(!/\bcallWorker\s*\(/.test(src), `${name} makes no direct callWorker() call`);
    assert.ok(!/onclick\s*=/.test(src), `${name} authors no inline onclick`);
    assert.ok(/cdx-/.test(src), `${name} authors cdx- classes`);
    assert.ok(!/class="ct-/.test(src) && !/class="cv-/.test(src), `${name} authors no ct-/cv- classes`);
    assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, `${name} imports t()`);
    assert.match(src, /from\s+['"]\.\.\/js\/codex-api\.js['"]/, `${name} imports the facade`);
    assert.ok(!/—/.test(src), `${name} has no em dashes`);
  }
});

test('index.html boot routes by ?tab= and can mount the Content shell', () => {
  assert.match(indexHtml, /URLSearchParams/, 'boot parses the query string');
  assert.match(indexHtml, /['"]tab['"]/, 'boot reads the tab param');
  assert.match(indexHtml, /content\/content\.js/, 'boot imports the content shell');
  assert.match(indexHtml, /content\/content\.css/, 'content CSS linked');
});

test('topbar Content tab points at the migrated /codex route', () => {
  // The content TAB entry's href is flipped off the old classtrail page.
  const contentTab = topbarJs.match(/key:\s*'content'[\s\S]*?\}/);
  assert.ok(contentTab, 'content tab entry found');
  assert.match(contentTab[0], /href:\s*'\/codex\/\?tab=content'/, 'content href is /codex/?tab=content');
  assert.ok(!/\/backstage\/classtrail/.test(contentTab[0]), 'no longer links to classtrail');
});
