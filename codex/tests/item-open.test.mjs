// §26: one way to open an item, not two.
//
// Élder, 2026-08-17: *"this should not be two different components, they do the same thing, why
// are you duplicating functions... the solution is not to add the function to the second one, is
// to remove the duplication"*.
//
// The duplication had already produced a live defect, and that is what this file guards. sub.js
// overlaid the lab and interativo registries before rendering (the frontend registry is the truth
// and the database copy goes stale, §18); flat.js overlaid NEITHER. isOutrosItem excludes no
// labs, so the same lab opened from the Outros tab showed the stale description while the one
// opened inside its lesson showed the current one. Two components, two behaviours, one wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const openSrc = read('../trilha/js/item-open.js');
const subSrc = read('../trilha/js/sub.js');
const flatSrc = read('../trilha/js/flat.js');
const cards = [['sub', subSrc], ['flat', flatSrc]];

test('the fetch lives in ONE module', () => {
  assert.match(openSrc, /trail\.itemPublic\(/);
  for (const [name, src] of cards) {
    assert.ok(!/trail\.itemPublic\(/.test(src), `${name}.js does not fetch the item itself`);
    assert.match(src, /openItemInto\(/, `${name}.js opens through the shared module`);
  }
});

test('both tabs overlay the lab and interativo registries, because one of them did not', () => {
  assert.match(openSrc, /overlayLabItem\(data\.item\)/);
  assert.match(openSrc, /overlayInterativoItem\(data\.item\)/);
  for (const [name, src] of cards) {
    assert.ok(!/overlayLabItem|overlayInterativoItem/.test(src),
      `${name}.js holds no copy of its own to drift from`);
  }
});

test('choosing between a package and a plain item is decided in one place', () => {
  assert.match(openSrc, /isProjeto\(data\.item\)/);
  for (const [name, src] of cards) {
    assert.ok(!/isProjeto\(/.test(src), `${name}.js does not decide it again`);
    assert.ok(!/renderItem\(/.test(src), `${name}.js does not render it again`);
  }
});

test('what each card keeps is the part that genuinely differs', () => {
  // WHERE the body goes, and where the button is mounted. Nothing else.
  assert.match(subSrc, /insertBefore\(exp, sub\.nextSibling\)/, 'the sub-row body is a SIBLING');
  assert.match(flatSrc, /card\.appendChild\(body\)/, 'the flat body is a CHILD');
  assert.match(subSrc, /mountAction: \(fetched\) => injectActionButton\(sub, fetched, opts\)/);
  assert.match(flatSrc, /mountAction: \(fetched\) => mountFlatCardAction\(card, fetched\)/);
});

test('the lesson still travels with the request from the Aulas tab', () => {
  // §h: ct_get_item_public takes aula_number so a per-lesson member list can be selected. It is
  // honoured only when the item is bound to that lesson, so it selects a list, never unlocks one.
  assert.match(openSrc, /aula_number: o\.aulaNumber/);
  assert.match(subSrc, /aulaNumber: opts\.aulaNumber/);
});

test('a failure names the surface that failed, so the pill is still readable', () => {
  assert.match(openSrc, /o\.logTag/);
  assert.match(subSrc, /logTag: 'sub'/);
  assert.match(flatSrc, /logTag: 'flat'/);
});

test('neither card imports what it no longer uses', () => {
  assert.ok(!/from '\.\/api\.js'/.test(subSrc), 'sub.js dropped the trail facade');
  assert.ok(!/from '\.\/api\.js'/.test(flatSrc), 'flat.js dropped it too');
  assert.ok(!/—/.test(openSrc), 'no em dashes');
});
