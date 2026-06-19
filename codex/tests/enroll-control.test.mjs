// Shared enrollment-projection control (js/enroll-control.js): the one place that
// maps a "toggle QR" press to the facade, so the host panel and the projector display
// act on the same server state (Élder: "é tudo o mesmo código"). Pure-ish logic over an
// injected facade — unit-tested here; the two surfaces are verified on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isProjecting, toggleProjection, enrollQrSrc, entrarUrl } from '../js/enroll-control.js';

test('isProjecting is true only when the window is open AND the QR is shown', () => {
  assert.equal(isProjecting(null), false);
  assert.equal(isProjecting({ open: true, qr_shown: 0 }), false);
  assert.equal(isProjecting({ open: false, qr_shown: 1 }), false);
  assert.equal(isProjecting({ open: true, qr_shown: 1 }), true);
});

test('toggleProjection: projecting un-projects (window stays open), else it opens', () => {
  const calls = [];
  const api = {
    setEnrollmentQr: (p) => { calls.push(['setEnrollmentQr', p]); return p; },
    openEnrollment: (p) => { calls.push(['openEnrollment', p]); return p; },
  };
  const ids = { client_slug: 'c', slug: 't' };
  toggleProjection(api, ids, { open: true, qr_shown: 1 });        // projecting -> hide QR
  assert.deepEqual(calls[0], ['setEnrollmentQr', { client_slug: 'c', slug: 't', shown: 0 }]);
  toggleProjection(api, ids, { open: true, qr_shown: 0 });        // window open, QR off -> project
  assert.deepEqual(calls[1], ['openEnrollment', { client_slug: 'c', slug: 't' }]);
  toggleProjection(api, ids, null);                               // no window -> open (mint)
  assert.deepEqual(calls[2], ['openEnrollment', { client_slug: 'c', slug: 't' }]);
});

test('enrollQrSrc builds a QR image URL for the et join link', () => {
  const src = enrollQrSrc({ turma_token: 'KTOK', enrollment_token: 'ETOK' }, { client_slug: 'c', slug: 't' }, 1200);
  assert.match(src, /api\.qrserver\.com/);
  assert.match(src, /1200x1200/);
  const data = decodeURIComponent(src);
  assert.match(data, /pensoia\.com\/trilha\/c\/t/);
  assert.match(data, /et=ETOK/);
});

test('entrarUrl builds the short typed-entry address', () => {
  assert.equal(entrarUrl('1234'), 'pensoia.com/trilha/1234');
  assert.equal(entrarUrl(''), 'pensoia.com/trilha/'); // prefix-only, used by the display
});
