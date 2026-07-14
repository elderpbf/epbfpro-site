// names.js — display-name + initials derivation (track-28a2). Élder's rules, locked.
import { test } from 'node:test';
import assert from 'node:assert';
import { nameFromEmail, displayName, initials, isDerived } from '../js/names.js';

test('nameFromEmail: delimiter-separated local part -> Title Case', () => {
  assert.equal(nameFromEmail('nelson.madeira@x.com'), 'Nelson Madeira');
  assert.equal(nameFromEmail('joao_silva99@x.com'), 'Joao Silva'); // digits stripped
  assert.equal(nameFromEmail('ana-paula@x.com'), 'Ana Paula');
});

test('nameFromEmail: single token capitalized', () => {
  assert.equal(nameFromEmail('otavioabdala@x.com'), 'Otavioabdala');
});

test('nameFromEmail: drops +tag before deriving', () => {
  assert.equal(nameFromEmail('maria+newsletter@x.com'), 'Maria');
});

test('nameFromEmail: gibberish/numbers -> username without numbers', () => {
  assert.equal(nameFromEmail('k4838@x.com'), 'K');       // one letter survives
  assert.equal(nameFromEmail('123@x.com'), '123');        // nothing name-like -> raw local
});

test('displayName: a real stored name wins; else derive from e-mail', () => {
  assert.equal(displayName('Nelson Madeira', 'nelson@x.com'), 'Nelson Madeira');
  assert.equal(displayName('', 'nelson.madeira@x.com'), 'Nelson Madeira');
  assert.equal(displayName('nelson@x.com', 'nelson@x.com'), 'Nelson'); // name==email -> derive
});

test('initials: first+last initial, or first two letters for a single name', () => {
  assert.equal(initials('Nelson Madeira'), 'NM');
  assert.equal(initials('Otavio'), 'OT');
  assert.equal(initials(displayName('', 'nelson.madeira@x.com')), 'NM');
});

test('isDerived flags e-mail-only identities', () => {
  assert.equal(isDerived('Nelson', 'n@x.com'), false);
  assert.equal(isDerived('', 'n@x.com'), true);
  assert.equal(isDerived('n@x.com', 'n@x.com'), true);
});
