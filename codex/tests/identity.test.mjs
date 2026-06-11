// Identity seam (questions/identity.js): maps a stored student HANDLE (the device
// id sent as student_name, today "Anon_XXXXXX") to what each surface shows. Today
// everyone is anonymous, so the AUDIENCE always sees "Anônimo" and the HOST sees
// "Anônimo · <tail>" so two simultaneous askers stay distinct. Pure module (no
// DOM); future-auth-ready: when login lands this is the one place a handle
// resolves to a real/chosen name, no caller changes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('isAnonHandle: empty, the anon label, and Anon_ device handles are anonymous', async () => {
  const { isAnonHandle, ANON_LABEL } = await import('../questions/identity.js');
  assert.equal(isAnonHandle(''), true);
  assert.equal(isAnonHandle('   '), true);
  assert.equal(isAnonHandle(null), true);
  assert.equal(isAnonHandle(ANON_LABEL), true);
  assert.equal(isAnonHandle('Anon_K7QF2A'), true);
  assert.equal(isAnonHandle('anon-abc'), true);
  assert.equal(isAnonHandle('João'), false);            // a typed/chosen name
  assert.equal(isAnonHandle('Anonymous Pete'), false);  // not the Anon_ device prefix
});

test('handleTail extracts the random tail of a device handle', async () => {
  const { handleTail } = await import('../questions/identity.js');
  assert.equal(handleTail('Anon_K7QF2A'), 'K7QF2A');
  assert.equal(handleTail('anon-abc'), 'abc');
  assert.equal(handleTail('João'), '');
  assert.equal(handleTail(''), '');
});

test('audienceLabel collapses anonymous handles to the anon label, keeps real names', async () => {
  const { audienceLabel, ANON_LABEL } = await import('../questions/identity.js');
  assert.equal(audienceLabel('Anon_K7QF2A'), ANON_LABEL);
  assert.equal(audienceLabel(''), ANON_LABEL);
  assert.equal(audienceLabel(ANON_LABEL), ANON_LABEL);
  assert.equal(audienceLabel('João'), 'João'); // future named account / ClassPulse typed name
});

test('hostLabel keeps a short handle tail so simultaneous askers stay distinct', async () => {
  const { hostLabel, ANON_LABEL } = await import('../questions/identity.js');
  assert.equal(hostLabel('Anon_K7QF2A'), ANON_LABEL + ' · K7QF2A');
  assert.equal(hostLabel(''), ANON_LABEL);
  assert.equal(hostLabel('João'), 'João');
});

test('identity.js is dependency-free and em-dash-free', () => {
  const src = read('../questions/identity.js');
  assert.ok(!/^\s*import\b/m.test(src), 'no imports (pure module)');
  assert.ok(!/—/.test(src), 'no em dashes');
  assert.match(src, /export function audienceLabel/);
  assert.match(src, /export function hostLabel/);
});
