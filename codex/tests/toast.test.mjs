// codex/js/toast.js — Codex-owned toast (port of BSToast). It is a DOM-only
// leaf (appends a .bs-toast div); the visual is verified on staging. Here we
// only pin that it imports cleanly and is a safe no-op without a DOM.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toast } from '../js/toast.js';

test('toast: exported function, no-op (no throw) without a DOM', () => {
  assert.equal(typeof toast, 'function');
  assert.doesNotThrow(() => toast('hello'));
  assert.doesNotThrow(() => toast('hello', 1000));
});
