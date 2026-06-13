// codex/js/tarefa-fields.js — Codex-owned tarefa field registry (cdx- port of
// CTTarefaFields). The pure descriptor logic (get/list/validate/toCsvValue/
// renderStored) is unit-tested; renderForm's DOM is verified on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getField, listFields } from '../js/tarefa-fields.js';

test('getField: known slug, unknown falls back to text', () => {
  assert.equal(getField('text').slug, 'text');
  assert.equal(getField('upload').slug, 'upload');
  assert.equal(getField('nope').slug, 'text', 'unknown slug -> text');
  assert.equal(getField(undefined).slug, 'text');
});

test('listFields: text enabled, others disabled', () => {
  const all = listFields();
  assert.equal(all.length, 4);
  assert.equal(all.find((f) => f.slug === 'text').disabled, false);
  for (const slug of ['upload', 'mc', 'rating']) {
    assert.equal(all.find((f) => f.slug === slug).disabled, true, `${slug} disabled`);
  }
});

test('text.validate: empty -> message, filled -> null', () => {
  const text = getField('text');
  assert.match(text.validate(null), /Escreva uma resposta/);
  assert.match(text.validate({ text: '' }), /Escreva uma resposta/);
  assert.equal(text.validate({ text: 'hi' }), null);
});

test('text.toCsvValue / renderStored: parse JSON string, escape output', () => {
  const text = getField('text');
  assert.equal(text.toCsvValue('{"text":"hello"}'), 'hello');
  assert.equal(text.toCsvValue(null), '');
  assert.match(text.renderStored('{"text":"a & <b>"}'), /ct-resp-text">a &amp; &lt;b&gt;/);
});

test('disabled types validate to "not available" and empty csv', () => {
  const up = getField('upload');
  assert.match(up.validate(null), /não disponível/);
  assert.equal(up.toCsvValue('{"x":1}'), '');
});
