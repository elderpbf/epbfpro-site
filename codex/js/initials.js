// js/initials.js
// Shared 2-letter avatar initials from a person's name. ONE rule, reused by every initials avatar
// (Trail header + forum + the people list) so they always match:
//   - two or more names -> first name's initial + LAST name's initial ("Ariovaldo Rocha Macedo" -> AM)
//   - exactly one name  -> its first two letters ("Otavio" -> OT)
//   - blank / empty     -> '' (the caller then renders no initials)
// Always uppercased.
//
// FIRST + LAST is Élder's rule (his own sketch of the list reads "AM  Ariovaldo Rocha Macedo"),
// and it is how a Brazilian name reads: nome + sobrenome, not nome + nome-do-meio. This module
// used to take the first TWO names while js/names.js (the roster's own copy) took first+last, so
// the same person could be "AR" in the trail and "AM" in the roster. names.js is gone; this is
// the one rule. (track-28a2, 2026-07-15)
export function initials(name) {
  const parts = String(name == null ? '' : name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
