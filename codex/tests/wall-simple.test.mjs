// The simple / "Emergência" wall (wall-simple.js) must behave like the normal login (Élder
// 2026-07-14): e-mail FIRST, with the name field revealed only when the worker says the address
// is new (ask_name -> needs_name). Source assertions on the render + submit wiring; the live DOM
// flow is verified on staging (staging.pensoia.com, test client `teste`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const js = read('../trilha/js/wall-simple.js');

test('the simple wall is e-mail-first: the name field starts hidden', () => {
  assert.match(js, /cdx-en-namefield hidden/, 'the name field is rendered hidden by default');
  assert.match(js, /classList\.remove\('hidden'\)/, 'the name field is revealed on demand');
});

test('the submit opts into ask_name and handles the needs_name reveal', () => {
  assert.match(js, /simpleEnroll\(\{[^}]*ask_name:\s*true/, 'sends ask_name so the worker asks for the name only for a NEW address');
  assert.match(js, /res\.needs_name/, 'handles the needs_name reply by revealing the name field');
  assert.match(js, /wall\.continuar/, 'switches the CTA to Continuar once the name is revealed');
});

test('consent is stamped only when a name was actually typed (a known e-mail keeps its stored name)', () => {
  assert.match(js, /res\.needs_profile && name/, 'profileSave only runs when a name is present');
});
