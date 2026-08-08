// Contract test for the drag-reorder standardization (Phase A of the "organizar cursos"
// batch): every admin drag must route through the ONE shared js/reorder.js instead of a
// per-tab hand-rolled dragstart/dragover/drop. Guards against re-introducing the
// duplication the audit flagged. The sealed Slides editor keeps its own drag by design
// (SLIDES-EDITOR-INTERNAL) and is out of scope here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const RAW_DRAG = /addEventListener\(\s*['"]dragstart['"]/;

test('reorder.js exposes the shared capabilities every hand-rolled copy needed', () => {
  const src = read('js/reorder.js');
  assert.match(src, /opts\.canDrag/, 'canDrag predicate (mode-gated lists) supported');
  assert.match(src, /opts\.listSelector/, 'listSelector (rows nested under a stable container) supported');
});

// Phase A moved every hand-rolled drag onto the shared js/reorder.js. Phase C (track-21)
// then moves each rail onto the list-rail module, whose drag is Pointer-Events based
// (mobile-capable) and lives INSIDE the module — so a migrated surface no longer imports
// makeReorderable, it mounts the rail. Either way the invariant holds: NO surface
// hand-rolls a dragstart listener. Move a surface from PENDING to MIGRATED as it adopts
// the rail; when PENDING empties, js/reorder.js is retired (architecture/list-rail.md §2).
const PENDING_ON_REORDER_JS = ['questions/bank.js', 'questions/live-host.js'];
const MIGRATED_TO_LIST_RAIL = ['content/apostila.js', 'cohorts/cohorts.js'];

test('rails still on js/reorder.js use the shared helper (no hand-rolled dragstart)', () => {
  for (const f of PENDING_ON_REORDER_JS) {
    const src = read(f);
    assert.match(src, /import \{ makeReorderable \} from '\.\.\/js\/reorder\.js'/, f + ' imports makeReorderable');
    assert.ok(!RAW_DRAG.test(src), f + ' has no hand-rolled dragstart listener');
  }
});

test('rails migrated to the list-rail module mount it (Pointer-Events drag, no dragstart)', () => {
  for (const f of MIGRATED_TO_LIST_RAIL) {
    const src = read(f);
    assert.match(src, /import \{ mountRail \} from '\.\.\/js\/list-rail\.js'/, f + ' imports mountRail');
    assert.ok(!/makeReorderable/.test(src), f + ' no longer wires makeReorderable');
    assert.ok(!RAW_DRAG.test(src), f + ' has no hand-rolled dragstart listener');
  }
});

test('content/tarefas.js is the only admin drag still hand-rolled (folds into the list-rail module, Phase C)', () => {
  // Its cross-section move IS the sections capability the module standardizes; migrating
  // it standalone then again with the module would be the rework Élder wanted to avoid.
  assert.match(read('content/tarefas.js'), RAW_DRAG, 'tarefas still hand-rolled (documented deferral)');
});
