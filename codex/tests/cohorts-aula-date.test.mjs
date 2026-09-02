// cohorts/cohorts.js _aulaDateStatus — the rule that decides whether an aula reads
// as scheduled (agendada/remarcada) or occurred (ocorreu). An aula must NOT
// self-report as occurred on its scheduled day; it flips to occurred only the day
// AFTER, or the moment an explicit "ocorreu em" (happened_on) date is filled.
// `today` is injected so these cases are date-stable, not clock-dependent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { _aulaDateStatus } from '../cohorts/cohorts.js';

const TODAY = '2026-06-15';
const YESTERDAY = '2026-06-14';
const TOMORROW = '2026-06-16';

test('happened_on filled -> occurred, regardless of the scheduled date', () => {
  assert.equal(
    _aulaDateStatus({ happened_on: '2026-06-10', scheduled_for: TOMORROW }, TODAY).cls,
    'cdx-rel-date-ocorreu',
  );
});

test('scheduled for today is still agendada, NOT auto-occurred (the bug)', () => {
  assert.equal(_aulaDateStatus({ scheduled_for: TODAY }, TODAY).cls, 'cdx-rel-date-agendada');
});

test('scheduled in the future is agendada', () => {
  assert.equal(_aulaDateStatus({ scheduled_for: TOMORROW }, TODAY).cls, 'cdx-rel-date-agendada');
});

// CHANGED 2026-09-02. A scheduled day that has merely PASSED is no longer drawn as "ocorreu em".
// Nothing writes happened_on by itself (the Worker's only two writers are the explicit save and
// the explicit "marcar como ocorrida"), so the old badge stated as fact something nobody had
// confirmed, and it contradicted the Avaliação tab on the same screen: that tab refuses to send
// the reaction survey while the very same class is unmarked. Élder chose which of the two moves:
// the lock stays, the badge tells the truth.
test('a scheduled date that merely PASSED reads as unconfirmed, not as occurred', () => {
  const st = _aulaDateStatus({ scheduled_for: YESTERDAY }, TODAY);
  assert.equal(st.cls, 'cdx-rel-date-naoconfirmada');
  assert.ok(!/ocorreu/i.test(st.text), 'nobody said it happened');
});

test('an explicit happened_on IS occurred, and shows ITS date, not the scheduled one', () => {
  const st = _aulaDateStatus({ scheduled_for: '2026-05-01', happened_on: YESTERDAY }, TODAY);
  assert.equal(st.cls, 'cdx-rel-date-ocorreu');
  assert.match(st.text, /14\/06/, 'the date shown is the confirmed one');
  assert.ok(!/05/.test(st.text), 'not the day it was scheduled for');
});

test('a rescheduled aula on its new (today) date reads as remarcada', () => {
  assert.equal(
    _aulaDateStatus({ scheduled_for: TODAY, rescheduled_from: '2026-06-10' }, TODAY).cls,
    'cdx-rel-date-remarcada',
  );
});

test('no scheduled date and no happened_on -> a-definir', () => {
  assert.equal(_aulaDateStatus({}, TODAY).cls, 'cdx-rel-date-adefinir');
});
