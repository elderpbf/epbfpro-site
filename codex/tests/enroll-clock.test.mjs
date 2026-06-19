// codex/js/enroll-clock.js — the QR enrollment countdown math (pure).
// The countdown must reflect the REAL server window, not a silent client-only timer,
// so remaining time is anchored to the server expiry + a measured clock offset. These
// pin that math; the DOM that ticks it (the dossier Acesso card) is verified on staging.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { clockOffset, remainingSec, fmtRemain, enrollUrl } = await import('../js/enroll-clock.js');

test('clockOffset corrects a skewed client clock to server time', () => {
  // Server says 1000, client says 940 -> offset +60.
  assert.equal(clockOffset(1000, 940), 60);
  assert.equal(clockOffset(1000, 1000), 0);
});

test('remainingSec is anchored to the server expiry via the offset, never negative', () => {
  // expires at 1100 (server). Client now 1000 with +30 offset -> server-now 1030 -> 70 left.
  assert.equal(remainingSec(1100, 30, 1000), 70);
  // Past expiry clamps to 0, never a negative count.
  assert.equal(remainingSec(1100, 30, 2000), 0);
  assert.equal(remainingSec(0, 0, 1000), 0);     // no window
});

test('fmtRemain renders 1h34 / 34min / 45s compactly', () => {
  assert.equal(fmtRemain(3600 + 34 * 60), '1h34');
  assert.equal(fmtRemain(2 * 3600 + 5 * 60), '2h05');   // zero-padded minutes
  assert.equal(fmtRemain(34 * 60), '34min');
  assert.equal(fmtRemain(45), '45s');
  assert.equal(fmtRemain(0), '0s');
  assert.equal(fmtRemain(-10), '0s');                    // clamped
});

test('enrollUrl carries both k and et on the trail link', () => {
  assert.equal(
    enrollUrl('https://staging.pensoia.com', 'jfse', 'geral', 'KTOK', 'ETOK'),
    'https://staging.pensoia.com/trilha/jfse/geral?k=KTOK&et=ETOK',
  );
  // URL-encodes the tokens and falls back to the prod origin when none is given.
  assert.equal(
    enrollUrl('', 'c', 't', 'a b', 'x/y'),
    'https://pensoia.com/trilha/c/t?k=a%20b&et=x%2Fy',
  );
});
