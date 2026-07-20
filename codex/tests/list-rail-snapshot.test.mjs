// The regression gate for the list-rail grouping core (track-41).
//
// The core was generalized to N levels so a future consumer with 3+ collapsible levels does not
// fork its own (Élder 2026-07-17: "temos que poder aceitar, senão... cada um faz do seu jeito").
// That core is live on 10 screens, and the risky configs are exactly the ones the visual harness
// does NOT cover (courses' editable sections + cross-section drag; the flat list; the loose
// bucket). css/list-rail.css is untouched by the refactor, so **identical HTML means identical
// pixels** — freezing the markup is a complete gate here, and stricter than a screenshot.
//
// Snapshots were captured from the PRE-refactor module and must not move. If one changes:
// either you regressed a live rail, or the change is intended — in which case eyeball the diff
// against the real screen FIRST, then update the file deliberately, never with --update on faith.
//
//   node --test tests/list-rail-snapshot.test.mjs          # verify
//   CDX_SNAP_WRITE=1 node --test tests/list-rail-snapshot.test.mjs   # re-capture (deliberate!)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SHAPES, makeEl } from './list-rail-shapes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SNAP = join(here, 'fixtures', 'list-rail-snapshots.json');
const { mountRail } = await import('../js/list-rail.js');

function renderShape(cfg) {
  const el = makeEl();
  // autohide binds document-level listeners; the shapes here do not use it, but keep the stub
  // honest rather than letting a future shape blow up cryptically.
  const prevDoc = global.document;
  if (prevDoc === undefined) global.document = makeEl();
  try {
    mountRail(el, cfg).render();
    return el.innerHTML;
  } finally {
    if (prevDoc === undefined) delete global.document;
  }
}

const write = process.env.CDX_SNAP_WRITE === '1';
const stored = (!write && existsSync(SNAP)) ? JSON.parse(readFileSync(SNAP, 'utf8')) : {};
const fresh = {};

for (const shape of SHAPES) {
  test('markup is frozen — ' + shape.name, () => {
    const html = renderShape(shape.cfg);
    fresh[shape.name] = html;
    if (write) return;
    assert.ok(shape.name in stored, 'no snapshot for this shape; re-capture with CDX_SNAP_WRITE=1');
    assert.equal(html, stored[shape.name], 'the emitted markup MOVED for: ' + shape.name);
  });
}

test('every live shape is covered (a shape with no snapshot is an untested consumer)', () => {
  if (write) {
    writeFileSync(SNAP, JSON.stringify(fresh, null, 2) + '\n');
    console.log('snapshots written:', Object.keys(fresh).length);
    return;
  }
  assert.deepEqual(Object.keys(stored).sort(), SHAPES.map((s) => s.name).sort());
});
