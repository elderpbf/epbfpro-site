// Shared access panel (js/access-panel.js): the per-turma gating switches, used
// by BOTH the cohort dossier and the Alunos tab. Behavioral test on the pure
// render + the save wiring, plus source assertions that both hosts consume it
// (no duplicated settings logic) and that the dossier sections are collapsible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { settingsHtml, wireSettings } from '../js/access-panel.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('settingsHtml reflects the turma state', () => {
  const on = settingsHtml({ access_gated: 1, gate_mode: 'upfront', certificates_enabled: 1, enrollment_prompt_enabled: 1, direct_access_enabled: 1, forum_enabled: 1, notifications_enabled: 1 });
  assert.match(on, /class="cdx-acc-grid"/, 'rows wrapped in the responsive grid');
  assert.match(on, /class="cdx-acc-gated"[^>]*checked/, 'gated checked');
  assert.match(on, /value="upfront" selected/, 'mode preselected');
  assert.match(on, /class="cdx-acc-certs"[^>]*checked/, 'certs checked');
  assert.match(on, /class="cdx-acc-prompt"[^>]*checked/, 'cadastro prompt checked');
  assert.match(on, /class="cdx-acc-direct"[^>]*checked/, 'direct access checked');
  assert.match(on, /class="cdx-acc-forum"[^>]*checked/, 'forum checked');
  assert.match(on, /class="cdx-acc-notif"[^>]*checked/, 'notifications checked');
  assert.match(on, /class="cdx-btn cdx-acc-save"/, 'has a save button');

  const off = settingsHtml({ access_gated: 0 });
  assert.ok(!/class="cdx-acc-gated"[^>]*checked/.test(off), 'gated unchecked when off');
  assert.ok(!/class="cdx-acc-prompt"[^>]*checked/.test(off), 'cadastro prompt unchecked when off');
  assert.ok(!/class="cdx-acc-forum"[^>]*checked/.test(off), 'forum unchecked when off');
  assert.ok(!/class="cdx-acc-notif"[^>]*checked/.test(off), 'notifications unchecked when off');
  assert.match(off, /class="cdx-acc-mode" disabled/, 'mode disabled when not gated');
});

test('wireSettings saves only the access columns and mutates the turma', async () => {
  // Minimal fake DOM scope + api, enough to drive the save handler.
  const els = {
    '.cdx-acc-gated': { checked: true, addEventListener(ev, fn) { this[ev] = fn; } },
    '.cdx-acc-mode':  { value: 'upfront', disabled: false },
    '.cdx-acc-certs': { checked: true },
    '.cdx-acc-prompt':{ checked: true },
    '.cdx-acc-direct':{ checked: true },
    '.cdx-acc-forum': { checked: true },
    '.cdx-acc-notif': { checked: false },
    '.cdx-acc-save':  { disabled: false, addEventListener(ev, fn) { this[ev] = fn; } },
    '.cdx-acc-msg':   { textContent: '' },
  };
  const scope = { querySelector: (s) => els[s] };
  let sent = null;
  const api = { updateTurmaMeta: async (p) => { sent = p; return { ok: true }; } };
  const turma = { access_gated: 0, gate_mode: 'inline', certificates_enabled: 0, enrollment_prompt_enabled: 0, direct_access_enabled: 0, forum_enabled: 0, notifications_enabled: 0 };

  wireSettings(scope, turma, { api, clientSlug: 'tjse', slug: 'turma-2025-1' });
  await els['.cdx-acc-save'].click();

  assert.deepEqual(sent, {
    client_slug: 'tjse', slug: 'turma-2025-1',
    access_gated: 1, gate_mode: 'upfront', certificates_enabled: 1, enrollment_prompt_enabled: 1,
    direct_access_enabled: 1, forum_enabled: 1, notifications_enabled: 0,
  });
  assert.ok(!('whatsapp_url' in sent), 'does not touch whatsapp/classpulse (conditional update)');
  assert.equal(turma.access_gated, 1, 'turma row kept in sync');
  assert.equal(turma.certificates_enabled, 1);
  assert.equal(turma.enrollment_prompt_enabled, 1, 'cadastro prompt flag kept in sync');
  assert.equal(turma.forum_enabled, 1, 'forum flag kept in sync');
  assert.equal(turma.notifications_enabled, 0, 'notifications flag kept in sync');
});

test('the cohort dossier mounts the shared panel into the Dados tab', () => {
  const src = read('../cohorts/cohorts.js');
  assert.match(src, /from '\.\.\/js\/access-panel\.js'/, 'imports the shared module');
  assert.match(src, /id="cdx-doss-acesso"/, 'has the Acesso mount point');
  assert.match(src, /accessSettingsHtml\(turma\)/, 'renders the shared settings');
  assert.match(src, /wireAccessSettings\(accEl, turma/, 'wires the shared settings');
  // Phase 8: the section stack became per-turma sub-tab panels.
  assert.match(src, /data-dpanel="dados"/, 'dossier uses tab panels');
  assert.match(src, /data-dtab="forum"/, 'dossier has a Fórum tab');
});

test('the Alunos tab consumes the same shared panel (no duplicated settings logic)', () => {
  const src = read('../alunos/alunos.js');
  assert.match(src, /from '\.\.\/js\/access-panel\.js'/, 'imports the shared module');
  assert.match(src, /accessSettingsHtml\(_current\)/, 'renders via the shared module');
  assert.ok(!/class="cdx-al-gated"/.test(src), 'old inline gated control removed');
});
