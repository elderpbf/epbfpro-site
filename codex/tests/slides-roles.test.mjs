// slides-roles.test.mjs — the text-ROLE registry + the pure roleCss() generator
// (theme/roles.js): the typography half of the Tema system. A role binds to real
// layout selectors; deck.theme.texto.papeis carries SPARSE per-role overrides that
// roleCss turns into a stylesheet. DOM-free, node:test, assert-by-source-text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ROLES, getRole, roleCss } from '../content/slides/js/theme/roles.js';

/* ---------- the registry ---------- */
test('ROLES covers the semantic set Élder approved, each with id/labelKey/binds', () => {
  const ids = ROLES.map((r) => r.id);
  for (const id of ['title', 'section', 'subtitle', 'body', 'topic', 'label', 'caption', 'feature', 'quote', 'number']) {
    assert.ok(ids.includes(id), `expected role ${id}`);
  }
  for (const r of ROLES) {
    assert.ok(r.labelKey && r.labelKey.startsWith('slides.role_'));
    assert.ok(Array.isArray(r.binds) && r.binds.length);
    for (const b of r.binds) {
      assert.equal(typeof b.sel, 'string');
      assert.equal(typeof b.px, 'number');
    }
  }
});
test('role ids are unique', () => {
  const ids = ROLES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});
test('getRole returns a role by id, null otherwise', () => {
  assert.equal(getRole('section').id, 'section');
  assert.equal(getRole('nope'), null);
});

/* ---------- roleCss: empty / sparse ---------- */
test('roleCss returns empty for no overrides (so an untouched deck renders identically)', () => {
  assert.equal(roleCss(null), '');
  assert.equal(roleCss({}), '');
  assert.equal(roleCss({ title: {} }), ''); // a role with no SET props emits nothing
});

/* ---------- roleCss: grouped props ---------- */
test('a font override emits one grouped rule over all the role selectors, scoped', () => {
  const css = roleCss({ title: { font: 'raleway' } });
  assert.match(css, /\.cdx-deck-editor \.L-cover h1\{font-family:'Raleway'/);
});
test('section font applies to every h2 binding in one selector list', () => {
  const css = roleCss({ section: { font: 'roboto' } });
  assert.match(css, /\.cdx-deck-editor \.L-topics h2, \.cdx-deck-editor \.L-split h2/);
});
test('weight / italic / underline+strike / colour map to the right declarations', () => {
  const css = roleCss({ topic: { weight: 700, italic: true, underline: true, strike: true, color: 'accent' } });
  assert.match(css, /font-weight:700/);
  assert.match(css, /font-style:italic/);
  assert.match(css, /text-decoration:underline line-through/);
  assert.match(css, /color:var\(--teal\)/); // semantic token resolves to the deck var
});
test('a hex colour stays literal; italic:false emits normal', () => {
  assert.match(roleCss({ title: { color: '#ff0000' } }), /color:#ff0000/);
  assert.match(roleCss({ title: { italic: false } }), /font-style:normal/);
});

/* ---------- roleCss: size is a multiplier over each binding's intrinsic px ---------- */
test('size emits a per-selector font-size calc using the binding px x fontScale x size', () => {
  const css = roleCss({ title: { size: 1.25 } });
  assert.match(css, /\.cdx-deck-editor \.L-cover h1\{font-size:calc\(78px \* var\(--fontScale\) \* 1\.25\)\}/);
});
test('size === 1 is a no-op (emits nothing)', () => {
  assert.equal(roleCss({ title: { size: 1 } }), '');
});
test('section size scales every h2 binding by its own px', () => {
  const css = roleCss({ section: { size: 0.9 } });
  assert.match(css, /\.L-topics h2\{font-size:calc\(52px \* var\(--fontScale\) \* 0\.9\)\}/);
  assert.match(css, /\.L-cards h2\{font-size:calc\(40px \* var\(--fontScale\) \* 0\.9\)\}/);
});
