// cohorts/person-legend.js — the "?" reference card, on BOTH lists.
//
// Élder 2026-07-15: "let's put the legend back on both people and participant lists, it's useful 3
// months from now when I forget what we did; just a ? glyph besides Alunos."
//
// The card's job is to still be true in three months, so what these pin is that it describes the
// list AS IT IS (the three concepts + the columns that exist now), not the list it used to describe.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { legendButtonHtml } from '../cohorts/person-legend.js';

const read = (p) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const legendJs = read('../cohorts/person-legend.js');
const studentsJs = read('../cohorts/students.js');
const cohortsJs = read('../cohorts/cohorts.js');
const ptJs = read('../i18n/pt.js');
const enJs = read('../i18n/en.js');

test('the "?" is one glyph and nothing more', () => {
  const h = legendButtonHtml();
  assert.match(h, /id="cdx-pl-help"/);
  assert.match(h, />\?</);
  assert.match(h, /aria-label=/);   // a lone "?" needs a real name for a screen reader
});

test('BOTH lists open the SAME card — that is the whole point of the module', () => {
  assert.match(studentsJs, /import \{ legendButtonHtml, openPersonLegend \} from '\.\/person-legend\.js'/);
  assert.match(studentsJs, /openPersonLegend\(\{ scope: 'global' \}\)/);
  assert.match(cohortsJs, /import \{ openPersonLegend \} from '\.\/person-legend\.js'/);
  assert.match(cohortsJs, /openPersonLegend\(\{ scope: 'turma' \}\)/);
  // ...and no private copy survives in cohorts.js to drift away from it.
  assert.ok(!/function _openParticipantsHelp/.test(cohortsJs));
});

test('the roster renders the "?" beside its title, where Élder asked for it', () => {
  assert.match(studentsJs, /cdx-alunos-head[\s\S]{0,400}legendButtonHtml\(\)/);
});

test('it explains THE THREE CONCEPTS — the thing nobody reconstructs from memory', () => {
  // Élder: "it's very important that you understand these three concepts and they should be noted
  // in the documentation." access.md has them; this is the same thing where he can see it.
  assert.match(legendJs, /phelp_concepts_h/);
  ['phelp_c_approval', 'phelp_c_validation', 'phelp_c_access'].forEach((k) => {
    assert.match(legendJs, new RegExp(k), k + ' is in the card');
  });
});

test('the concepts card carries the real rules, not a vague gloss', () => {
  // The constants from access.md §Constantes. If these drift, the card lies.
  assert.match(ptJs, /15 dias/);
  assert.match(ptJs, /12h/);
  assert.match(ptJs, /8h/);
  // Validation grants nothing on its own — the single most confusable rule of the three.
  assert.match(ptJs, /'cohorts\.phelp_c_validation':\s*'[^']*não dá acesso nenhum/);
});

test('it covers the columns that exist NOW, not the ones the old card knew', () => {
  // The old legend predates validação and acesso as columns; a card that skipped them would be
  // explaining a list nobody is looking at.
  assert.match(legendJs, /phelp_val_h/);
  assert.match(legendJs, /phelp_acc_h/);
  ['phelp_validado', 'phelp_nao_validado', 'phelp_acc_live', 'phelp_acc_lapsed', 'phelp_acc_never']
    .forEach((k) => assert.match(legendJs, new RegExp(k), k));
});

test('it explains the marks: the fraction, the caret, the "+"', () => {
  ['phelp_frac', 'phelp_caret', 'phelp_plus'].forEach((k) => assert.match(legendJs, new RegExp(k), k));
});

test('the swatches are REAL badges, so they cannot drift from the rows', () => {
  // Built from access-model's own maps rather than hardcoded classes: a colour change (or the dot
  // removal) reaches the legend without anyone remembering to update it.
  assert.match(legendJs, /import \{ ORIGIN_I18N, ORIGIN_TONE \} from '\.\.\/js\/access-model\.js'/);
  assert.match(legendJs, /ORIGIN_TONE\[origin\]/);
  assert.ok(!/cdx-badge-primary', 'access\.origin_lista'/.test(legendJs), 'no hardcoded origin classes');
});

test('turma scope drops the rows that cannot happen inside one turma', () => {
  // In a turma every person has exactly one row: no fraction, no caret. Explaining them there would
  // be explaining something that never renders.
  assert.match(legendJs, /turmaScope \? '' :[\s\S]{0,200}phelp_frac/);
});

test('every new legend key exists in BOTH dictionaries', () => {
  const keys = [...legendJs.matchAll(/'(cohorts\.phelp_[a-z_]+)'/g)].map((m) => m[1]);
  assert.ok(keys.length >= 10, 'found the keys');
  for (const k of new Set(keys)) {
    const re = new RegExp("'" + k.replace(/\./g, '\\.') + "'");
    assert.match(ptJs, re, k + ' in pt');
    assert.match(enJs, re, k + ' in en');
  }
});

// ── the rename ───────────────────────────────────────────────────────────────────────
// Élder: "the subtab should not be called Alunos anymore — change to users (I know this is not full
// access control, but it's what we have and alunos is wrong)."
test('the subtab and the list read Usuários, never Alunos', () => {
  assert.match(ptJs, /'cohorts\.sub_alunos':\s*'Usuários',/);
  assert.match(ptJs, /'alunos\.title':\s*'Usuários',/);
  assert.match(enJs, /'cohorts\.sub_alunos':\s*'Users',/);
  assert.match(enJs, /'alunos\.title':\s*'Users',/);
});

test('the stats and the empty states stopped saying aluno too', () => {
  assert.match(ptJs, /'alunos\.stat_total':\s*'\{n\} usuários',/);
  assert.match(ptJs, /'alunos\.empty':\s*'Nenhum usuário ainda\.',/);
  assert.match(ptJs, /'alunos\.no_match':\s*'Nenhum usuário corresponde ao filtro\.',/);
});

test('PT-BR keeps its accents: Usuários, not Usuarios', () => {
  assert.ok(!/'(cohorts\.sub_alunos|alunos\.title)':\s*'Usuarios'/.test(ptJs));
  assert.match(ptJs, /Usuários/);
});

test('only the LABELS changed — the route and the key namespace are untouched', () => {
  // Renaming `sub=alunos` would break any bookmark for nothing, and renaming the alunos.* namespace
  // is dozens of chances to leave a dangling reference for zero user-visible gain. Élder said it
  // should not be CALLED Alunos; that is the label.
  assert.match(cohortsJs, /\{ key: 'alunos', labelKey: 'cohorts\.sub_alunos' \}/);
  assert.match(cohortsJs, /sub === 'alunos'/);
});
