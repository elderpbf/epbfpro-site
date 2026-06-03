// Cross-topbar strangler routing: migrated tabs (Cohorts, Content) route to
// /codex/ from BOTH the Codex topbar and the legacy Backstage topbar; the Codex
// Content shell bridges its un-migrated sub-tabs back to the legacy ClassTrail
// page so nothing is stranded. Guards the round-trip nav bug from regressing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => {
  const p = fileURLToPath(new URL(rel, import.meta.url));
  assert.ok(fs.existsSync(p), `${rel} exists`);
  return fs.readFileSync(p, 'utf8');
};

const legacyTopbar = read('../../backstage/js/backstage-topbar.js');
const codexTopbar = read('../js/codex-topbar.js');
const contentJs = read('../content/content.js');
const indexHtml = read('../index.html');

test('legacy Backstage topbar keeps the old platform self-contained (all tabs legacy)', () => {
  // The old working platform is standalone again, separate from the /codex/
  // refactor: every old tab links to its legacy page.
  const block = legacyTopbar.match(/var CODEX_TABS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(block, 'CODEX_TABS found');
  const tabs = block[1];
  assert.match(tabs, /key:\s*'turmas'[\s\S]*?href:\s*'\/backstage\/classtrail\/\?tab=turmas'/, 'Turmas -> ClassTrail');
  assert.match(tabs, /key:\s*'conteudo'[\s\S]*?href:\s*'\/backstage\/classtrail\/\?tab=conteudo'/, 'Conteúdo -> ClassTrail');
  assert.match(tabs, /key:\s*'aula'[\s\S]*?href:\s*'\/backstage\/classvault\//, 'Aula -> ClassVault');
  assert.match(tabs, /key:\s*'perguntas'[\s\S]*?href:\s*'\/backstage\/classpulse\//, 'Perguntas -> ClassPulse');
});

test('legacy Content sub-tab row points Items at ClassTrail (old platform)', () => {
  assert.match(legacyTopbar, /label:\s*'Items',\s*href:\s*'\/backstage\/classtrail\/\?tab=conteudo'/, 'Items sub-tab -> ClassTrail');
});

test('Codex topbar routes migrated tabs to /codex/, un-migrated to legacy', () => {
  const cohorts = codexTopbar.match(/key:\s*'cohorts'[\s\S]*?\}/);
  const content = codexTopbar.match(/key:\s*'content'[\s\S]*?\}/);
  const lessons = codexTopbar.match(/key:\s*'lessons'[\s\S]*?\}/);
  const questions = codexTopbar.match(/key:\s*'questions'[\s\S]*?\}/);
  assert.match(cohorts[0], /href:\s*'\/codex\/'/, 'cohorts -> /codex/');
  assert.match(content[0], /href:\s*'\/codex\/\?tab=content'/, 'content -> /codex/?tab=content');
  assert.match(lessons[0], /href:\s*'\/codex\/\?tab=lessons'/, 'lessons -> /codex/?tab=lessons');
  assert.match(questions[0], /href:\s*'\/codex\/\?tab=questions'/, 'questions -> /codex/?tab=questions (migrated)');
});

test('every Content sub-tab is now a native module (no ClassTrail bridges left)', () => {
  // Task D complete: all six remaining sub-tabs migrated. Items/Presets/Releases/
  // Apostila/Tarefas are full native; Labs/Drive are native wrappers around a
  // deferred legacy global (tracked debt). None bridges to the old page.
  for (const [key, labelKey] of [
    ['items', 'content.sub_items'], ['apostila', 'content.sub_apostila'],
    ['tarefas', 'content.sub_tarefas'], ['drive', 'content.sub_drive'],
    ['labs', 'content.sub_labs'], ['presets', 'content.sub_presets'],
    ['releases', 'content.sub_releases'],
  ]) {
    const re = new RegExp("key:\\s*'" + key + "',\\s*labelKey:\\s*'" + labelKey.replace('.', '\\.') + "',\\s*module:");
    assert.match(contentJs, re, `${key} is a native module`);
  }
  assert.ok(!/href:\s*'\/backstage\/classtrail/.test(contentJs), 'no SUBTABS entry bridges to ClassTrail');
});

test('the Codex topbar renders sub-tabs as the pill/bar chrome (5c), only when they exist', () => {
  // 5c superseded the legacy bs-topbar-subrow with the hover-pill / persistent-bar
  // chrome (a global pref). Detailed contract lives in topbar-subtabs.test.mjs.
  assert.match(codexTopbar, /opts\.subTabs/, 'topbar reads opts.subTabs');
  assert.match(codexTopbar, /cdx-subpill/, 'renders the hover-pill chrome');
  assert.match(codexTopbar, /cdx-subrow|cdx-substrip/, 'renders the persistent-bar chrome');
  // Only when sub-tabs exist (Cohorts stays single-row).
  assert.match(codexTopbar, /subTabs\.length\s*>\s*0/, 'sub-nav only when sub-tabs exist');
});

test('content exposes subtabs() with native /codex routes + legacy bridges', () => {
  assert.match(contentJs, /export\s+function\s+subtabs\s*\(/, 'content exports subtabs()');
  assert.match(contentJs, /\/codex\/\?tab=content&sub=/, 'native sub-tabs route to /codex/?tab=content&sub=');
});

test('boot imports + routes the native Lessons tab (?tab=lessons)', () => {
  assert.match(indexHtml, /import \* as lessons from '\.\/lessons\/lessons\.js'/, 'boot imports the lessons module');
  assert.match(indexHtml, /const TABS = \{[^}]*lessons[^}]*\}/, 'lessons is in the TABS routing map');
  assert.match(indexHtml, /lessons\/lessons\.css/, 'lessons CSS linked');
});

test('boot builds the per-tab sub-tab map, hands it to the topbar, and passes the sub to mount', () => {
  assert.match(indexHtml, /\.subtabs\(/, "boot builds sub-tabs from each tab module's subtabs()");
  assert.match(indexHtml, /subTabsByTab/, 'boot builds the per-tab map (pill hover-all)');
  assert.match(indexHtml, /topbar\(\s*\{\s*active:\s*tab,\s*subTabs,\s*subTabsByTab\s*\}\s*\)/, 'boot passes subTabs + the map to the topbar');
  assert.match(indexHtml, /ctx\.sub\s*=\s*sub/, 'boot passes the active sub to mount');
});
