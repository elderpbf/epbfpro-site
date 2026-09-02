// codex/trilha/js/lab-overlay.js, what a STUDENT ends up seeing on a lab card.
//
// The registry (js/labs-registry.js) is the default name and the source of the description; the
// database copy in ct_items is insert-only and goes stale, which is why the overlay exists at all.
// track-65 added a third source on top: the admin's rename, which the Worker sends as
// `lab_display_name`. Élder's rule, 2026-09-02: a rename has to actually rename, otherwise it is
// "something that makes no difference at all". So the override wins over the registry, and the
// registry still wins over the stale database copy.
//
// The other half of this file is what it must NEVER do: an overlay that makes a released lab
// disappear is worse than a stale title, so anything it cannot key is left exactly as it arrived.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// labs-registry reaches labs-state, which reaches the facade. Nothing here loads state (the Trail
// never does), so the readers answer registry defaults, which is the real Trail condition.
const { overlayLabItem, overlayLabItems } = await import('../trilha/js/lab-overlay.js');

const labItem = (over) => Object.assign({
  id: 1, type: 'lab', lab_key: 'k1', title: 'Nome velho do banco', summary: 'resumo velho',
}, over || {});

test('with no rename, the registry title replaces the stale database copy', () => {
  const it = labItem();
  assert.equal(overlayLabItem(it), true);
  assert.equal(it.title, 'Atenção!');
  assert.equal(it.summary, 'Contexto reescreve significado');
});

// The point of the change: the admin renames a lab and the student sees it, including in cohorts
// that were released long before the rename.
test('the admin rename wins over the registry title', () => {
  const it = labItem({ lab_display_name: 'Foco Contextual' });
  overlayLabItem(it);
  assert.equal(it.title, 'Foco Contextual');
  assert.equal(it.summary, 'Contexto reescreve significado', 'only the NAME is overridden');
});

test('the rename is trimmed, and a blank one is no rename at all', () => {
  const padded = labItem({ lab_display_name: '  Foco Contextual  ' });
  overlayLabItem(padded);
  assert.equal(padded.title, 'Foco Contextual');

  for (const blank of ['', '   ', null, undefined]) {
    const it = labItem({ lab_display_name: blank });
    overlayLabItem(it);
    assert.equal(it.title, 'Atenção!', 'clearing the rename reverts the student to the default');
  }
});

test('a non-lab item is never touched', () => {
  const it = { id: 2, type: 'conteudo', title: 'Uma seção', lab_display_name: 'ignore me' };
  assert.equal(overlayLabItem(it), true);
  assert.equal(it.title, 'Uma seção');
});

// Fail open. An item whose key cannot be resolved is left alone rather than dropped: a released
// lab vanishing from the trail is a much worse outcome than a stale name.
test('an unkeyable lab is left exactly as it arrived', () => {
  const it = { id: 3, type: 'lab', title: 'Sem chave', lab_display_name: 'Renomeado' };
  assert.equal(overlayLabItem(it), true);
  assert.equal(it.title, 'Sem chave');
});

test('a lab retired from the registry is dropped from the list', () => {
  const data = { items: [labItem(), { id: 4, type: 'lab', lab_key: 'k14', title: 'Sinapse' }] };
  overlayLabItems(data);
  assert.deepEqual(data.items.map((i) => i.id), [1], 'the retired k14 is gone, k1 stays');
});

test('the key is read from meta_json when the list did not extract it', () => {
  const it = { id: 5, type: 'lab', title: 'x', meta_json: JSON.stringify({ lab_key: 'k5' }), lab_display_name: 'Pedaços' };
  overlayLabItem(it);
  assert.equal(it.title, 'Pedaços', 'the rename applies through the meta_json path too');
});
