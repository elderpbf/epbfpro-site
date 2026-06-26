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

test('settingsHtml reflects the turma state (collapsed: one gate)', () => {
  const on = settingsHtml({ access_gated: 1, gate_mode: 'upfront', certificates_enabled: 1, enrollment_prompt_enabled: 1, direct_access_enabled: 1, forum_enabled: 1 });
  assert.match(on, /class="cdx-acc-grid"/, 'rows wrapped in the responsive grid');
  assert.match(on, /class="cdx-acc-gated"[^>]*checked/, 'gated checked');
  assert.match(on, /class="cdx-acc-certs"[^>]*checked/, 'certs checked');
  assert.match(on, /class="cdx-acc-forum"[^>]*checked/, 'forum checked');
  assert.match(on, /class="cdx-btn cdx-acc-save"/, 'has a save button');
  // #4 collapse: the mode select + enroll_prompt + direct_access controls are retired.
  assert.ok(!/class="cdx-acc-mode"/.test(on), 'no mode select');
  assert.ok(!/class="cdx-acc-prompt"/.test(on), 'no enroll-prompt toggle');
  assert.ok(!/class="cdx-acc-direct"/.test(on), 'no direct-access toggle');
  // The standalone notifications toggle was retired (the bell follows forum_enabled).
  assert.ok(!/class="cdx-acc-notif"/.test(on), 'no notifications toggle');

  const off = settingsHtml({ access_gated: 0 });
  assert.ok(!/class="cdx-acc-gated"[^>]*checked/.test(off), 'gated unchecked when off');
  assert.ok(!/class="cdx-acc-forum"[^>]*checked/.test(off), 'forum unchecked when off');
});

test('wireSettings saves only the access columns and mutates the turma', async () => {
  // Minimal fake DOM scope + api, enough to drive the save handler.
  const els = {
    '.cdx-acc-gated': { checked: true, addEventListener(ev, fn) { this[ev] = fn; } },
    '.cdx-acc-simple': { checked: true },
    '.cdx-acc-certs': { checked: true },
    '.cdx-acc-forum': { checked: true },
    '.cdx-acc-save':  { disabled: false, addEventListener(ev, fn) { this[ev] = fn; } },
    '.cdx-acc-msg':   { textContent: '' },
  };
  const scope = { querySelector: (s) => els[s] };
  let sent = null;
  const api = { updateTurmaMeta: async (p) => { sent = p; return { ok: true }; } };
  const turma = { access_gated: 0, certificates_enabled: 0, forum_enabled: 0, notifications_enabled: 0 };

  wireSettings(scope, turma, { api, clientSlug: 'tjse', slug: 'turma-2025-1' });
  await els['.cdx-acc-save'].click();

  assert.deepEqual(sent, {
    client_slug: 'tjse', slug: 'turma-2025-1',
    access_gated: 1, simple_enroll_enabled: 1, certificates_enabled: 1, forum_enabled: 1,
  });
  assert.ok(!('gate_mode' in sent), 'retired mode not sent');
  assert.ok(!('enrollment_prompt_enabled' in sent), 'retired enroll-prompt not sent');
  assert.ok(!('direct_access_enabled' in sent), 'retired direct-access not sent');
  assert.ok(!('notifications_enabled' in sent), 'retired notifications toggle not sent');
  assert.ok(!('whatsapp_url' in sent), 'does not touch whatsapp/classpulse (conditional update)');
  assert.equal(turma.access_gated, 1, 'turma row kept in sync');
  assert.equal(turma.simple_enroll_enabled, 1, 'simple enroll flag kept in sync');
  assert.equal(turma.certificates_enabled, 1);
  assert.equal(turma.forum_enabled, 1, 'forum flag kept in sync');
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
