// js/names.js — avatar initials from a stored name (track-28a2). Pure, DOM-free.
// No e-mail derivation: a person's display name is whatever is stored (obvious names are fixed
// directly in the DB, not guessed at runtime); the roster shows the e-mail when there is no name.

// Avatar initials: first-name + last-name initial; a single name uses its first two letters.
export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase();
  const one = parts[0] || '?';
  return one.slice(0, 2).toLocaleUpperCase();
}
