// js/names.js — display-name + initials helpers (track-28a2). Pure, reusable, DOM-free.
// The canonical stored name can be missing (a student who only ever had e-mail-as-name), so
// for DISPLAY we derive a name from the e-mail: split the local part on . _ - + into tokens,
// drop digits/gibberish, Title-Case the rest ("nelson.madeira" -> "Nelson Madeira"). When
// nothing name-like survives, fall back to the username stripped of numbers. Never mutates data.

function _cap(s) { return s ? s.charAt(0).toLocaleUpperCase() + s.slice(1) : s; }

// A name derived from an e-mail local part. Returns '' only for an empty e-mail.
export function nameFromEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return '';
  const local = e.split('@')[0].split('+')[0];               // drop any +tag
  const tokens = local.split(/[._\-]+/).filter(Boolean);
  const clean = tokens
    .map((tk) => tk.replace(/\d+/g, ''))                       // strip digits
    .filter((tk) => tk.length >= 2 && /[a-zà-ÿ]/i.test(tk));   // keep only name-like tokens
  if (clean.length) return clean.map(_cap).join(' ');
  const stripped = local.replace(/\d+/g, '');                 // "username without numbers"
  return stripped ? _cap(stripped) : local;
}

// The best DISPLAY name: a real stored name wins; otherwise derive from the e-mail.
export function displayName(name, email) {
  const n = String(name || '').trim();
  const e = String(email || '').trim().toLowerCase();
  if (n && n.toLowerCase() !== e) return n;
  return nameFromEmail(e) || e;
}

// True when the display name is a guess derived from the e-mail (so the UI can flag it).
export function isDerived(name, email) {
  const n = String(name || '').trim();
  const e = String(email || '').trim().toLowerCase();
  return !(n && n.toLowerCase() !== e);
}

// Avatar initials: first-name + last-name initial; a single name uses its first two letters
// (Élder's rule). Works on a full display name (derive it first for e-mail-only people).
export function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toLocaleUpperCase();
  const one = parts[0] || '?';
  return one.slice(0, 2).toLocaleUpperCase();
}
