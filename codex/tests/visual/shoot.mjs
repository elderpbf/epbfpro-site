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
const SHOTS = { cohorts: shootCohorts, sessions: shootSessions, lessons: shootLessons };
if (!SHOTS[mod]) { console.error('no shot list for module ' + mod); process.exit(1); }

// The rails clear the chrome with a hardcoded `padding-top: 94px`. If the real topbar + sub-row
// is not exactly 94px tall, the rail either floats below it (Élder: "não chega até a barra
// superior; tem um gap") or slides under it. MEASURE it, never eyeball it: a few px of gap is
// invisible in a screenshot review and obvious on a real screen.
async function assertFlushWithChrome(p, railSel) {
  const gap = await p.evaluate((sel) => {
    const bar = document.querySelector('.bs-topbar');
    const rail = document.querySelector(sel);
    if (!bar || !rail) return null;
    // The rail's PAINTED top edge (its inner card), not the fixed box's padding edge.
    const inner = rail.querySelector('.cdx-rail') || rail;
    return Math.round(inner.getBoundingClientRect().top - bar.getBoundingClientRect().bottom);
  }, railSel);
  if (gap === null) throw new Error('could not measure: no .bs-topbar or ' + railSel);
  if (gap !== 0) throw new Error('the rail is ' + gap + 'px off the topbar (want 0, flush). ' + railSel);
}

async function shootCohorts() {
  // Desktop, rail pinned open (the load state: no turma picked yet).
  await shoot('01-pinned-open', 1440, 900, async (p) => {
    await assertFlushWithChrome(p, '.cdx-cohorts-listpane');
  });

  // The SAME check in 'bar' mode, where the chrome is ~29px taller. One hardcoded number cannot
  // be right for both, which is the whole bug; --cdx-chrome-h has to hold in each.
  await shoot('10-flush-in-subtab-bar-mode', 1440, 900, async (p) => {
    await assertFlushWithChrome(p, '.cdx-cohorts-listpane');
  }, '&subtab=bar');

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

  // Load state: sidebar pinned open, title + `+` on top, the picker, the live dot. The create
  // panel starts COLLAPSED, so the list is what the picker shows.
  await shoot('01-pinned-open', 1440, 900, async (p) => {
    await assertFlushWithChrome(p, '.cdx-sessions-sidebar');
    if (await p.locator('#cdx-sessions-create').count()) throw new Error('the create panel should start collapsed');
  });

  // The + expands the head in place (no modal) and puts the cursor in the field: + then type
  // then Enter, never leaving the rail. That IS the reason it is not a modal.
  await shoot('07-create-panel-expanded', 1440, 900, async (p) => {
    await p.click('[data-rail-add]');
    await p.waitForTimeout(200);
    if (!await p.locator('#cdx-sessions-create').count()) throw new Error('the + did not expand the head panel');
    const focused = await p.evaluate(() => document.activeElement && document.activeElement.id);
    if (focused !== 'cdx-sessions-title') throw new Error('the + did not focus the field, it focused: ' + focused);
    // Toggling it back must collapse, not stack a second form.
    await p.click('[data-rail-add]');
    await p.waitForTimeout(150);
    if (await p.locator('#cdx-sessions-create').count()) throw new Error('the + did not collapse the panel again');
    await p.click('[data-rail-add]');
    await p.waitForTimeout(150);
  });

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
    await p.click('[data-rail-add]');
    await p.fill('#cdx-sessions-title', 'Aula 7: prompt engineering');
    await card(p, 1).click();          // -> _select -> _renderList -> the head panel is rebuilt
    await p.waitForTimeout(200);
    await p.mouse.move(2, 500);        // bring the (now unpinned) rail back to see the form
    await p.waitForTimeout(300);
    const v = await p.inputValue('#cdx-sessions-title');
    if (v !== 'Aula 7: prompt engineering') throw new Error('a re-render ate the half-typed title: got "' + v + '"');
  });

  // Phone. Sessões is the screen Élder named: it has NO hamburger at all today.
  await shoot('05-phone', 390, 844);
}

// Lessons: the one screen that does NOT adopt the rail's markup — its look is the product and
// is frozen, so it keeps its own cards and only the drag engine is shared
// (js/pointer-reorder.js). That makes "it still looks the same" true by construction, and moves
// the whole risk onto the drag, which is what these shots hammer.
//
// A REAL pointer drag (mouse.down -> move -> up), never a synthetic event: the module has no
// grip, so "a press under 4px is still a click, past it is a drag" is the entire contract, and
// only a real pointer stream can tell those two apart. Source-regex tests are what this track
// exists to stop trusting.
async function shootLessons() {
  const NO_FOCUS = '&focus=0';
  const secSel = (k) => '.cdx-lessons-sidebar-body [data-sec-key="' + k + '"]';
  const order = (p) => p.$$eval('.cdx-lessons-sidebar-body [data-sec-key]', (els) =>
    els.map((e) => e.getAttribute('data-sec-key')));
  const stored = (p, k) => p.evaluate((key) => localStorage.getItem(key), k);

  // Open `key` if it is not already. NOT a blind click: the accordion opens one section at
  // mount (favourites when something is starred, else items), so a click "to make sure" is as
  // likely to shut it. Idempotent setup, or the test fails on its own fixture.
  async function ensureOpen(p, key) {
    if (await p.locator(secSel(key) + '.is-collapsed').count()) {
      await p.click(secSel(key) + ' .cdx-lesson-section-head');
      await p.waitForTimeout(150);
    }
  }

  // Press on `pressSel`, drop onto `toSel`, in steps (one jump would skip the 4px threshold
  // check and land as a single move the module could never see travelling).
  //
  // pressSel is the HANDLE, not the thing that moves: a section drags by its head, and its
  // box spans head + body, so pressing at its centre lands on a card and starts nothing.
  // That is the module's rule, not a test detail (handleSel), so the test states it.
  async function drag(p, pressSel, toSel, edge = 'above') {
    const a = await p.locator(pressSel).boundingBox();
    const b = await p.locator(toSel).boundingBox();
    if (!a || !b) throw new Error('drag: missing ' + pressSel + ' or ' + toSel);
    const y = edge === 'above' ? b.y + b.height * 0.25 : b.y + b.height * 0.75;
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await p.mouse.down();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + 12, { steps: 4 });
    await p.mouse.move(b.x + b.width / 2, y, { steps: 12 });
    await p.mouse.up();
    await p.waitForTimeout(150);
  }

  // The resting screen. Nothing stored = the order Élder designed, untouched by this work.
  await shoot('01-sidebar-default-order', 1440, 900, async (p) => {
    const got = await order(p);
    const want = ['llm', 'external', 'labs', 'items', 'drive', 'apostila', 'tarefas']
      .filter((k) => got.includes(k));
    if (got.join(',') !== want.join(',')) {
      throw new Error('the default section order moved:\n  got:  ' + got.join(',') + '\n  want: ' + want.join(','));
    }
  }, NO_FOCUS);

  // Favoritos renders (and in the STORED order, not vault order — the list is what a drag
  // rewrites, so rendering it any other way would show the drag being ignored).
  await shoot('02-favorites-section', 1440, 900, async (p) => {
    const ids = await p.$$eval('.cdx-lesson-section--favorites .cdx-lesson-sub',
      (els) => els.map((e) => e.getAttribute('data-item-id')));
    if (ids.join(',') !== '105,101,103') throw new Error('favourites are not in stored order: ' + ids.join(','));
  }, NO_FOCUS + '&favs=105,101,103');

  // THE section drag. Drag `items` above `llm` and it must stay there AND persist.
  await shoot('03-section-drag-persists', 1440, 900, async (p) => {
    await drag(p, secSel('items') + ' .cdx-lesson-section-head', secSel('llm'), 'above');
    const got = await order(p);
    if (got.indexOf('items') > got.indexOf('llm')) {
      throw new Error('the section did not move: ' + got.join(','));
    }
    const raw = await stored(p, 'cv_section_order_v1');
    if (!raw) throw new Error('the drag did not persist (cv_section_order_v1 is empty)');
    const saved = JSON.parse(raw);
    if (saved.indexOf('items') > saved.indexOf('llm')) throw new Error('persisted the OLD order: ' + raw);
    // The sections that were not on screen must still be in there (see applyVisibleOrder).
    for (const k of ['preset', 'favorites']) {
      if (!saved.includes(k)) throw new Error('the drag dropped the off-screen section "' + k + '": ' + raw);
    }
  }, NO_FOCUS);

  // The bug the swallowed click exists for: a section head toggles the accordion on click, and
  // a drag ENDS in a click on that head. Left alone, every drop collapses the section it just
  // moved. Assert the section is still open, not merely that it moved.
  await shoot('04-drop-does-not-collapse', 1440, 900, async (p) => {
    await ensureOpen(p, 'items');
    const openBefore = await p.locator(secSel('items') + ':not(.is-collapsed)').count();
    if (!openBefore) throw new Error('setup: items did not open');
    await drag(p, secSel('items') + ' .cdx-lesson-section-head', secSel('llm'), 'above');
    const openAfter = await p.locator(secSel('items') + ':not(.is-collapsed)').count();
    if (!openAfter) throw new Error('the drop ALSO toggled the section shut (the click was not swallowed)');
  }, NO_FOCUS);

  // The other half of the same contract: under the threshold it is STILL a click. A drag engine
  // that eats the click breaks selecting an item, which is the sidebar's whole job.
  await shoot('05-click-still-selects', 1440, 900, async (p) => {
    // apostila, not items: the Items section sub-groups by type and every type group SEEDS
    // ITSELF COLLAPSED, so its cards are not on screen to click. apostila renders cards directly.
    await ensureOpen(p, 'apostila');
    const card = p.locator(secSel('apostila') + ' .cdx-lesson-sub').first();
    await card.click();
    await p.waitForTimeout(250);
    if (!await p.locator('.cdx-lesson-sub.is-active').count()) {
      throw new Error('a plain click no longer selects the item (the drag engine ate it)');
    }
  }, NO_FOCUS);

  // THE favourites drag: reorder inside Favoritos, and it persists.
  await shoot('06-favorite-drag-persists', 1440, 900, async (p) => {
    const favSel = (id) => '.cdx-lesson-section--favorites [data-item-id="' + id + '"]';
    await drag(p, favSel('103'), favSel('105'), 'above');
    const raw = await stored(p, 'cv_favorites_v1');
    const saved = JSON.parse(raw);
    if (saved.indexOf('103') > saved.indexOf('105')) throw new Error('the favourite did not move: ' + raw);
    if (!saved.includes('lab:x')) throw new Error('the drag unstarred the favourite that section never showed: ' + raw);
  }, NO_FOCUS + '&favs=105,101,lab:x,103');

  // A card in a NON-favourite section must not be draggable: the favourites instance is scoped
  // by listSel, and if that scoping fails it silently rewrites the favourites list from a
  // section it has no business reading.
  await shoot('07-non-favorite-card-not-draggable', 1440, 900, async (p) => {
    await ensureOpen(p, 'apostila');
    const cards = p.locator(secSel('apostila') + ' .cdx-lesson-sub');
    if (await cards.count() < 2) throw new Error('setup: apostila needs 2+ cards to attempt a drag');
    const a = await cards.nth(1).boundingBox();
    const b = await cards.nth(0).boundingBox();
    await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await p.mouse.down();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height * 0.25, { steps: 12 });
    await p.mouse.up();
    await p.waitForTimeout(150);
    const raw = await stored(p, 'cv_favorites_v1');
    if (JSON.parse(raw).join(',') !== '105,101,103') {
      throw new Error('dragging a card OUTSIDE Favoritos rewrote the favourites list: ' + raw);
    }
  }, NO_FOCUS + '&favs=105,101,103');

  // Phone: below 700px focus mode is skipped anyway and the sidebar is the drawer.
  await shoot('08-phone', 390, 844, null, NO_FOCUS);
}

try {
  await SHOTS[mod]();
  console.log('shots -> ' + outDir);
} finally {
  await browser.close();
  server.close();
}
