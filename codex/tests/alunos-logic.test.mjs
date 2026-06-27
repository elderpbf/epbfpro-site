// alunos-logic.test.mjs: unit tests for the pure helpers behind the Alunos
// B+C2 redesign: status sectioning/sort, the adaptive-toolbar predicate map, and
// the deterministic avatar (initials + colour). No DOM, no backend.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionParticipants, toolbarState, avatarFor, RULES, SECTION_ORDER } from '../alunos/alunos-logic.js';
import { initials } from '../js/initials.js';

// ── sectionParticipants ───────────────────────────────────────────────────────

test('sectionParticipants returns the three sections in order: pending, approved, denied', () => {
  const secs = sectionParticipants([]);
  assert.deepEqual(secs.map((s) => s.status), ['pending', 'approved', 'denied']);
  assert.deepEqual(SECTION_ORDER, ['pending', 'approved', 'denied']);
});

test('sectionParticipants buckets by access_status', () => {
  const secs = sectionParticipants([
    { id: 1, name: 'A', access_status: 'approved' },
    { id: 2, name: 'B', access_status: 'pending' },
    { id: 3, name: 'C', access_status: 'denied' },
    { id: 4, name: 'D', access_status: 'approved' },
  ]);
  const by = Object.fromEntries(secs.map((s) => [s.status, s.items.map((p) => p.id)]));
  assert.deepEqual(by.pending, [2]);
  assert.deepEqual(by.approved, [1, 4]);
  assert.deepEqual(by.denied, [3]);
});

test('sectionParticipants treats a missing status as pending', () => {
  const secs = sectionParticipants([{ id: 9, name: 'X' }]);
  const pending = secs.find((s) => s.status === 'pending');
  assert.deepEqual(pending.items.map((p) => p.id), [9]);
});

test('sectionParticipants sorts each section by name (locale-aware), display_name wins', () => {
  const secs = sectionParticipants([
    { id: 1, name: 'Zeca', access_status: 'approved' },
    { id: 2, display_name: 'Ana', name: 'zzz', access_status: 'approved' },
    { id: 3, name: 'Bruno', access_status: 'approved' },
  ]);
  const approved = secs.find((s) => s.status === 'approved');
  assert.deepEqual(approved.items.map((p) => p.id), [2, 3, 1]); // Ana, Bruno, Zeca
});

test('sectionParticipants tolerates non-array input', () => {
  assert.equal(sectionParticipants(null).length, 3);
  assert.equal(sectionParticipants(undefined).every((s) => s.items.length === 0), true);
});

// ── toolbarState (adaptive predicates) ────────────────────────────────────────

test('toolbarState: an empty selection disables every action', () => {
  assert.deepEqual(toolbarState([]), {
    aprovar: false, revogar: false, bloquear: false, desbloquear: false, remover: false,
  });
});

test('toolbarState: all pending -> aprovar + bloquear + remover, not revogar/desbloquear', () => {
  assert.deepEqual(toolbarState(['pending', 'pending']), {
    aprovar: true, revogar: false, bloquear: true, desbloquear: false, remover: true,
  });
});

test('toolbarState: all approved -> revogar + bloquear + remover, not aprovar/desbloquear', () => {
  assert.deepEqual(toolbarState(['approved', 'approved']), {
    aprovar: false, revogar: true, bloquear: true, desbloquear: false, remover: true,
  });
});

test('toolbarState: all denied -> desbloquear + remover only', () => {
  assert.deepEqual(toolbarState(['denied']), {
    aprovar: false, revogar: false, bloquear: false, desbloquear: true, remover: true,
  });
});

test('toolbarState: mixed pending+approved -> bloquear + remover, the type-specific ones off', () => {
  assert.deepEqual(toolbarState(['pending', 'approved']), {
    aprovar: false, revogar: false, bloquear: true, desbloquear: false, remover: true,
  });
});

test('toolbarState: any denied in the selection disables bloquear', () => {
  assert.equal(toolbarState(['approved', 'denied']).bloquear, false);
  assert.equal(toolbarState(['approved', 'denied']).remover, true);
});

test('RULES match the bc2 mock predicates exactly', () => {
  assert.equal(RULES.aprovar('pending'), true);
  assert.equal(RULES.aprovar('approved'), false);
  assert.equal(RULES.revogar('approved'), true);
  assert.equal(RULES.revogar('pending'), false);
  assert.equal(RULES.bloquear('denied'), false);
  assert.equal(RULES.bloquear('pending'), true);
  assert.equal(RULES.desbloquear('denied'), true);
  assert.equal(RULES.remover('anything'), true);
});

// ── avatarFor (deterministic) ─────────────────────────────────────────────────

test('avatarFor: deterministic colour from the seed + initials from the name', () => {
  const a = avatarFor(42, 'Ana Lima');
  const b = avatarFor(42, 'Ana Lima');
  assert.deepEqual(a, b);
  assert.equal(a.initials, 'AL');
  assert.match(a.bg, /^rgba\(/);
  assert.match(a.fg, /^#/);
});

test('avatarFor: colour follows the seed, initials follow the name', () => {
  // Same seed, different names -> same colour, different initials.
  const a = avatarFor(7, 'Bruno Souza');
  const b = avatarFor(7, 'Carla Dias');
  assert.equal(a.bg, b.bg);
  assert.equal(a.fg, b.fg);
  assert.equal(a.initials, 'BS');
  assert.equal(b.initials, 'CD');
});

test('avatarFor: varies colour across seeds and tolerates a blank name', () => {
  const bgs = new Set(['1', '2', '3', '4', '5', '6', '7', '8'].map((s) => avatarFor(s, 'X Y').bg));
  assert.ok(bgs.size > 1, 'different seeds can map to different colours');
  const z = avatarFor(null, '');
  assert.equal(z.initials, '');
  assert.ok(z.bg && z.fg, 'null seed + blank name still yields a colour');
});

// ── initials (shared rule, same on Trail + Alunos) ────────────────────────────

test('initials: two or more names -> first letter of the first two, uppercased', () => {
  assert.equal(initials('ana lima'), 'AL');
  assert.equal(initials('João Pedro Silva'), 'JP');
  assert.equal(initials('  Maria   Costa  '), 'MC');
});

test('initials: exactly one name -> its first two letters', () => {
  assert.equal(initials('Maria'), 'MA');
  assert.equal(initials('bo'), 'BO');
  assert.equal(initials('A'), 'A');
});

test('initials: blank / null / undefined -> empty string', () => {
  assert.equal(initials(''), '');
  assert.equal(initials('   '), '');
  assert.equal(initials(null), '');
  assert.equal(initials(undefined), '');
});
