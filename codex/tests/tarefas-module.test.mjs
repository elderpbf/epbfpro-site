// Tarefas sub-module: tab contract + the pure meta-parse and sort rules.
// Importing must not touch DOM/globals (CTTarefaFields read only inside handlers).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const tarefas = await import('../content/tarefas.js');

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
