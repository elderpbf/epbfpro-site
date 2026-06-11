// questions/identity.js
// Identity seam: maps a stored student HANDLE (the device id sent as student_name,
// today "Anon_XXXXXX" from nexo-answer) to what each surface shows. Today everyone
// is anonymous, so the AUDIENCE always sees "Anônimo" and the HOST sees
// "Anônimo · <handle tail>" so two simultaneous askers stay distinguishable.
//
// This is the ONE place a handle resolves to a display name. When account login
// lands, only this module changes: a logged-in handle resolves to the real/chosen
// name, anonymous handles keep collapsing to "Anônimo". No caller changes.
//
// Keying off the "Anon_" device prefix means it is also safe for legacy ClassPulse
// (/go), where a student may type a real name on join: typed names pass through
// unchanged, only anonymous handles collapse.
//
// Pure (no DOM, no imports), so it unit-tests in a plain node --test run. Two
// legacy IIFE surfaces that cannot import an ES module (backstage/js/nexo-answer.js
// and go/display.html) mirror audienceLabel inline with a pointer comment.

export const ANON_LABEL = 'Anônimo';

// A handle is "anonymous" when it is empty, already the anon label, or a device
// handle (Anon_/Anon- prefix). Anything else is treated as a chosen/real name.
export function isAnonHandle(name) {
  const s = String(name == null ? '' : name).trim();
  return !s || s === ANON_LABEL || /^anon[_-]/i.test(s);
}

// The random tail of a device handle ("Anon_K7QF2A" -> "K7QF2A"), or '' if none.
export function handleTail(name) {
  const s = String(name == null ? '' : name).trim();
  const m = s.match(/^anon[_-](.+)$/i);
  return m ? m[1] : '';
}

// Audience-facing label (public display / projector / a student's own card).
// Anonymous handles collapse to "Anônimo"; a named account / typed name shows.
export function audienceLabel(name) {
  return isAnonHandle(name) ? ANON_LABEL : String(name).trim();
}

// Host-facing label (instructor Q&A feed + active card): keeps a short handle tail
// so two simultaneous "Anônimo" askers stay distinct. Named accounts show as-is.
export function hostLabel(name) {
  if (!isAnonHandle(name)) return String(name).trim();
  const tail = handleTail(name);
  return tail ? ANON_LABEL + ' · ' + tail : ANON_LABEL;
}
