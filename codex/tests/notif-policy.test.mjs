// tests/notif-policy.test.mjs
// The notification dismissal-tier policy (js/notif-policy.js). Today every item is the
// 'open' (dismiss-on-open) tier for both roles; these pin that behaviour + the
// role-aware seam so the 'act' tier can land later without surprising the bell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dismissalFor, DISMISS_OPEN, DISMISS_ACT } from '../js/notif-policy.js';

test('the tier tags are distinct string constants', () => {
  assert.equal(DISMISS_OPEN, 'open');
  assert.equal(DISMISS_ACT, 'act');
  assert.notEqual(DISMISS_OPEN, DISMISS_ACT);
});

test('every notification is the dismiss-on-open tier for now, both roles', () => {
  const items = [
    { type: 'forum_post', kind: 'reply', mine: true },
    { type: 'forum_post', kind: 'new_thread', mine: false },
    { type: 'whatever' },
    {},
  ];
  for (const role of ['student', 'admin', undefined]) {
    for (const it of items) {
      assert.equal(dismissalFor(it, role), DISMISS_OPEN, `${JSON.stringify(it)} @ ${role}`);
    }
  }
});
