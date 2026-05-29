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

test('legacy Backstage topbar routes migrated tabs to /codex/', () => {
  const block = legacyTopbar.match(/var CODEX_TABS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(block, 'CODEX_TABS found');
  const tabs = block[1];
  assert.match(tabs, /key:\s*'turmas',\s*label:\s*'Turmas',\s*href:\s*'\/codex\/'/, 'Turmas -> /codex/');
  assert.match(tabs, /key:\s*'conteudo'[\s\S]*?href:\s*'\/codex\/\?tab=content'/, 'Conteúdo -> /codex/?tab=content');
  // Un-migrated tabs stay legacy.
  assert.match(tabs, /key:\s*'aula'[\s\S]*?href:\s*'\/backstage\/classvault\//, 'Aula still legacy');
  assert.match(tabs, /key:\s*'perguntas'[\s\S]*?href:\s*'\/backstage\/classpulse\//, 'Perguntas still legacy');
});

test('legacy Content sub-tab row points Items at the migrated page', () => {
  assert.match(legacyTopbar, /label:\s*'Items',\s*href:\s*'\/codex\/\?tab=content'/, 'Items sub-tab -> /codex/?tab=content');
});

test('Codex topbar routes migrated tabs to /codex/, un-migrated to legacy', () => {
  const cohorts = codexTopbar.match(/key:\s*'cohorts'[\s\S]*?\}/);
  const content = codexTopbar.match(/key:\s*'content'[\s\S]*?\}/);
  const lessons = codexTopbar.match(/key:\s*'lessons'[\s\S]*?\}/);
  const questions = codexTopbar.match(/key:\s*'questions'[\s\S]*?\}/);
  assert.match(cohorts[0], /href:\s*'\/codex\/'/, 'cohorts -> /codex/');
  assert.match(content[0], /href:\s*'\/codex\/\?tab=content'/, 'content -> /codex/?tab=content');
  assert.match(lessons[0], /href:\s*'\/backstage\/classvault\//, 'lessons still legacy');
  assert.match(questions[0], /href:\s*'\/backstage\/classpulse\//, 'questions still legacy');
});

test('Content shell bridges un-migrated sub-tabs to legacy ClassTrail', () => {
  // Items + Presets + Releases + Apostila are native (module); the rest are legacy hrefs.
  assert.match(contentJs, /key:\s*'items',\s*labelKey:\s*'content\.sub_items',\s*module:/, 'Items is native');
  assert.match(contentJs, /key:\s*'presets',\s*labelKey:\s*'content\.sub_presets',\s*module:/, 'Presets is native');
  assert.match(contentJs, /key:\s*'releases',\s*labelKey:\s*'content\.sub_releases',\s*module:/, 'Releases is native');
  assert.match(contentJs, /key:\s*'apostila',\s*labelKey:\s*'content\.sub_apostila',\s*module:/, 'Apostila is native');
  for (const [key, tab] of [
    ['tarefas', 'tarefas'], ['drive', 'drive'], ['labs', 'labs'],
  ]) {
    const re = new RegExp("key:\\s*'" + key + "'[\\s\\S]*?href:\\s*'/backstage/classtrail/\\?tab=" + tab + "'");
    assert.match(contentJs, re, `${key} bridges to ClassTrail ?tab=${tab}`);
  }
});

test('the sub-tab BAR is the legacy bs-topbar-subrow rendered by the Codex topbar', () => {
  // Reuse the existing chrome, do not hand-roll a bar.
  assert.match(codexTopbar, /opts\.subTabs/, 'topbar reads opts.subTabs');
  assert.match(codexTopbar, /['"]bs-topbar-subrow['"]/, 'renders bs-topbar-subrow');
  assert.match(codexTopbar, /['"]bs-topbar-subtab['"]/, 'renders bs-topbar-subtab links');
  // Only when sub-tabs exist (Cohorts stays single-row).
  assert.match(codexTopbar, /subTabs\.length\s*>\s*0/, 'sub-row only when sub-tabs exist');
});

test('content exposes subtabs() with native /codex routes + legacy bridges', () => {
  assert.match(contentJs, /export\s+function\s+subtabs\s*\(/, 'content exports subtabs()');
  assert.match(contentJs, /\/codex\/\?tab=content&sub=/, 'native sub-tabs route to /codex/?tab=content&sub=');
});

test('boot hands the Content sub-tabs to the topbar and the sub to mount', () => {
  assert.match(indexHtml, /content\.subtabs\(/, 'boot builds sub-tabs from content.subtabs()');
  assert.match(indexHtml, /topbar\(\s*\{\s*active:\s*tab,\s*subTabs\s*\}\s*\)/, 'boot passes subTabs to the topbar');
  assert.match(indexHtml, /ctx\.sub\s*=\s*sub/, 'boot passes the active sub to mount');
});
