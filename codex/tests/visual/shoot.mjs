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
async function shoot(name, width, height, act, query = '') {
  const page = await browser.newPage({ viewport: { width, height } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(base + '/codex/tests/visual/harness.html?mod=' + mod + query);
  await page.waitForFunction(() => window.__harnessReady === true, null, { timeout: 8000 })
    .catch(() => { throw new Error(name + ': the list never painted (harness stuck on its loading state)'); });
  if (act) await act(page);
  await page.screenshot({ path: join(outDir, name + '.png') });
  // A screenshot of a page that threw is a screenshot of a lie; fail loud instead.
  if (errs.length) throw new Error(name + ': page errors:\n' + errs.join('\n'));
  await page.close();
  console.log('  ✓ ' + name);
}

// Each module's shot list is its own function, so registering the next one (lessons) is
// adding a case here + a SRC entry in harness.html. Shots are named for what they must prove.
const SHOTS = { cohorts: shootCohorts, sessions: shootSessions };
if (!SHOTS[mod]) { console.error('no shot list for module ' + mod); process.exit(1); }

async function shootCohorts() {
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

  // THE refresh. Élder's complaint that started this: "all the time when i refresh it closes
  // everything and goes back to showing the list closed instead of continuing in the page i
  // was". Booting with LS_LAST set must reopen that turma — client section expanded, rail
  // unpinned, dossiê loaded — not the pinned empty prompt.
  await shoot('09-refresh-reopens-last-turma', 1440, 900, async (p) => {
    await p.mouse.move(700, 500);
    await p.waitForTimeout(1900);   // let the unpinned rail hide, proving it is NOT pinned
    const open = await p.locator('#cdx-cohorts-list [data-sec="tjmg"].is-open').count();
    if (!open) throw new Error('refresh: the restored turma\'s client section did not reopen');
    const on = await p.locator('#cdx-cohorts-list .cdx-rail-row.is-on[data-id="tjmg/turma-1"]').count();
    if (!on) throw new Error('refresh: the restored turma is not the selected row');
    const pinned = await p.locator('.cdx-three-pane.cdx-sm--open').count();
    if (pinned) throw new Error('refresh: the rail stayed pinned open instead of yielding to the dossiê');
  }, '&last=tjmg/turma-1');
}

// Sessões: a FLAT list, so the clean adoption — and the only screen with NO hamburger today.
async function shootSessions() {
  // Era-neutral (bespoke .cdx-session-card before, .cdx-rail-row after), and indexed via
  // locator().nth() — NOT by concatenating ':first-of-type' onto a comma list, which would
  // silently bind to the last selector only.
  const CARD = '#cdx-sessions-sidebar .cdx-session-card, #cdx-sessions-sidebar .cdx-rail-row';
  const card = (p, i) => p.locator(CARD).nth(i);

  // Load state: sidebar pinned open, the create form, the picker, the live dot.
  await shoot('01-pinned-open', 1440, 900);

  // Picking a session: the sidebar unpins and hides, the live host takes the main area.
  await shoot('02-session-picked-rail-hidden', 1440, 900, async (p) => {
    await card(p, 0).click();
    await p.mouse.move(700, 500);
    await p.waitForTimeout(1900);   // past the 1500ms hide delay
  });

  // The edge reveal bringing it back (clientX <= 6).
  await shoot('03-edge-reveal', 1440, 900, async (p) => {
    await card(p, 0).click();
    await p.mouse.move(700, 500);
    await p.waitForTimeout(1900);
    await p.mouse.move(2, 500);
    await p.waitForTimeout(300);
  });

  await shoot('04-card-hover', 1440, 900, async (p) => {
    await card(p, 1).hover();
    await p.waitForTimeout(200);
  });

  // Typing a title, then picking a session, is a REAL path that re-renders the list — and the
  // form is the rail's FOOTER now, which render() replaces wholesale. Without _newTitle backing
  // the input's value, the half-typed title vanishes under him. No test hook needed: the click
  // IS the trigger (_select -> _renderList -> rail.render).
  await shoot('06-typed-title-survives-rerender', 1440, 900, async (p) => {
    await p.fill('#cdx-sessions-title', 'Aula 7 — Prompt engineering');
    await card(p, 1).click();          // -> _select -> _renderList -> the footer is rebuilt
    await p.waitForTimeout(200);
    await p.mouse.move(2, 500);        // bring the (now unpinned) rail back to see the form
    await p.waitForTimeout(300);
    const v = await p.inputValue('#cdx-sessions-title');
    if (v !== 'Aula 7 — Prompt engineering') throw new Error('a re-render ate the half-typed title: got "' + v + '"');
  });

  // Phone. Sessões is the screen Élder named: it has NO hamburger at all today.
  await shoot('05-phone', 390, 844);
}

try {
  await SHOTS[mod]();
  console.log('shots -> ' + outDir);
} finally {
  await browser.close();
  server.close();
}
