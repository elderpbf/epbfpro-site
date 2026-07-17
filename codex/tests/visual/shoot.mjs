// Screenshots the visual harness (harness.html) — the eye that node:test does not have.
//
//   node codex/tests/visual/shoot.mjs <outDir> [mod]
//
// Playwright is NOT a repo dependency on purpose: this repo IS the deploy artifact
// (`wrangler pages deploy .` uploads the directory), so a node_modules/ here would ship
// to the CDN. Install it anywhere and point CDX_PLAYWRIGHT at that node_modules:
//   npm i playwright --prefix /tmp/pw
//   CDX_PLAYWRIGHT=/tmp/pw/node_modules node codex/tests/visual/shoot.mjs ./shots
// (NODE_PATH does NOT work here — ESM ignores it.)
//
// Serves the repo root over http rather than file:// because ES modules + import maps +
// localStorage all behave differently on the file: origin.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';

async function loadPlaywright() {
  try { return await import('playwright'); } catch (_) { /* not a local dep, by design */ }
  const p = process.env.CDX_PLAYWRIGHT;
  if (!p) throw new Error('playwright not found — set CDX_PLAYWRIGHT to a node_modules holding it (see the header)');
  // Reached by file URL, playwright's CJS entry lands under .default rather than as named exports.
  const m = await import(pathToFileURL(join(p, 'playwright', 'index.js')).href);
  return m.chromium ? m : m.default;
}

const ROOT = fileURLToPath(new URL('../../..', import.meta.url)); // repo root (codex/tests/visual -> up 3)
const outDir = process.argv[2] || './shots';
const mod = process.argv[3] || 'cohorts';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    const p = normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^([/\\])+/, '');
    const buf = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(buf);
  } catch (_) { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
mkdirSync(outDir, { recursive: true });

// Each shot is a state a regression would hide in. Named after what it must prove.
async function shoot(name, width, height, act) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base + '/codex/tests/visual/harness.html?mod=' + mod);
  await page.waitForFunction(() => window.__harnessReady === true, null, { timeout: 8000 })
    .catch(() => { throw new Error(name + ': the list never painted (harness stuck on its loading state)'); });
  if (act) await act(page);
  await page.screenshot({ path: join(outDir, name + '.png') });
  // A screenshot of a page that threw is a screenshot of a lie; fail loud instead.
  if (errs.length) throw new Error(name + ': page errors:\n' + errs.join('\n'));
  await page.close();
  console.log('  ✓ ' + name);
}

const nav = '.cdx-cohorts-listpane';
try {
  // Desktop, rail pinned open (the load state: no turma picked yet).
  await shoot('01-pinned-open', 1440, 900);

  // A client expanded — the accordion, the avatar/initials, the phase accent bars.
  await shoot('02-client-open', 1440, 900, async (p) => {
    await p.click('#cdx-cohorts-list [data-client-slug="tjmg"] .cdx-cg-head, #cdx-cohorts-list [data-sec="tjmg"] .cdx-rail-sec-h');
    await p.waitForTimeout(200);
  });

  // Picking a turma: the rail unpins and hides, the dossiê takes over. This is the
  // exact moment Élder described ("depois que eu escolho uma turma ela se esconde").
  await shoot('03-turma-picked-rail-hidden', 1440, 900, async (p) => {
    await p.click('#cdx-cohorts-list [data-client-slug="tjmg"] .cdx-cg-head, #cdx-cohorts-list [data-sec="tjmg"] .cdx-rail-sec-h');
    await p.waitForTimeout(150);
    await p.click('#cdx-cohorts-list [data-turma-slug="turma-1"], #cdx-cohorts-list [data-id$="/turma-1"]');
    await p.mouse.move(700, 500);
    await p.waitForTimeout(1900);   // past the 1500ms hide delay
  });

  // The edge reveal bringing it back (clientX <= 6).
  await shoot('04-edge-reveal', 1440, 900, async (p) => {
    await p.click('#cdx-cohorts-list [data-client-slug="tjmg"] .cdx-cg-head, #cdx-cohorts-list [data-sec="tjmg"] .cdx-rail-sec-h');
    await p.waitForTimeout(150);
    await p.click('#cdx-cohorts-list [data-turma-slug="turma-1"], #cdx-cohorts-list [data-id$="/turma-1"]');
    await p.mouse.move(700, 500);
    await p.waitForTimeout(1900);
    await p.mouse.move(2, 500);
    await p.waitForTimeout(300);
  });

  // Hover on a row — the bespoke CSS previews the SAME teal as the selected row;
  // the generic rail CSS uses --background. A silent divergence if nobody looks.
  await shoot('05-row-hover', 1440, 900, async (p) => {
    await p.click('#cdx-cohorts-list [data-client-slug="tjmg"] .cdx-cg-head, #cdx-cohorts-list [data-sec="tjmg"] .cdx-rail-sec-h');
    await p.waitForTimeout(150);
    await p.hover('#cdx-cohorts-list [data-turma-slug="turma-0"], #cdx-cohorts-list [data-id$="/turma-0"]');
    await p.waitForTimeout(200);
  });

  // Phone: the off-canvas drawer's own breakpoint (<=700px).
  await shoot('06-phone', 390, 844);

  // A client with no turmas yet: its section must say so, not collapse to nothing.
  await shoot('07-client-no-turmas', 1440, 900, async (p) => {
    await p.click('#cdx-cohorts-list [data-client-slug="vazio"] .cdx-cg-head, #cdx-cohorts-list [data-sec="vazio"] .cdx-rail-sec-h');
    await p.waitForTimeout(200);
  });

  // The head's + must open the nova-turma form and NOT toggle the client under it. Both halves
  // are asserted, not just shot: the acts corner sits inside the rail's toggle target, so
  // "it also collapsed the client" is a silent, plausible regression a screenshot alone shows
  // only if you happen to look at the right pixels.
  await shoot('08-head-action-new-turma', 1440, 900, async (p) => {
    await p.click('#cdx-cohorts-list [data-client-slug="tjmg"] .cdx-cg-head, #cdx-cohorts-list [data-sec="tjmg"] .cdx-rail-sec-h');
    await p.waitForTimeout(150);
    await p.click('#cdx-cohorts-list [data-action="new-turma"][data-client-slug="tjmg"]');
    await p.waitForTimeout(250);
    const modal = await p.locator('.cdx-modal-backdrop').count();
    if (!modal) throw new Error('the head + did not open the nova-turma form');
    const stillOpen = await p.locator('#cdx-cohorts-list [data-sec="tjmg"].is-open, #cdx-cohorts-list [data-client-slug="tjmg"].is-open').count();
    if (!stillOpen) throw new Error('the head + ALSO toggled the client shut (the rail swallowed the acts click)');
  });
  console.log('shots -> ' + outDir);
} finally {
  await browser.close();
  server.close();
}
