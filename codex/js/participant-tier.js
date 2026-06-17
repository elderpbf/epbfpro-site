// codex/js/participant-tier.js
// Shared student-identity tier helper. A participant's tier reflects how strongly
// their identity is established, which the admin uses when deciding who to issue a
// certificate to. Consumed by BOTH the cohorts roster and the certificate-issue
// modal (hence the shared js/ seam). Pure: the i18n label + CSS class are returned
// as keys/strings so the caller owns rendering.
//
// Tiers (strongest first):
//   present    — presence_attested: confirmed in a live session (highest trust)
//   registered — consent_at set: logged in via magic link and gave LGPD consent
//   roster     — on the list only: admin-added or an incomplete self-registration
//
// "Certified" is intentionally NOT a tier here: cert status lives in the
// certificates tab; this badge answers "is this a verified, present student?".

export function participantTier(p) {
  if (p && p.presence_attested) return 'present';
  if (p && p.consent_at) return 'registered';
  return 'roster';
}

// The i18n key for a tier's short label (resolved by the caller's t()).
export function tierLabelKey(tier) {
  return 'tier.' + tier;
}

// The i18n key for a tier's hover/title description.
export function tierTitleKey(tier) {
  return 'tier.' + tier + '_title';
}

// A stable, tier-scoped CSS class for the badge chip.
export function tierBadgeClass(tier) {
  return 'cdx-tier cdx-tier--' + tier;
}
