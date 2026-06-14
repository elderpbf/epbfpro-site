// Accessibility fixes (audit P1). The shared modal restores focus to its trigger
// on close (keyboard + screen-reader users keep their place), and the Trail
// sub-card expander is keyboard-operable. These are DOM-interaction behaviors
// that render into a live DOM, so they are pinned here by source contract.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('modal.js remembers the trigger on open and restores focus on close', () => {
  const src = read('../js/modal.js');
  assert.match(src, /document\.activeElement/, 'openModal captures the focused element');
  assert.match(src, /_trigger/, 'stored on the backdrop so closeModal can reach it');
  assert.match(src, /trigger\.focus\(\)/, 'closeModal restores focus to the trigger');
});

test('Trail sub-card is keyboard-operable (role=button, tabindex, Enter/Space)', () => {
  const src = read('../trilha/js/sub.js');
  assert.match(src, /setAttribute\('role', 'button'\)/, 'exposed as a button to AT');
  assert.match(src, /setAttribute\('tabindex', '0'\)/, 'in the tab order');
  assert.match(src, /addEventListener\('keydown'/, 'has a keydown handler');
  assert.match(src, /e\.key !== 'Enter' && e\.key !== ' '/, 'toggles on Enter and Space');
});
