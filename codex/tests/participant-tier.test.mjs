// js/participant-tier.js — the shared identity-tier helper (RED first). Used by
// BOTH the cohorts roster and the certificate-issue modal, so it lives in the
// shared js/ seam. Pure: maps a participant row to its tier + the i18n/CSS hooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { participantTier, tierLabelKey, tierBadgeClass } from '../js/participant-tier.js';

test('presence_attested wins: a participant seen in a live session is "present"', () => {
  assert.equal(participantTier({ presence_attested: 1, consent_at: 1700000000 }), 'present');
  assert.equal(participantTier({ presence_attested: 1, consent_at: null }), 'present');
});

test('consent without presence is "registered"', () => {
  assert.equal(participantTier({ presence_attested: 0, consent_at: 1700000000 }), 'registered');
  assert.equal(participantTier({ consent_at: 1700000000 }), 'registered');
});

test('a plain roster entry (no consent, no presence) is "roster"', () => {
  assert.equal(participantTier({ presence_attested: 0, consent_at: null }), 'roster');
  assert.equal(participantTier({ name: 'Bruno', email: 'b@x.com' }), 'roster');
  assert.equal(participantTier({}), 'roster');
  assert.equal(participantTier(null), 'roster');
});

test('tierLabelKey maps to a tier.* i18n key', () => {
  assert.equal(tierLabelKey('present'), 'tier.present');
  assert.equal(tierLabelKey('registered'), 'tier.registered');
  assert.equal(tierLabelKey('roster'), 'tier.roster');
});

test('tierBadgeClass yields a stable, tier-scoped class', () => {
  assert.equal(tierBadgeClass('present'), 'cdx-tier cdx-tier--present');
  assert.equal(tierBadgeClass('roster'), 'cdx-tier cdx-tier--roster');
});
