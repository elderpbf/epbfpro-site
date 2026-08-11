// Browser check for the merged item editor. node:test has no eye and no DOM: it cannot tell
// whether the AI box actually mounted, whether the type block swapped when the type changed,
// whether stepping into a member paints a breadcrumb, or whether ONE Save writes the package and
// the member it touched. This can.
//
// Playwright is NOT a repo dependency on purpose (this repo IS the deploy artifact, a
// node_modules here would ship to the CDN). Install it anywhere and point CDX_PLAYWRIGHT at it:
//   npm i playwright --prefix /tmp/pw
//   CDX_PLAYWRIGHT=/tmp/pw/node_modules node codex/tests/visual/editor-check.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

const srv = createServer(async (req, res) => {
  const p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  try {
    const buf = await readFile(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch (_) { res.writeHead(404); res.end('404'); }
});
await new Promise((r) => srv.listen(8794, r));

async function loadPlaywright() {
  try { return await import('playwright'); } catch (_) { /* not a local dep, by design */ }
  const p = process.env.CDX_PLAYWRIGHT;
  if (!p) throw new Error('playwright not found: set CDX_PLAYWRIGHT (see the header)');
  const m = await import(pathToFileURL(join(p, 'playwright', 'index.js')).href);
  return m.chromium ? m : m.default;
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();

const fails = [];
const ok = (cond, label) => { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) fails.push(label); };
const shot = (page, name) => page.screenshot({
  path: (process.argv[2] ? process.argv[2] + '/' : '') + name + '.png', fullPage: true });

async function open(mode) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  // window.confirm blocks a headless run forever; the guards under test USE it, so it is
  // answered here rather than avoided. Default yes: each check overrides when it needs no.
  page.on('dialog', (d) => d.accept());
  await page.goto('http://127.0.0.1:8794/codex/tests/visual/editor-harness.html?mode=' + mode);
  await page.waitForSelector('.cdx-editor', { timeout: 10000 });
  return { page, errs };
}

// ── new item: one screen, the AI box is part of it ──────────────────────────
{
  const { page, errs } = await open('new');
  ok(await page.$('#ie-aibox .cdx-aib') !== null, 'new: the AI box mounted inside the editor');
  ok(await page.$('#ie-aibox #ie-body') !== null, 'new: ONE content box, and the AI is attached to it');
  ok(await page.$$eval('textarea#ie-body', (e) => e.length) === 1, 'new: exactly one body field, not a raw box plus a body');
  ok(await page.$('#aib-verbatim') !== null, 'new: the keep-raw checkbox is there');
  ok(await page.$('#aib-pick') !== null, 'new: the AI chooser caret is there');
  ok(await page.$('#ie-title') !== null, 'new: the title field is on the SAME screen');
  ok(await page.$('#ie-extras') !== null, 'new: the per-type extras are on the same screen');
  // The layout Élder approved: two columns with a grip. A single column is what he rejected.
  ok(await page.$('#ie-split') !== null, 'new: the two-column split is there');
  ok(await page.$('.cdx-ie-left') !== null && await page.$('.cdx-ie-right') !== null, 'new: BOTH panels exist');
  ok(await page.$('.cdx-rz-grip') !== null, 'new: the columns have a draggable grip');
  ok(await page.$('[data-pack="1"]') !== null, 'new: the Item|Pacote switch is in the header from the first frame');
  // The old flow had two modals; the merged one must not open a second.
  ok((await page.$$('.cdx-editor')).length === 1, 'new: exactly one editor on screen');
  ok(await page.$('#ie-crumbs .cdx-crumb') === null, 'new: no breadcrumb at the root level');
  ok(await page.$('#ie-delete') === null, 'new: nothing to delete before it exists');
  ok(await page.$eval('#ie-refazer-btn', (el) => el.hidden) === true, 'new: Refazer stays hidden until an AI pass');
  ok(errs.length === 0, 'new: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'editor-new');
  await page.close();
}

// ── edit: the SAME screen, fields filled, AI box still present ──────────────
{
  const { page, errs } = await open('edit');
  ok(await page.$('#ie-aibox .cdx-aib') !== null, 'edit: the AI box is present too (it never was before)');
  ok(await page.$eval('#ie-title', (el) => el.value) === 'Prompt: Resumo Preparatório', 'edit: the title arrived filled');
  ok(await page.$eval('#aib-verbatim', (el) => el.checked) === true, 'edit: a prompt reads back as raw');
  ok(await page.$('#ie-delete') !== null, 'edit: the item can be deleted from this screen');
  ok((await page.$eval('.cdx-editor-title', (el) => el.textContent)).indexOf('item') >= 0,
    'edit: the header says WHAT it is');
  await page.click('#ie-delete');
  ok(await page.evaluate(() => window.__deleted) === 11, 'edit: delete hands the item to the host, confirm and all');
  ok(errs.length === 0, 'edit: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'editor-edit');
  await page.close();
}

// ── bundle: the member list belongs to the bundle family ────────────────────
{
  const { page, errs } = await open('bundle');
  await page.waitForSelector('#ie-members .cdx-mem-row', { timeout: 5000 });
  ok(await page.$('#ie-members') !== null, 'bundle: the member list mounted');
  ok(await page.$('.cdx-ie-right #ie-members') !== null, 'bundle: the member list is in the RIGHT panel');
  ok(await page.$('#ie-body') !== null, 'bundle: the intro text field is there');
  ok(await page.$('#ie-zip-intro') !== null, 'bundle: the ".zip" choice sits next to the box it governs');
  ok((await page.$eval('.cdx-editor-title', (el) => el.textContent)).indexOf('pacote') >= 0,
    'bundle: the header says it is a package');
  ok(await page.$('#ie-mem-add') !== null, 'bundle: "+ adicionar existente" is a deliberate action');
  ok(await page.$('#ie-mem-new') !== null, 'bundle: "+ criar aqui" is there too');
  ok(await page.$eval('.cdx-mem-picker', (el) => el.style.display) === 'none',
    'bundle: the archive picker starts closed, so the list you are building owns the screen');
  await page.click('#ie-mem-add');
  ok(await page.$eval('.cdx-mem-picker', (el) => el.style.display) !== 'none', 'bundle: and it opens on demand');

  // Switching to a non-bundle type must swap the block, which is the part that silently breaks.
  // With members inside it also has to ASK first (the dialog handler above answers yes).
  await page.click('[data-val="prompt"]');
  await page.waitForTimeout(250);
  ok(await page.$('#ie-members') === null, 'bundle -> prompt: the member list went away with the type');
  await page.click('[data-val="pasta"]');
  await page.waitForTimeout(250);
  ok(await page.$('#ie-members') !== null, 'prompt -> bundle: and it came back');
  ok(errs.length === 0, 'bundle: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'editor-bundle');
  await page.close();
}

// ── the indent moves in BLOCKS ──────────────────────────────────────────────
// Élder 2026-08-07: "se eu tiro a indentação do terceiro item, todos que vêm depois que estão
// indentados nele devem perder indentação igual". The pure engine was tested and the screen still
// assigned the number by hand, so this checks the CLICK, not the function.
{
  const { page, errs } = await open('bundle');
  await page.waitForSelector('#ie-members .cdx-mem-row', { timeout: 5000 });
  const indents = () => page.$$eval('#ie-members .cdx-mem-row', (rows) => rows.map((r) => r.dataset.indent));
  ok(JSON.stringify(await indents()) === '["0","1","1"]', 'blocks: the seeded steps are 0, 1, 1');
  // The FIRST row cannot be indented: it has nothing above it to sit under.
  await page.click('#ie-members .cdx-mem-row:nth-child(1)');
  ok(await page.$eval('.cdx-ie-bar [data-act="in"]', (b) => b.disabled) === true,
    'blocks: with row 1 selected, the indent action is dead, because it has nothing above it');
  // Row 2 cannot go deeper either: it is already one step past the row above it, and skipping a
  // step is exactly what the rule forbids.
  await page.click('#ie-members .cdx-mem-row:nth-child(2)');
  ok(await page.$eval('.cdx-ie-bar [data-act="in"]', (b) => b.disabled) === true,
    'blocks: no row may skip a step, so the action is dead rather than lying');
  // Row 3 CAN, because row 2 is at step 1. That puts row 3 INSIDE row 2's block.
  await page.click('#ie-members .cdx-mem-row:nth-child(3)');
  await page.click('.cdx-ie-bar [data-act="in"]');
  await page.waitForTimeout(120);
  ok(JSON.stringify(await indents()) === '["0","1","2"]', 'blocks: row 3 went under row 2');
  // Now pull row 2 out. Row 3 is inside it, so it has to come along: this is the whole rule.
  await page.click('#ie-members .cdx-mem-row:nth-child(2)');
  await page.click('.cdx-ie-bar [data-act="out"]');
  await page.waitForTimeout(120);
  ok(JSON.stringify(await indents()) === '["0","0","1"]',
    'blocks: pulling a row out brings everything inside it along');
  ok(errs.length === 0, 'blocks: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await page.close();
}

// ── stepping INTO a member, and coming back with what you typed ─────────────
{
  const { page, errs } = await open('bundle');
  await page.waitForSelector('#ie-members .cdx-mem-row', { timeout: 5000 });
  await page.fill('#ie-body', 'introducao editada no pacote');
  await page.click('#ie-members .cdx-mem-row:nth-child(1)');
  await page.click('.cdx-ie-bar [data-act="open"]');
  await page.waitForSelector('#ie-crumbs .cdx-crumb', { timeout: 5000 });
  ok((await page.$$('#ie-crumbs .cdx-crumb')).length === 2, 'nav: the breadcrumb shows both levels');
  ok(await page.$eval('#ie-title', (el) => el.value) === 'Prompt: Resumo Preparatório', 'nav: the member opened in the SAME screen');
  ok(await page.$('#ie-back') !== null, 'nav: one level down, Cancel becomes "back to the package"');
  ok(await page.$('#ie-delete') === null, 'nav: deleting is a root-level action, not an inside-the-package one');
  await page.fill('#ie-title', 'Prompt renomeado');
  await page.click('#ie-back');
  await page.waitForSelector('#ie-members .cdx-mem-row', { timeout: 5000 });
  ok(await page.$eval('#ie-body', (el) => el.value) === 'introducao editada no pacote',
    'nav: coming back kept the package intro (leaving a member never discards)');
  const firstTitle = await page.$eval('#ie-members .cdx-mem-row:nth-child(1) .cdx-mem-title', (el) => el.textContent);
  ok(firstTitle.indexOf('Prompt renomeado') >= 0, 'nav: the row shows the new name, unsaved and all');

  // ONE Save writes the member AND the package AND the member list.
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.click('#ie-save');
  await page.waitForTimeout(400);
  const acts = await page.evaluate(() => window.__calls.map((c) => c.action));
  ok(acts.filter((a) => a === 'ct_update_item').length === 2, 'save: both the package and the touched member were written');
  ok(acts.indexOf('ct_set_item_members') > acts.lastIndexOf('ct_update_item'),
    'save: the member list is written last, once every member exists');
  ok(await page.evaluate(() => !!window.__saved), 'save: the host was told');
  ok(errs.length === 0, 'nav: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'editor-nested');
  await page.close();
}

// ── "+ criar aqui": a member born inside the package ────────────────────────
{
  const { page, errs } = await open('bundle');
  await page.waitForSelector('#ie-members .cdx-mem-row', { timeout: 5000 });
  await page.click('#ie-mem-new');
  await page.waitForSelector('#ie-crumbs .cdx-crumb', { timeout: 5000 });
  ok(await page.$eval('#ie-title', (el) => el.value) === '', 'create-here: the new level opens blank');
  await page.fill('#ie-title', 'Nascido dentro');
  await page.click('#ie-back');
  await page.waitForSelector('#ie-members .cdx-mem-row', { timeout: 5000 });
  const rows = await page.$$eval('#ie-members .cdx-mem-row .cdx-mem-title', (els) => els.map((e) => e.textContent));
  ok(rows.length === 4, 'create-here: the package shows what it is about to contain');
  ok(rows[3].indexOf('Nascido dentro') >= 0, 'create-here: with the name just given');
  ok(rows[3].indexOf('não salvo') >= 0, 'create-here: and it SAYS it is not saved yet');

  await page.evaluate(() => { window.__calls.length = 0; });
  await page.click('#ie-save');
  await page.waitForTimeout(400);
  const calls = await page.evaluate(() => window.__calls);
  const acts = calls.map((c) => c.action);
  ok(acts.indexOf('ct_create_item') >= 0, 'create-here: the new item was created');
  ok(acts.indexOf('ct_create_item') < acts.indexOf('ct_set_item_members'),
    'create-here: created BEFORE the list that names it');
  const members = calls.find((c) => c.action === 'ct_set_item_members');
  ok(!!members && members.children.some((c) => Number(c.id) === 999),
    'create-here: the temporary key was swapped for the real id');
  ok(errs.length === 0, 'create-here: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'editor-create-here');
  await page.close();
}

// ── an item that gains company becomes the FIRST ITEM of a new package ─────
// Élder, twice: as the model (2026-08-06, "um item que ganha companhia não vira pai, nasce um
// pacote que segura os dois") and as the screen (2026-08-11, "when a second item is added to a
// normal item both of them become items of the package"). Converting the item in place would
// silently turn a prompt somebody wrote into an empty folder.
{
  const { page, errs } = await open('new');
  await page.fill('#ie-title', 'Prompt que eu escrevi');
  await page.fill('#ie-body', 'o corpo do prompt');
  await page.click('[data-pack="1"]');
  await page.waitForSelector('#ie-members .cdx-mem-row', { timeout: 5000 });
  const rows = await page.$$eval('#ie-members .cdx-mem-row .cdx-mem-title', (els) => els.map((e) => e.textContent));
  ok(rows.length === 1, 'demote: the package is born holding exactly one thing');
  ok(rows[0].indexOf('Prompt que eu escrevi') >= 0, 'demote: and that thing is the item you wrote');
  ok(await page.$eval('#ie-title', (el) => el.value) === '', 'demote: the PACKAGE gets its own blank title');
  ok((await page.$eval('#ie-body', (el) => el.value)) === '', 'demote: and its own blank description');
  ok(await page.$('#ie-crumbs .cdx-crumb') === null, 'demote: no breadcrumb, the package is not inside the item');

  await page.fill('#ie-title', 'Meu pacote');
  await page.evaluate(() => { window.__calls.length = 0; });
  await page.click('#ie-save');
  await page.waitForTimeout(500);
  const calls = await page.evaluate(() => window.__calls);
  const creates = calls.filter((c) => c.action === 'ct_create_item');
  ok(creates.length === 2, 'demote+save: TWO records are written, the item and the package');
  ok(creates.some((c) => c.title === 'Prompt que eu escrevi'), 'demote+save: the item kept being itself');
  ok(creates.some((c) => c.title === 'Meu pacote'), 'demote+save: and the package is its own record');
  const members = calls.find((c) => c.action === 'ct_set_item_members');
  ok(!!members && members.children.length === 1, 'demote+save: the package lists the item');
  ok(calls.indexOf(members) > calls.lastIndexOf(creates[creates.length - 1]),
    'demote+save: the list is written after both exist');
  ok(errs.length === 0, 'demote: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await shot(page, 'editor-demote');
  await page.close();
}

await browser.close();
srv.close();
console.log(fails.length ? '\nFAILED: ' + fails.length : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
