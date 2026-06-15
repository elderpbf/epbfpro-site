// codex/js/aula-status.js
// The ONE rule for an aula's date status, shared by every surface that shows it:
// the admin Cohorts view (cohorts/cohorts.js), the public Trail (trilha/js/utils.js),
// and the Releases composer (content/releases.js). The rule used to be copy-pasted
// in those three places and had drifted; it now lives here only. Each consumer maps
// the canonical status below to its OWN presentation (CSS class, badge, localized
// text); only the rule is shared.
//
// An aula is 'happened' ONLY when an explicit "ocorreu em" date (happened_on) is
// filled, OR once its scheduled day has fully PASSED (scheduled_for strictly before
// today, i.e. the day AFTER). On the scheduled day itself it is still
// scheduled/rescheduled, so an aula never self-reports as done before it happened.
// `today` (yyyy-mm-dd) is injectable for tests; it defaults to the real date.
//
// Returns: 'happened' | 'scheduled' | 'rescheduled' | 'undefined'.

export function aulaStatus(aula, today) {
  if (!aula) return 'undefined';
  today = today || new Date().toISOString().slice(0, 10);
  if (aula.happened_on) return 'happened';
  if (aula.scheduled_for) {
    if (aula.rescheduled_from && aula.scheduled_for >= today) return 'rescheduled';
    if (aula.scheduled_for >= today) return 'scheduled';
    return 'happened';
  }
  return 'undefined';
}
