// Everything the k1 lab puts on screen has to be typable.
//
// The lab rejects a letter that leads to no word, so a cluster label or an
// example-sentence word missing from WORDS cannot be typed at all: the field
// shakes at the instructor mid-class while the word sits on the screen in front
// of the room. That happened with banana, abacaxi, mamão and melão.
//
// The lab is a standalone HTML with inline JS, so the source is read and parsed
// rather than imported.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// CRLF would defeat every line-anchored pattern below.
const SRC = readFileSync(join(HERE, '..', 'labs', 'k1', 'index.html'), 'utf8')
  .split('\r\n')
  .join('\n');

function wordEntries() {
  const block = SRC.match(/const WORDS = \[\n([\s\S]*?)\n {6}\];/);
  assert.ok(block, 'WORDS array not found in the lab');
  return [...block[1].matchAll(/\{ text: '([^']+)',\s*bias: '([a-z]+)' \}/g)]
    .map((m) => ({ text: m[1], bias: m[2] }));
}

function clusterLabels() {
  return [...SRC.matchAll(/\{ label: '([^']+)',/g)].map((m) => m[1]);
}

function exampleSentenceWords() {
  const block = SRC.match(/const PHRASES = \{\n([\s\S]*?)\n {6}\};/);
  assert.ok(block, 'example sentences (PHRASES) not found in the lab');
  return [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const stripAccents = (t) => t.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();

test('every word in WORDS is unique', () => {
  const words = wordEntries().map((w) => w.text);
  const seen = new Set();
  const dupes = words.filter((w) => (seen.has(w) ? true : (seen.add(w), false)));
  assert.deepEqual(dupes, [], `duplicated entries: ${dupes.join(', ')}`);
});

test('every cluster label on the stage can be typed', () => {
  const known = new Set(wordEntries().map((w) => w.text));
  const labels = clusterLabels();
  assert.ok(labels.length >= 10, 'expected both clusters to be populated');
  const missing = labels.filter((l) => !known.has(l));
  assert.deepEqual(missing, [], `on screen but not typable: ${missing.join(', ')}`);
});

test('every word of the built-in example sentences can be typed', () => {
  const known = new Set(wordEntries().map((w) => w.text));
  const used = exampleSentenceWords();
  assert.ok(used.length > 20, 'expected the phrase pools to be populated');
  const missing = [...new Set(used)].filter((w) => !known.has(w));
  assert.deepEqual(missing, [], `used by "Sugerir frase" but not typable: ${missing.join(', ')}`);
});

test('the cluster labels carry the bias of the cluster they sit in', () => {
  const bias = new Map(wordEntries().map((w) => [w.text, w.bias]));
  for (const w of ['camisa', 'botão', 'bolso', 'gola', 'tecido']) {
    assert.equal(bias.get(w), 'roupa', `${w} should pull towards ROUPA`);
  }
  for (const w of ['banana', 'abacaxi', 'mamão', 'laranja', 'melão']) {
    assert.equal(bias.get(w), 'fruta', `${w} should pull towards FRUTA`);
  }
});

test('the list stays alphabetical, so the ordering never leaks the bias', () => {
  const words = wordEntries().map((w) => w.text);
  for (let i = 1; i < words.length; i++) {
    assert.ok(
      stripAccents(words[i - 1]) <= stripAccents(words[i]),
      `out of order: "${words[i - 1]}" comes before "${words[i]}"`
    );
  }
});

test('"manga" is the only anchor, and it is present', () => {
  const anchors = wordEntries().filter((w) => w.bias === 'manga');
  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].text, 'manga');
});
