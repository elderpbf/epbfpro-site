// Tarefas sub-module: tab contract + the pure meta-parse and sort rules.
// Importing must not touch DOM/globals (CTTarefaFields read only inside handlers).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const tarefas = await import('../content/tarefas.js');
const src = fs.readFileSync(fileURLToPath(new URL('../content/tarefas.js', import.meta.url)), 'utf8');

test('tarefas module satisfies the tab contract', () => {
  assert.equal(typeof tarefas.mount, 'function', 'exports mount');
  assert.equal(typeof tarefas.unmount, 'function', 'exports unmount');
});

test('parseMeta tolerates string JSON, objects, and garbage', () => {
  assert.deepEqual(tarefas.parseMeta('{"field_type":"text","allow_anonymous":true}'), { field_type: 'text', allow_anonymous: true });
  assert.deepEqual(tarefas.parseMeta({ field_type: 'text' }), { field_type: 'text' }, 'object passthrough');
  assert.deepEqual(tarefas.parseMeta(null), {}, 'null -> {}');
  assert.deepEqual(tarefas.parseMeta('not json'), {}, 'invalid -> {}');
});

test('sortTarefas orders by aula number then title; no-aula sinks to bottom', () => {
  const input = [
    { id: 1, title: 'Zeta', _aula_number: 2 },
    { id: 2, title: 'Alpha', _aula_number: null },   // no aula -> bottom
    { id: 3, title: 'Beta', _aula_number: 1 },
    { id: 4, title: 'Alpha', _aula_number: 2 },       // same aula as Zeta, sorts by title
  ];
  const order = tarefas.sortTarefas(input).map((i) => i.id);
  assert.deepEqual(order, [3, 4, 1, 2], 'aula 1, then aula 2 (Alpha<Zeta), then no-aula');
});

test('sortTarefas does not mutate the input array', () => {
  const input = [{ id: 1, _aula_number: 2 }, { id: 2, _aula_number: 1 }];
  const copy = input.slice();
  tarefas.sortTarefas(input);
  assert.deepEqual(input, copy, 'input order unchanged');
});

// Fatia 6 (t1b): the aula-locked pane reuses the shared editor module + organizes the bank
// by section, and never makes a local copy (placing is a release; saves land in the bank).
test('t1b: reuses the shared editor module (not a forked editor)', () => {
  assert.match(src, /from '\.\.\/js\/tarefa-editor\.js'/, 'imports the reusable editor');
  assert.match(src, /renderEditor\(|wireEditor\(/, 'uses the editor module');
});

test('t1b: drives the tarefa bank sections through the facade', () => {
  for (const call of ['listTarefaSections', 'createTarefaSection', 'setItemSection']) {
    assert.match(src, new RegExp('api\\.' + call + '\\('), `calls ${call}`);
  }
});

test('t1b: bank saves are decoupled from the aula release (no auto-release on save)', () => {
  // Bank ops write the bank only: overwrite = updateItem, save-as-new = createItem.
  assert.match(src, /_overwriteInBank|_overwriteCardItem/, 'overwrite (bank) path');
  assert.match(src, /_saveAsNew\b/, 'save-as-new (bank) path');
  // The ONLY release action is _includeInAula (a separate button), never bundled into a save.
  assert.match(src, /_includeInAula/, 'explicit include-in-aula action');
  assert.ok(!/duplicateItem/.test(src), 'no item duplication (instance copy was dropped)');
});

test('t1b v2: targeted DOM updates, no full-pane rebuild on view interactions', () => {
  // Expand/edit/flag must NOT call _renderLockedPane (that was the full-reload bug).
  assert.match(src, /function _toggleCard\(/, 'targeted card expand');
  assert.match(src, /function _toggleEdit\(/, 'targeted editor open');
  assert.match(src, /function _repaintCard\(/, 'single-card repaint');
  assert.ok(!/_toggleCard[\s\S]{0,200}_renderLockedPane\(/.test(src), 'card toggle does not rebuild the pane');
});

test('t1b v2: exposes remove-from-turma, delete-from-bank (title confirm), section rename/delete', () => {
  assert.match(src, /_removeFromTurma/, 'remove from turma');
  assert.match(src, /_openTitleConfirm/, 'delete-from-bank title confirmation');
  assert.match(src, /_renameSection/, 'rename section');
  assert.match(src, /_deleteSection/, 'delete section');
});

test('t1b: renders instance cards + reveal badge in aula-locked mode', () => {
  assert.match(src, /cdx-t1b-card/, 'instance cards');
  assert.match(src, /_revealBadgeHtml/, 'reveal badge');
  assert.match(src, /_lockedAula != null/, 'branches on aula-locked mode');
});
