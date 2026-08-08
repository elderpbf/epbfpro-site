// Browser check for the merged item editor. node:test has no eye and no DOM: it cannot tell
// whether the AI box actually mounted, whether the type block swapped when the type changed, or
// whether the member list appeared for a bundle. This can.
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

async function open(mode) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto('http://127.0.0.1:8794/codex/tests/visual/editor-harness.html?mode=' + mode);
  await page.waitForSelector('.cdx-editor', { timeout: 10000 });
  return { page, errs };
}

// ── new item: one screen, the AI box is part of it ──────────────────────────
{
  const { page, errs } = await open('new');
  ok(await page.$('#ie-aibox .cdx-aib') !== null, 'new: the AI box mounted inside the editor');
  ok(await page.$('#aib-raw') !== null, 'new: the raw-content textarea is there');
  ok(await page.$('#aib-verbatim') !== null, 'new: the keep-raw checkbox is there');
  ok(await page.$('#aib-pick') !== null, 'new: the AI chooser caret is there');
  ok(await page.$('#ie-title') !== null, 'new: the title field is on the SAME screen');
  ok(await page.$('#ie-type-block') !== null, 'new: the type block is on the same screen');
  // The old flow had two modals; the merged one must not open a second.
  ok((await page.$$('.cdx-editor')).length === 1, 'new: exactly one editor on screen');
  ok(errs.length === 0, 'new: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await page.screenshot({ path: process.argv[2] ? process.argv[2] + '/editor-new.png' : 'editor-new.png', fullPage: true });
  await page.close();
}

// ── edit: the SAME screen, fields filled, AI box still present ──────────────
{
  const { page, errs } = await open('edit');
  ok(await page.$('#ie-aibox .cdx-aib') !== null, 'edit: the AI box is present too (it never was before)');
  ok(await page.$eval('#ie-title', (el) => el.value) === 'Prompt: Resumo Preparatório', 'edit: the title arrived filled');
  ok(await page.$eval('#aib-verbatim', (el) => el.checked) === true, 'edit: a prompt reads back as raw');
  ok(errs.length === 0, 'edit: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await page.screenshot({ path: process.argv[2] ? process.argv[2] + '/editor-edit.png' : 'editor-edit.png', fullPage: true });
  await page.close();
}

// ── bundle: the member list belongs to the bundle family ────────────────────
{
  const { page, errs } = await open('bundle');
  ok(await page.$('#ie-members') !== null, 'bundle: the member list mounted');
  ok(await page.$('#ie-body') !== null, 'bundle: the intro text field is there');
  // Switching to a non-bundle type must swap the block, which is the part that silently breaks.
  await page.click('[data-val="prompt"]');
  await page.waitForTimeout(200);
  ok(await page.$('#ie-members') === null, 'bundle -> prompt: the member list went away with the type');
  await page.click('[data-val="pasta"]');
  await page.waitForTimeout(200);
  ok(await page.$('#ie-members') !== null, 'prompt -> bundle: and it came back');
  ok(errs.length === 0, 'bundle: no page errors' + (errs.length ? ' -> ' + errs.join(' | ') : ''));
  await page.screenshot({ path: process.argv[2] ? process.argv[2] + '/editor-bundle.png' : 'editor-bundle.png', fullPage: true });
  await page.close();
}

await browser.close();
srv.close();
console.log(fails.length ? '\nFAILED: ' + fails.length : '\nall checks passed');
process.exit(fails.length ? 1 : 0);
