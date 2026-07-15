// cohorts/students-filters.js
// Pure filter logic for the people roster (track-28a2). DOM-free so it is unit-testable and
// shared by students.js (no duplicated predicates). "Access" is per-turma, so a person can sit
// in more than one bucket at once (pending in one turma, approved in another).
//
// A person carries `rows` (their per-turma participations) — the shape ct_list_people returns
// for BOTH scopes, so these predicates read the same object the dossiê renders.

export function hasStatus(s, st) { return (s.rows || []).some((x) => x.access_status === st); }
export function hasPending(s) { return hasStatus(s, 'pending') || hasStatus(s, 'denied'); }

// Which filter options actually PARTITION the current roster. Élder 2026-07-14: "don't show
// options that none have, this serves for all filters." An option appears only when some student
// matches it; a whole filter is dropped unless at least two of its buckets are present (a filter
// with a single bucket would filter nothing). Returns the present option values per filter, or an
// empty array when the filter should be hidden entirely.
export function filterOptions(students) {
  const list = students || [];
  const present = (opts) => {
    const kept = opts.filter((o) => o.present).map((o) => o.value);
    return kept.length >= 2 ? kept : [];
  };
  const status = present([
    { value: 'pending',  present: list.some((s) => hasStatus(s, 'pending')) },
    { value: 'denied',   present: list.some((s) => hasStatus(s, 'denied')) },
    { value: 'approved', present: list.some((s) => !hasPending(s)) },
  ]);
  const verified = present([
    { value: 'yes', present: list.some((s) => s.email_verified) },
    { value: 'no',  present: list.some((s) => !s.email_verified) },
  ]);
  const turmas = present([
    { value: 'single', present: list.some((s) => s.turma_count === 1) },
    { value: 'multi',  present: list.some((s) => s.turma_count > 1) },
  ]);
  const clients = Array.from(new Set(
    list.flatMap((s) => (s.rows || []).map((x) => x.client_slug).filter(Boolean))
  )).sort();
  return { status, verified, turmas, clients: clients.length >= 2 ? clients : [] };
}
