// codex/questions/display.html — faithful port of go/display.html into Codex.
// Source-contract: the legacy backstage globals are gone, the codex-question
// element + pensoia-header (cdx) drive it, and the cp-qa-student values were
// copied value-for-value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const html = read('../questions/display.html');
const js = read('../questions/display.js');
const css = read('../questions/display.css');
const liveHost = read('../questions/live-host.js');

test('display page rides Codex chrome, no backstage CSS / legacy element globals', () => {
  assert.ok(!/backstage\/css\//.test(html), 'no backstage CSS');
  assert.ok(!/classpulse-question\.min\.js|question-renderer\.js|api-client\.js/.test(html), 'no legacy JS globals');
  assert.match(html, /\/codex\/css\/theme\.css/, 'codex theme');
  assert.match(html, /\/codex\/trilha\/css\/public-header\.css/, 'codex public header');
  assert.match(html, /\/codex\/questions\/display\.css/, 'display css');
  assert.match(html, /<pensoia-header mode="display"/, 'codex pensoia-header in display mode');
});

test('display boot uses the codex-question element + the codex-api facade', () => {
  assert.match(js, /from '\.\/question-element\.js'/, 'imports the codex-question element');
  assert.match(js, /createElement\(QTAG\)/, 'creates the codex-question element');
  assert.match(js, /\.onData =/, 'wires the scoped onData callback (no cpq-data bus)');
  assert.match(js, /cohorts\.lookupTurmaBySession/, 'resolves trilha via the facade');
  assert.ok(!/callWorker\s*\(/.test(js), 'never calls callWorker directly');
});

test('display.css copied the cp-qa-student values verbatim', () => {
  assert.match(css, /border-left: 6px solid #f59e0b/, 'card amber accent bar');
  assert.match(css, /font-size: clamp\(2\.2rem, 4\.5vw, 4rem\)/, 'question text size');
  assert.match(css, /background: rgba\(245,158,11,0\.10\)/, 'answer wrap tint');
});

test('the A−/A+ buttons zoom the whole display body, not the header controls', () => {
  // The zoom rides one container (.cdx-disp-main) so the A−/A+ buttons scale the entire
  // question surface as a block. The QR overlay scales its QR image + text blocks the same way.
  assert.match(css, /\.cdx-disp-main \{[^}]*zoom: var\(--ph-zoom, 1\)/, 'the question area zooms');
  assert.match(css, /\.cdx-disp-enroll-qr \{[^}]*zoom: var\(--ph-zoom, 1\)/, 'the QR image zooms');
  assert.match(css, /\.cdx-disp-enroll-info \{[^}]*zoom: var\(--ph-zoom, 1\)/, 'the QR overlay text zooms');
  // The header (pensoia-header) is a sibling OUTSIDE .cdx-disp-main, so its A−/A+, QR and
  // theme controls never scale — that is the whole point of zooming the body container.
  assert.match(html, /<pensoia-header[^>]*>[\s\S]*<div class="cdx-disp-main"/, 'header sits outside the zoomed body');
});

test('display shows the enrollment QR (no countdown) only while projected, via the shared control', () => {
  assert.match(html, /id="cdx-disp-enroll"/, 'has the enrollment overlay');
  assert.match(html, /display_enroll_title/, 'titled like the old trail QR (Sua trilha de aprendizado)');
  assert.match(js, /from '\.\.\/js\/enroll-control\.js'/, 'uses the shared enrollment-projection control');
  assert.match(js, /cohorts\.getEnrollment/, 'polls the shared enrollment state');
  assert.match(js, /isProjecting\(/, 'shows only while projected (open && qr_shown), via the shared helper');
  assert.match(js, /enrollQrSrc\(/, 'builds the QR image through the shared control');
  assert.ok(!/remainingSec|fmtRemain/.test(js), 'no countdown on the display — it lives on the session panel');
});

test('the display is a control surface: the header QR button drives the same projection as the panel', () => {
  // The QR control is the header code button (the old floating #cdx-disp-qr-toggle was removed).
  assert.match(js, /pensoia-header \.ph-code-btn[\s\S]*?addEventListener\('click', _toggleProjection\)/, 'header QR button toggles projection');
  assert.match(js, /toggleProjection\(/, 'toggles the same server state the host panel does');
  assert.doesNotMatch(html, /id="cdx-disp-qr-toggle"/, 'the floating bottom QR button is gone');
});

test('clicking the projected QR overlay dismisses it (like the qr-share modal backdrop)', () => {
  // Both the toggle button AND the overlay itself wire to the un-project handler,
  // so a click anywhere on the projected QR closes it.
  assert.match(js, /getElementById\('cdx-disp-enroll'\)[\s\S]*?addEventListener\('click', _toggleProjection\)/,
    'overlay click un-projects');
  assert.match(css, /\.cdx-disp-enroll \{[^}]*cursor: pointer/, 'overlay reads as clickable');
});

test('display shows the typed-entry URL + 4-digit code beside the QR', () => {
  assert.match(html, /cdx-disp-enroll-info/, 'QR + info two-column overlay');
  assert.match(html, /id="cdx-disp-enroll-url"/, 'has the URL element');
  assert.match(html, /display_enroll_lead/, 'the lead line');
  assert.match(js, /entrarUrl\(/, 'builds pensoia.com/trilha/<code> via the shared helper');
  assert.match(js, /enrollment_code/, 'reads the 4-digit code from the shared state');
});

test('the live host Display button points at the ported Codex page', () => {
  assert.match(liveHost, /\/codex\/questions\/display\.html\?code=/, 'updated _displayHref');
  assert.ok(!/\/go\/display\.html/.test(liveHost), 'no longer points at go/');
});
