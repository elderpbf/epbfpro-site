// cohorts/students.js
// "Alunos" sub-tab of Cohorts (track-28a2): the cross-turma deduped roster, in GLOBAL scope.
//
// This file is now only the SCOPE: load (no turma filter), filter/sort/search, the dupes button
// and the global actions. The list itself — rows, columns, expansion, the "+", the hovers — is
// cohorts/person-list.js, the exact component the turma dossiê renders in `turma` scope. Élder:
// "both the participant list in the dossier and this one should be the same list looking exactly
// the same with the same options. The only difference is that in the cohort it is pre-filtered
// for that cohort." So: same component, same data (ct_list_people), different filter.
//
// ACTIONS HERE ARE GLOBAL (Élder 2026-07-14): aprovar/bloquear/desbloquear/remover apply to EVERY
// turma of the selected people, fanning out only over the turmas where the action actually applies.
// Per-turma changes are made inside the cohort. Access still LIVES per-turma on the participant row
// (the a1 invariant): this view writes many rows at once, it never keys authorization off the
// identity. The name edit writes the LOCKED canonical name, the single source of truth.
//
// The bulk toolbar + selection come from roster-actions.js and the edit modal from
// participant-edit.js, both shared with the turma Participantes panel (no duplicated code).
// Routed here by cohorts.js when ctx.sub === 'alunos'.

import { cohorts as api } from '../js/codex-api.js';
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import * as notice from '../js/notice.js';
import * as toast from '../js/toast.js';
import { hasPending } from './students-filters.js';
import { emptyFilterState, filtersBarHtml, applyFilterChange, applyFilters, applySortClick } from './person-filters.js';
import { toolbarHtml, wireSelection, applyRosterAction } from './roster-actions.js';
import { openPersonEditModal, linesOf } from './participant-edit.js';
import { cleanupButtonHtml, openCleanupModal } from './cleanup-modal.js';
import { cpfValid, emailValid, wireCpfMask } from '../js/person-fields.js';
import { ACTION_RULES, actionTargetStatus } from './participant-view.js';
import { personListHtml } from './person-list.js';
import { openAliasPopover } from './alias-popover.js';
import { legendButtonHtml, openPersonLegend } from './person-legend.js';

let _viewEl = null;
let _people = [];
let _filters = emptyFilterState();   // search / client / status / verified / turmas / sort — shared shape
let _expanded = {};
let _dupes = [];      // candidate duplicate pairs awaiting a verdict (ct_find_duplicates)
let _tests = [];      // registrations that look like throwaway tests (ct_find_test_accounts)

function _q(sel) { return _viewEl ? _viewEl.querySelector(sel) : null; }
function _byId(pid) { return _people.find((s) => String(s.id) === String(pid)); }

// ── derived facts ─────────────────────────────────────────────────────────────────
// The participant rows an action would actually touch for this person (shared participant-view
// rules, same list the turma panel uses).
function _targets(s, act) {
  const rule = ACTION_RULES[act];
  if (!rule) return [];
  return (s.rows || [])
    .filter((x) => rule({ status: x.access_status, verified: !!x.email_verified }))
    .map((x) => x.participant_id);
}

// The filter/search/sort bar is cohorts/person-filters.js, shared with the dossiê — it is what
// replaced the dossiê's status sections, so the same question is answered the same way in both
// scopes. Only the Limpeza button is scope-specific: both the things it cleans up (duplicate
// identities, throwaway registrations) are facts about the whole registry, not about one turma.
function _toolsBar() { return filtersBarHtml(_filters, _people, cleanupButtonHtml(_dupes.length, _tests.length)); }

function _renderShell() {
  _viewEl.innerHTML =
    '<div class="cdx-alunos">' +
      '<div class="cdx-alunos-head">' +
        '<h1 class="cdx-alunos-h1">' + esc(t('alunos.title')) + '</h1>' +
        '<div class="cdx-alunos-stats" id="cdx-al-stats"></div>' +
        // The "?" beside the title (Élder): the same legend the dossiê opens, so the scheme explains
        // itself months from now on whichever list you happen to be looking at.
        legendButtonHtml() +
      '</div>' +
      '<div class="cdx-alunos-card">' +
        '<div id="cdx-al-tools"></div>' +
        '<div id="cdx-al-roster"></div>' +
      '</div>' +
    '</div>';
  // Delegated once on the stable hosts, so the inner HTML can be repainted freely.
  const tools = _q('#cdx-al-tools');
  if (tools) {
    tools.addEventListener('input', (e) => {
      if (!applyFilterChange(_filters, e.target.id, e.target.value)) return;
      _paintList();   // typing must not re-render the bar under the cursor
    });
    tools.addEventListener('change', (e) => {
      if (!applyFilterChange(_filters, e.target.id, e.target.value)) return;
      _repaint();
    });
    // The Limpeza tool: its counter says how much — duplicates + test registrations — awaits a verdict.
    tools.addEventListener('click', (e) => {
      if (e.target.closest('#cdx-al-dupes')) openCleanupModal({ pairs: _dupes, tests: _tests }, () => _load());
    });
  }
  // The "?" sits in the head, not the tools bar, so it gets its own listener there.
  const headEl = _q('.cdx-alunos-head');
  if (headEl) headEl.addEventListener('click', (e) => {
    if (e.target.closest('#cdx-pl-help')) openPersonLegend({ scope: 'global' });
  });
  const roster = _q('#cdx-al-roster');
  if (roster) roster.addEventListener('click', (e) => {
    // Selection (checkbox) and the bulk toolbar are owned by roster-actions; ignore them here.
    if (e.target.closest('.cdx-pchk') || e.target.closest('.cdx-ptb')) return;
    // "Ir para a turma" — on the person's own line (single turma) or on a per-turma sub-line.
    // The params are fclient/fturma/fdtab, NOT client/turma: index.html's router only reads the f-
    // prefixed ones (see its `params.get('fclient')`), so the old names silently deep-linked to
    // nothing and dropped you on the bare, unselected Turmas rail. And fdtab is explicit because its
    // default with no faula is 'forum' — from a people list the panel you want is Participantes.
    const goBtn = e.target.closest('.cdx-pl-go');
    if (goBtn) {
      e.stopPropagation();
      location.href = '/codex/?tab=cohorts&sub=turmas&fclient=' + encodeURIComponent(goBtn.dataset.client) +
        '&fturma=' + encodeURIComponent(goBtn.dataset.turma) + '&fdtab=participantes';
      return;
    }
    // The "+": this person's other addresses, in a small window (Élder).
    const plus = e.target.closest('.cdx-pl-plus');
    if (plus) {
      e.stopPropagation();
      const s = _byId((plus.closest('.cdx-pl-row') || {}).dataset ? plus.closest('.cdx-pl-row').dataset.person : '');
      openAliasPopover(plus, (plus.dataset.aliases || '').split(',').filter(Boolean), s && s.email);
      return;
    }
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      e.stopPropagation();
      const row = editBtn.closest('.cdx-pl-row');
      const s = row && _byId(row.dataset.person);
      if (s) _openEdit(s);
      return;
    }
    // Sorting: the column headers are the control now, so the click lands here on the delegated
    // host — the header itself is rebuilt on every repaint, and a handler bound to it would die.
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) {
      e.stopPropagation();
      if (applySortClick(_filters, sortBtn.dataset.sort)) _paintList();
      return;
    }
    // ANYWHERE on the line expands it (Élder: "clicking the line should extend it, instead of just
    // clicking the chevron"). One path, reached after the checkbox/edit/+/→ early-returns above, so
    // a caret click can't toggle twice. A person with ONE turma has nothing to open: no caret, no
    // detail, and this is a clean no-op for them.
    const row = e.target.closest('.cdx-pl-row');
    if (!row || !row.classList.contains('cdx-pl-row--exp')) return;
    e.stopPropagation();
    _expanded[row.dataset.person] = !_expanded[row.dataset.person];
    const detail = row.nextElementSibling;
    if (detail && detail.classList.contains('cdx-pl-detail')) detail.hidden = !_expanded[row.dataset.person];
    const caret = row.querySelector('[data-caret]');
    if (caret) caret.setAttribute('aria-expanded', _expanded[row.dataset.person] ? 'true' : 'false');
  });
}


// The rows themselves are person-list.js (the SAME component the dossiê renders). This file no
// longer owns a renderer: the old private _row/_detail here, and the dossiê's _pRow over in
// cohorts.js, were two implementations of one list — which is exactly how they came to disagree
// about the same data. Élder: "nothing inside of this project should duplicate code."

function _filtered() { return applyFilters(_people, _filters); }

// ── global actions (fan out across every turma the action applies to) ────────────────
async function _applyGlobal(act, people) {
  const ids = [];
  people.forEach((s) => { _targets(s, act).forEach((id) => ids.push(id)); });
  if (!ids.length) return;
  if (act === 'remove' && typeof confirm === 'function' && !confirm(t('alunos.remove_confirm_global'))) return;
  try {
    await applyRosterAction(act, ids);   // the SAME apply the turma panel uses
  } catch (e) {
    notice.internal('alunos: ' + act + ' failed: ' + (e && e.message || e));
  } finally {
    _load();
  }
}

// PURE. The person's addresses as the box shows them: the primary FIRST, then the aliases. The
// order is the meaning, so it is not sorted (Élder 2026-07-15: "o que é o principal é o primeiro
// da linha").
export function emailBoxValue(person) {
  const p = person || {};
  return [p.email, ...(p.aliases || [])].filter(Boolean).join('\n');
}

// The identity edit. The name writes the LOCKED canonical (one source of truth, every surface
// reading it gets the fix). The e-mail is a BOX, not a field (track-42): a person can answer to
// more than one address, and a single field could not show the aliases they already have — the one
// place you edit an address was the one place that denied the others existed.
function _openEdit(s) {
  openPersonEditModal({
    title: t('alunos.edit_title'),
    // The SAME fields as the turma panel, e-mail included (Élder 2026-07-15: "the duplications
    // modal is a place to FIND duplications, but I should still be able to change the email of any
    // person"). The CPF belongs to the person, so editing it here writes it to every turma row.
    fields: [
      { key: 'name', label: t('cohorts.participant_name'), value: s.name || '', required: true,
        validate: (v) => (v ? null : t('cohorts.name_required')) },
      { key: 'email', label: t('alunos.emails_label'), value: emailBoxValue(s), required: true,
        multiline: true, rows: 3, hint: t('alunos.emails_hint'),
        placeholder: t('cohorts.participant_email_ph'),
        validate: (v) => {
          const lines = linesOf(v);
          if (!lines.length) return t('cohorts.email_required');
          return lines.every(emailValid) ? null : t('cohorts.email_invalid');
        } },
      { key: 'cpf', label: t('cohorts.participant_cpf'), value: s.cpf || '', maxlength: 14,
        placeholder: t('cohorts.participant_cpf_ph'), onMount: (el) => wireCpfMask(el), secret: true,
        validate: (v) => (!v.replace(/\D/g, '') || cpfValid(v) ? null : t('cohorts.cpf_invalid')) },
    ],
    onSave: async (vals) => {
      await api.setCanonicalName({ student_id: s.id, name: vals.name });
      // One save for the whole box: line 1 is the identity key (rewritten on the identity AND every
      // row at once, never row-by-row), the rest are aliases. Sending it unchanged is a no-op
      // server-side, but skipping the call keeps a pointless write out of the log.
      const emails = linesOf(vals.email).map((x) => x.toLowerCase());
      if (emails.join('\n') !== emailBoxValue(s).toLowerCase()) {
        const r = await api.setPersonEmails({ student_id: s.id, emails });
        if (r && r.error === 'email_belongs_to_another_person') { notice.warn(t('alunos.email_taken').replace('{email}', r.email || '')); return; }
        if (r && r.error) { notice.internal('alunos: set e-mails: ' + r.error); return; }
        // Changing the PRIMARY resets validation — they proved a DIFFERENT inbox. Say it here
        // instead of letting it surprise them later. Editing only aliases proves nothing new.
        if (r && r.revalidation_required) toast.info(t('alunos.email_changed_revalidate'));
      }
      const cpf = vals.cpf.replace(/\D/g, '') ? vals.cpf : null;
      if ((s.cpf || null) !== cpf) {
        for (const x of (s.rows || [])) await api.updateParticipant({ id: x.participant_id, cpf });
      }
      await _load();
    },
    savedMsg: t('cohorts.participant_updated'),
  });
}

// ── paint ────────────────────────────────────────────────────────────────────────────
function _paintStats() {
  const el = _q('#cdx-al-stats');
  if (!el) return;
  const total = _people.length;
  const multi = _people.filter((s) => s.turma_count > 1).length;
  const pend = _people.filter(hasPending).length;
  el.innerHTML =
    '<span class="cdx-al-stat">' + t('alunos.stat_total').replace('{n}', total) + '</span>' +
    '<span class="cdx-al-stat">' + t('alunos.stat_multi').replace('{n}', multi) + '</span>' +
    (pend ? '<span class="cdx-al-stat warn">' + t('alunos.stat_pending').replace('{n}', pend) + '</span>' : '');
}

function _paintTools() {
  const el = _q('#cdx-al-tools');
  if (el) el.innerHTML = _toolsBar();
}

function _paintList() {
  const host = _q('#cdx-al-roster');
  if (!host) return;
  // Carry the selection across a repaint (expand / filter / sort), keyed by identity.
  const keep = new Set(Array.prototype.slice.call(host.querySelectorAll('.cdx-pl-row .cdx-pchk'))
    .filter((c) => c.checked).map((c) => c.closest('.cdx-pl-row').dataset.person));

  if (!_people.length) { host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.empty')) + '</span>'; return; }
  const rows = _filtered();
  if (!rows.length) { host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.no_match')) + '</span>'; return; }
  // THE list, in global scope. The dossiê renders the same call with scope 'turma'.
  host.innerHTML = toolbarHtml(true) + personListHtml(rows, { scope: 'global', sort: _filters.sort, dir: _filters.dir });

  Array.prototype.slice.call(host.querySelectorAll('.cdx-pl-row')).forEach((r) => {
    if (keep.has(r.dataset.person)) { const c = r.querySelector('.cdx-pchk'); if (c) c.checked = true; }
    // Re-open whatever was open before the repaint.
    if (_expanded[r.dataset.person]) {
      const d = r.nextElementSibling;
      if (d && d.classList.contains('cdx-pl-detail')) d.hidden = false;
      const car = r.querySelector('[data-caret]');
      if (car) car.setAttribute('aria-expanded', 'true');
    }
  });

  wireSelection(host, {
    rowSel: '.cdx-pl-row',
    chkSel: '.cdx-pchk',
    ignoreSel: '[data-edit],[data-caret],.cdx-pl-plus,.cdx-pl-go',
    rowClickToggles: false,           // a row-click expands here; the checkbox owns selection
    // EVERY selected person must be actionable, exactly like the participants panel: selecting a
    // batch that is mostly already approved must not offer "Aprovar" (Élder 2026-07-14).
    enabledFor: (act, rowEls) => rowEls.every((r) => { const s = _byId(r.dataset.person); return !!(s && _targets(s, act).length); }),
    onApply: (act, rowEls) => _applyGlobal(act, rowEls.map((r) => _byId(r.dataset.person)).filter(Boolean)),
  });
}

function _repaint() { _paintStats(); _paintTools(); _paintList(); }

// ── load ─────────────────────────────────────────────────────────────────────────
function _load() {
  const host = _q('#cdx-al-roster');
  if (host) host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.loading')) + '</span>';
  // Neither cleanup scan may ever break the roster, so each failure degrades to "no candidates" on
  // its own — the list is the job here, the Limpeza button is an extra.
  return Promise.all([
    api.listPeople({}).then((d) => { _people = (d && d.people) || []; }),
    api.findDuplicates({}).then((d) => { _dupes = (d && d.pairs) || []; })
      .catch((e) => { _dupes = []; notice.internal('alunos: duplicate scan failed: ' + (e && e.message || e)); }),
    api.findTestAccounts({}).then((d) => { _tests = (d && d.people) || []; })
      .catch((e) => { _tests = []; notice.internal('alunos: test-account scan failed: ' + (e && e.message || e)); }),
  ]).then(() => _repaint()).catch((e) => {
    notice.internal('alunos: load students failed: ' + (e && e.message || e));
    if (host) host.innerHTML = '<span class="cdx-empty">' + esc(t('alunos.load_error')) + '</span>';
  });
}

// ── lifecycle ────────────────────────────────────────────────────────────────────
export function mount(viewEl) {
  _viewEl = viewEl;
  _people = []; _dupes = []; _tests = []; _filters = emptyFilterState(); _expanded = {};
  _renderShell();
  _load();
}

export function unmount() {
  _viewEl = null;
  _people = [];
  _dupes = [];
  _tests = [];
  _expanded = {};
}
