// js/tarefa-editor.js — the reusable t1b editor box. Pure render + read + wire, no DOM
// dependency (tested with tiny stubs). The host owns the bank-save semantics; this module
// only renders the fields + contextual buttons and hands the values back.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { renderEditor, readEditor, wireEditor } = await import('../js/tarefa-editor.js');

test('renderEditor lays out title input, body textarea, and one button per action', () => {
  const html = renderEditor({
    head: 'Editar tarefa', title: 'Diagnóstico', body: 'Enunciado...',
    buttons: [{ key: 'overwrite', label: 'Sobrescrever no banco' }, { key: 'new', label: 'Salvar como nova' }, { key: 'use', label: 'Usar nesta aula', primary: true }],
  });
  assert.match(html, /cdx-ted-box/);
  assert.match(html, /class="cdx-ted-title" value="Diagnóstico"/);
  assert.match(html, /<textarea class="cdx-ted-body"[^>]*>Enunciado\.\.\.<\/textarea>/);
  for (const k of ['overwrite', 'new', 'use']) assert.match(html, new RegExp('data-ted-act="' + k + '"'), `button ${k}`);
  assert.match(html, /cdx-btn-primary cdx-ted-act" data-ted-act="use"/, 'primary variant on the primary button');
});

test('renderEditor escapes user content and supports readonly + hint', () => {
  const html = renderEditor({ title: '<x>&"', body: 'a', readonly: true, hint: 'Já liberada', buttons: [] });
  assert.match(html, /value="&lt;x&gt;&amp;&quot;"/, 'title escaped');
  assert.match(html, /class="cdx-ted-title"[^>]*readonly/, 'readonly applied');
  assert.match(html, /cdx-ted-hint">Já liberada/, 'hint rendered');
});

test('renderEditor injects the host extra HTML below the fields', () => {
  const html = renderEditor({ title: 'a', body: 'b', extra: '<div class="my-anon-toggle"></div>', buttons: [] });
  assert.match(html, /my-anon-toggle/, 'extra HTML present');
  assert.ok(html.indexOf('my-anon-toggle') > html.indexOf('cdx-ted-body'), 'extra sits below the body field');
});

test('readEditor pulls trimmed title + raw body from the container', () => {
  const container = {
    querySelector: (sel) => sel === '.cdx-ted-title' ? { value: '  Nova  ' } : sel === '.cdx-ted-body' ? { value: 'corpo\n' } : null,
  };
  assert.deepEqual(readEditor(container), { title: 'Nova', body: 'corpo\n' });
  assert.deepEqual(readEditor(null), { title: '', body: '' }, 'null container is safe');
});

test('wireEditor calls the matching handler with the read values', () => {
  let got = null;
  const btn = { dataset: { tedAct: 'overwrite' }, addEventListener: (ev, fn) => { btn._click = fn; } };
  const container = {
    querySelectorAll: () => [btn],
    querySelector: (sel) => sel === '.cdx-ted-title' ? { value: 'T' } : sel === '.cdx-ted-body' ? { value: 'B' } : null,
  };
  wireEditor(container, { overwrite: (vals) => { got = vals; } });
  btn._click();
  assert.deepEqual(got, { title: 'T', body: 'B' });
});
