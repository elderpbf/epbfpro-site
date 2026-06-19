// Shared access panel (js/access-panel.js): the per-turma gating switches, used
// by BOTH the cohort dossier and the Alunos tab. Behavioral test on the pure
// render + the save wiring, plus source assertions that both hosts consume it
// (no duplicated settings logic) and that the dossier sections are collapsible.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { settingsHtml, wireSettings, enrollmentHtml, loadEnrollment, clearEnrollTimer } from '../js/access-panel.js';

const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('settingsHtml reflects the turma state', () => {
  const on = settingsHtml({ access_gated: 1, gate_mode: 'upfront', certificates_enabled: 1 });
  assert.match(on, /class="cdx-acc-gated"[^>]*checked/, 'gated checked');
  assert.match(on, /value="upfront" selected/, 'mode preselected');
  assert.match(on, /class="cdx-acc-certs"[^>]*checked/, 'certs checked');
  assert.match(on, /class="cdx-btn cdx-acc-save"/, 'has a save button');

  const off = settingsHtml({ access_gated: 0 });
  assert.ok(!/class="cdx-acc-gated"[^>]*checked/.test(off), 'gated unchecked when off');
  assert.match(off, /class="cdx-acc-mode" disabled/, 'mode disabled when not gated');
});

test('wireSettings saves only the access columns and mutates the turma', async () => {
  // Minimal fake DOM scope + api, enough to drive the save handler.
  const els = {
    '.cdx-acc-gated': { checked: true, addEventListener(ev, fn) { this[ev] = fn; } },
    '.cdx-acc-mode':  { value: 'upfront', disabled: false },
    '.cdx-acc-certs': { checked: true },
    '.cdx-acc-save':  { disabled: false, addEventListener(ev, fn) { this[ev] = fn; } },
    '.cdx-acc-msg':   { textContent: '' },
  };
  const scope = { querySelector: (s) => els[s] };
  let sent = null;
  const api = { updateTurmaMeta: async (p) => { sent = p; return { ok: true }; } };
  const turma = { access_gated: 0, gate_mode: 'inline', certificates_enabled: 0 };

  wireSettings(scope, turma, { api, clientSlug: 'tjse', slug: 'turma-2025-1' });
  await els['.cdx-acc-save'].click();

  assert.deepEqual(sent, {
    client_slug: 'tjse', slug: 'turma-2025-1',
    access_gated: 1, gate_mode: 'upfront', certificates_enabled: 1,
  });
  assert.ok(!('whatsapp_url' in sent), 'does not touch whatsapp/classpulse (conditional update)');
  assert.equal(turma.access_gated, 1, 'turma row kept in sync');
  assert.equal(turma.certificates_enabled, 1);
});

test('the cohort dossier mounts the shared panel into a collapsible Acesso section', () => {
  const src = read('../cohorts/cohorts.js');
  assert.match(src, /from '\.\.\/js\/access-panel\.js'/, 'imports the shared module');
  assert.match(src, /id="cdx-doss-acesso"/, 'has the Acesso mount point');
  assert.match(src, /accessSettingsHtml\(turma\)/, 'renders the shared settings');
  assert.match(src, /wireAccessSettings\(accEl, turma/, 'wires the shared settings');
  assert.match(src, /<details class="cdx-doss-sec"/, 'sections are collapsible');
});

test('the cohort dossier mounts the QR enrollment window from the shared module', () => {
  const src = read('../cohorts/cohorts.js');
  assert.match(src, /enrollmentHtml, loadEnrollment, clearEnrollTimer/, 'imports the enrollment exports');
  assert.match(src, /enrollmentHtml\(\)/, 'renders the enroll card body in Acesso');
  assert.match(src, /loadEnrollment\(accEl, accOpts\)/, 'loads the enroll state into the Acesso scope');
  // The countdown is torn down when the dossier re-renders and when the tab unmounts.
  assert.match(src, /clearEnrollTimer\(\);[^]*function _renderDossier|_renderDossier[^]*clearEnrollTimer\(\)/, 'clears the timer on dossier re-render');
  assert.match(src, /unmount\(\)[^]*clearEnrollTimer\(\)/, 'clears the timer on unmount');
});

test('enrollmentHtml is the body placeholder the host frames', () => {
  assert.match(enrollmentHtml(), /cdx-al-enroll-body/, 'has the enroll body mount point');
});

test('loadEnrollment renders the closed-state one-button QR (mint-if-none)', async () => {
  const qb = { addEventListener() {} };
  const box = { innerHTML: '', querySelector: () => qb };
  const scope = { querySelector: (s) => (s === '.cdx-al-enroll-body' ? box : null) };
  const api = { getEnrollment: async () => ({ ok: true, open: false }) };
  await loadEnrollment(scope, { api, clientSlug: 'tjse', slug: 'turma-2025-1' });
  assert.match(box.innerHTML, /cdx-al-enroll-qr/, 'shows the QR button');
  assert.match(box.innerHTML, /cdx-al-qrglyph/, 'with the QR glyph');
  clearEnrollTimer();
});

test('loadEnrollment shows the error state when the api fails', async () => {
  const box = { innerHTML: '', querySelector: () => ({ addEventListener() {} }) };
  const scope = { querySelector: () => box };
  const api = { getEnrollment: async () => { throw new Error('boom'); } };
  await loadEnrollment(scope, { api, clientSlug: 'x', slug: 'y' });
  assert.match(box.innerHTML, /cdx-acc-msg/, 'renders an error message, not a crash');
});

test('the Alunos tab consumes the same shared panel (no duplicated settings logic)', () => {
  const src = read('../alunos/alunos.js');
  assert.match(src, /from '\.\.\/js\/access-panel\.js'/, 'imports the shared module');
  assert.match(src, /accessSettingsHtml\(_current\)/, 'renders via the shared module');
  assert.ok(!/class="cdx-al-gated"/.test(src), 'old inline gated control removed');
});
