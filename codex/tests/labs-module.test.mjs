// Labs sub-tab: NATIVE cdx- module (was a CTLabsPanel global wrapper). Tab
// contract + module source rules + the shared-state/registry contract. The lab
// registry (CVLabs) and the fullscreen preview modal (CVLabViewer) stay shared
// globals; this module owns only the panel UI and the on/off state, which it
// writes to the SAME localStorage key CVLabs.isLabEnabled reads ('cv_labs_enabled').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const labs = await import('../content/labs.js');

test('labs module satisfies the tab contract', () => {
  assert.equal(typeof labs.mount, 'function', 'exports mount');
  assert.equal(typeof labs.unmount, 'function', 'exports unmount');
});

test('labs is a native cdx- module, not a CTLabsPanel wrapper', () => {
  const src = read('../content/labs.js');
  assert.ok(!/window\.CTLabsPanel/.test(src), 'no longer accesses the legacy CTLabsPanel global');
  assert.match(src, /cdx-lab-card/, 'renders native cdx- cards');
  assert.match(src, /cdx-lab-switch/, 'native on/off switch');
  assert.match(src, /from\s+['"]\.\.\/js\/i18n\.js['"]/, 'imports t()');
  assert.ok(!/—/.test(src), 'no em dashes');
  assert.ok(!/class="ct-/.test(src) && !/class="cv-/.test(src), 'authors no ct-/cv- markup');
});

test('labs preserves the shared state + registry contract', () => {
  const src = read('../content/labs.js');
  assert.match(src, /cv_labs_enabled/, 'writes the same on/off key CVLabs.isLabEnabled reads');
  assert.match(src, /window\.CVLabs/, 'reads the shared lab registry');
  assert.match(src, /window\.CVLabViewer/, 'delegates fullscreen preview to the shared viewer');
});

test('labs strings route through t() in both dictionaries', async () => {
  const pt = (await import('../i18n/pt.js')).default;
  const en = (await import('../i18n/en.js')).default;
  for (const k of ['labs.title', 'labs.hint', 'labs.preview', 'labs.toggle', 'labs.lab_prefix', 'labs.unavailable']) {
    assert.ok(k in pt, `pt.js has ${k}`);
    assert.ok(k in en, `en.js has ${k}`);
  }
});
