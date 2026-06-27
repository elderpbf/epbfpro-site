// js/initials.js
// Shared 2-letter avatar initials from a person's name. ONE rule, reused by every
// initials avatar (Trail header + Alunos roster) so they always match:
//   - two or more names -> first letter of the first two names
//   - exactly one name  -> its first two letters
//   - blank / empty     -> '' (the caller then renders no initials)
// Always uppercased.
export function initials(name) {
  const parts = String(name == null ? '' : name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}
