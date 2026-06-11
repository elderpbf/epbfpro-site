// bank-picker.test.mjs — pure logic for the live-host bank picker redesign
// (Ideia A v2). Three audience-driven policies: which bank questions show for a
// chosen audience (bankVisible), which type chips are available (availableTypeFilters),
// and whether the audience control renders as pills or a dropdown
// (audienceControlMode, the 2b hybrid). Zero dependencies, node:test only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bankVisible, availableTypeFilters, audienceControlMode } from '../js/audiences.js';

const generic  = { question: 'O que é um token?' };
const variable = { question: 'Como {{actor_role}} usa IA?' };
const uAdv     = { question: 'Cláusulas de um contrato?', audience: 'advocacia' };
const uJud     = { question: 'Fundamentação da decisão?', audience: 'judiciario' };

test('bankVisible: no audience shows ONLY generic (a variable cannot be morphed yet)', () => {
  assert.equal(bankVisible(generic, ''), true);
  assert.equal(bankVisible(variable, ''), false);
  assert.equal(bankVisible(uAdv, ''), false);
  // null/undefined audience behaves like "no audience"
  assert.equal(bankVisible(variable, null), false);
  assert.equal(bankVisible(generic, undefined), true);
});

test('bankVisible: an audience shows generic + variable + only its own unique', () => {
  assert.equal(bankVisible(generic, 'advocacia'), true);
  assert.equal(bankVisible(variable, 'advocacia'), true);
  assert.equal(bankVisible(uAdv, 'advocacia'), true);
  // the other audience's specific stays hidden
  assert.equal(bankVisible(uJud, 'advocacia'), false);
  assert.equal(bankVisible(uAdv, 'judiciario'), false);
});

test('availableTypeFilters: no audience -> only Todas + Genéricas', () => {
  assert.deepEqual(availableTypeFilters(''), ['all', 'generic']);
  assert.deepEqual(availableTypeFilters(null), ['all', 'generic']);
  assert.deepEqual(availableTypeFilters(undefined), ['all', 'generic']);
});

test('availableTypeFilters: an audience unlocks Variáveis + Específicas', () => {
  assert.deepEqual(availableTypeFilters('advocacia'), ['all', 'generic', 'variable', 'unique']);
});

test('audienceControlMode: pills up to 3 real audiences (4 incl Sem audiência), dropdown beyond', () => {
  assert.equal(audienceControlMode(0), 'pills');
  assert.equal(audienceControlMode(1), 'pills');
  assert.equal(audienceControlMode(2), 'pills');
  assert.equal(audienceControlMode(3), 'pills');
  assert.equal(audienceControlMode(4), 'dropdown');
  assert.equal(audienceControlMode(9), 'dropdown');
});

test('audienceControlMode tolerates junk input (treats it as zero)', () => {
  assert.equal(audienceControlMode(undefined), 'pills');
  assert.equal(audienceControlMode(null), 'pills');
  assert.equal(audienceControlMode(-1), 'pills');
});
