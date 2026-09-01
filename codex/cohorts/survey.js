// codex/cohorts/survey.js
// The turma dossier's Avaliação tab: send the reaction survey, and read what came
// back (track-64 §3.5).
//
// It draws NO question of its own. The instrument preview comes from the shared seam
// js/survey-question.js — the same module the student's gate renders from, so what
// Élder sees here is what the student sees — and every chart comes from
// questions/question-render.js, which already draws the average-plus-bars design the
// JFSE report uses. This file is the frame around those two, plus the one thing only
// the admin side has: the locks, out loud.
//
// LOCKS ARE LOUD HERE AND SILENT ON THE TRAIL (§3.7b). The same five conditions
// decide both, and they live in js/survey-locks.js so they cannot drift. On this
// screen every one that holds is named in full, next to a send button that stays
// visible and greyed rather than disappearing: a lock the admin cannot see is a lock
// he fights blindly.
//
// State is per MOUNT, never at module scope. _ensureDossierDeps re-enters
// _renderDossier (cohorts.js:1405 records the recursion that once blew the stack),
// so a module-level ctx would paint one turma's numbers into another's dossier.
// forum-admin.js has the shape this copies.
import { t } from '../js/i18n.js';
import { esc } from '../js/dom.js';
import { relTime } from '../js/rel-time.js';
import { itemFromRow, questionCard } from '../js/survey-question.js';
import { sendBlocks, canSend, liveQuestions, daysLeft, isClosed } from '../js/survey-locks.js';
import { renderResults } from '../questions/question-render.js';
import { statsFor, respondents } from './survey-stats.js';
import { loadSurvey, scenarioFrom, SCENARIOS } from './survey-stub.js';

// Literal keys, never t('cohorts.aval_block_' + code). A key assembled at runtime is
// invisible to the dead-key sweep, which is the exact trap track-30 documented and
// this feature already fell into once with 'survey.pres_' + v.
const BLOCK_KEY = {
  no_instrument: 'cohorts.aval_block_no_instrument',
  no_invitees: 'cohorts.aval_block_no_invitees',
  already_sent: 'cohorts.aval_block_already_sent',
  closed: 'cohorts.aval_block_closed',
};
const KIND_KEY = {
  rating: 'cohorts.aval_kind_rating',
  poll: 'cohorts.aval_kind_poll',
  wordcloud: 'cohorts.aval_kind_wordcloud',
  open: 'cohorts.aval_kind_open',
};
const STATUS_KEY = {
  draft: 'cohorts.aval_status_draft',
  open: 'cohorts.aval_status_open',
  closed: 'cohorts.aval_status_closed',
};
const SCENARIO_KEY = {
  draft_blocked: 'cohorts.aval_sc_blocked',
  draft_ready: 'cohorts.aval_sc_ready',
  open_partial: 'cohorts.aval_sc_open',
  closed_final: 'cohorts.aval_sc_closed',
};

function fmtDate(unix) {
  if (!unix) return '';
  const d = new Date(unix * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear();
}

// "3", "3 e 4", "1, 3 e 4" — the admin reads aula numbers, not an array literal.
function joinNumbers(nums) {
  const a = (nums || []).map(String);
  if (a.length <= 1) return a[0] || '';
  return a.slice(0, -1).join(', ') + ' ' + t('cohorts.aval_and') + ' ' + a[a.length - 1];
}

// One blocking condition as a sentence. The aulas case carries data, so it picks
// among three literal keys instead of interpolating a fourth.
export function blockText(block, state) {
  const b = block || {};
  if (b.code === 'aulas_pending') {
    const list = b.aulas || [];
    if (!list.length) return t('cohorts.aval_block_aulas_unknown');
    const key = list.length === 1 ? 'cohorts.aval_block_aula_one' : 'cohorts.aval_block_aulas_n';
    return t(key).replace('{n}', joinNumbers(list));
  }
  if (b.code === 'already_sent') {
    return t('cohorts.aval_block_already_sent').replace('{d}', fmtDate(state && state.sent_at));
  }
  const key = BLOCK_KEY[b.code];
  return key ? t(key) : b.code;
}

export function mountSurveyAdmin(el, turma, opts) {
  if (!el) return null;
  const o = opts || {};
  const search = o.search != null ? o.search
    : (typeof location !== 'undefined' ? location.search : '');
  const ctx = {
    el,
    turma,
    scenario: scenarioFrom(search),
    state: null,
    preview: false,
    openIds: new Set(),   // which rows are expanded, kept across a repaint
  };
  reload(ctx);
  return ctx;
}

function reload(ctx) {
  // The one line that becomes cohorts.surveyGet({...}) when the Worker lands.
  ctx.state = loadSurvey(ctx.scenario);
  paint(ctx);
}

function paint(ctx) {
  ctx.el.innerHTML = '<div class="cdx-av">' + switcherHtml(ctx) + bodyHtml(ctx, ctx.state) + '</div>';
  wire(ctx);
}

// ONE surface, three stages. Rascunho travado, rascunho pronto and aberta are the
// same screen at different moments, so they get the same blocks in the same order,
// always: state, action, questions. An earlier build flipped the action block below
// the list after the send and gave the list a second, different head, which made the
// same tab read as two screens (Élder 2026-08-31: "all of these three are the same
// surface just in different stages").
//
// What a stage changes is CONTENT, never arrangement. The action block loses the
// controls that no longer apply and shrinks to a footnote; the rows gain a count and
// a chart. Nothing moves.
export function bodyHtml(ctx, s) {
  return headHtml(s) + sendBlockHtml(s) + instrumentHtml(ctx, s);
}

function switcherHtml(ctx) {
  return '<div class="cdx-av-proto">' +
      '<span class="cdx-av-proto-tag">' + esc(t('cohorts.aval_proto')) + '</span>' +
      '<span class="cdx-av-sw">' +
        SCENARIOS.map((sc) =>
          '<button type="button" class="cdx-av-swb' + (sc.n === ctx.scenario ? ' is-on' : '') + '"' +
            ' data-av-sc="' + sc.n + '">' + esc(t(SCENARIO_KEY[sc.key])) + '</button>').join('') +
      '</span>' +
    '</div>';
}

// The state strip: what the survey IS right now. The response rate lives here and
// not on the list, because it describes the survey rather than the instrument, and
// because one number wants one home across all three stages.
export function headHtml(s) {
  const statusKey = STATUS_KEY[s.status] || STATUS_KEY.draft;
  const line = [];
  if (s.sent_at) line.push(t('cohorts.aval_sent_when').replace('{when}', relTime(s.sent_at, s.now)));
  if (s.closes_at) {
    line.push(isClosed(s)
      ? t('cohorts.aval_closed_on').replace('{d}', fmtDate(s.closes_at))
      : t('cohorts.aval_closes_on').replace('{d}', fmtDate(s.closes_at)));
  }
  if (s.status === 'open' && !isClosed(s)) {
    const d = daysLeft(s);
    line.push(d <= 0 ? t('cohorts.aval_last_day') : t('cohorts.aval_days_left').replace('{n}', String(d)));
  }
  let rate = '';
  if (s.sent_at) {
    const answered = respondents(s.responses);
    const total = s.invited_count != null ? s.invited_count : s.invitees;
    const pct = total ? Math.round(answered / total * 100) : 0;
    rate = '<span class="cdx-av-rate">' +
      esc(t('cohorts.aval_rate').replace('{n}', String(answered)).replace('{total}', String(total))) +
      ' (' + pct + '%)</span>';
  }
  return '<div class="cdx-av-head">' +
      '<span class="cdx-av-pill cdx-av-pill--' + esc(s.status) + '">' + esc(t(statusKey)) + '</span>' +
      (line.length ? '<span class="cdx-av-headline">' + esc(line.join(' · ')) + '</span>' : '') +
      rate +
    '</div>';
}

// The send block, which is the whole point of the admin side. The button is rendered
// with aria-disabled and NOT the disabled attribute: a disabled button receives no
// mouse events, so its title never appears, and the hover diagnosis Élder asked for
// would have been dead on arrival. The reasons are also written out in full, because
// a tooltip is the quietest affordance in HTML and there is no hover at all on the
// phone he reviews from.
export function sendBlockHtml(s) {
  const blocks = sendBlocks(s);
  const ok = !blocks.length;
  const reasons = blocks.map((b) => blockText(b, s));
  const sent = !!s.sent_at;
  const invited = s.invited_count != null ? s.invited_count : s.invitees;
  // A lock is only worth shouting while it is an OBSTACLE. Before the send, each one
  // stands between him and the thing he opened the tab to do, so it is named in
  // visible text (a tooltip is unreachable on the phone he reviews from). Once the
  // survey is out, the same button is greyed because the job is DONE, and an amber
  // "cannot send yet" box over a finished action is noise sitting on top of the
  // numbers. The tooltip keeps the reason either way; only the shouting stops.
  return '<div class="cdx-av-send' + (sent ? ' is-done' : '') + '">' +
      '<div class="cdx-av-send-row">' +
        (sent ? '' :
        '<label class="cdx-av-prazo">' + esc(t('cohorts.aval_deadline')) +
          '<input type="number" min="1" max="90" class="cdx-av-days" value="' + esc(String(s.deadline_days || 7)) + '">' +
          '<span>' + esc(t('cohorts.aval_deadline_days')) + '</span>' +
        '</label>') +
        '<button type="button" class="cdx-btn cdx-btn-primary cdx-av-go' + (ok ? '' : ' is-locked') + '"' +
          (ok ? '' : ' aria-disabled="true" title="' + esc(reasons.join(' ')) + '"') + ' data-av-send>' +
          esc(t('cohorts.aval_send')) +
        '</button>' +
        '<span class="cdx-av-invitees">' +
          esc(t(sent ? 'cohorts.aval_invited' : 'cohorts.aval_invitees').replace('{n}', String(invited))) +
        '</span>' +
      '</div>' +
      (ok || sent ? '' :
        '<div class="cdx-av-blocks">' +
          '<div class="cdx-av-blocks-head">' + esc(t('cohorts.aval_blocked_head')) + '</div>' +
          reasons.map((r) => '<div class="cdx-av-block">' + esc(r) + '</div>').join('') +
        '</div>') +
    '</div>';
}

// THE list of questions, and the only one. It used to be printed twice, once as the
// instrument and again as the results, which restated all ten prompts (Élder
// 2026-08-31: "você está duplicando informação sem necessidade"). One row per
// question: it carries the prompt always, the answer count once there are answers,
// and it opens onto its own chart.
export function instrumentHtml(ctx, s) {
  const items = liveQuestions(s.questions);
  const sent = !!s.sent_at;
  const total = s.invited_count != null ? s.invited_count : s.invitees;
  const rows = items.map((q, i) => {
    const st = sent ? statsFor(q, s.responses) : null;
    const open = ctx.openIds.has(String(q.id));
    const head =
      '<span class="cdx-av-qn">' + (i + 1) + '</span>' +
      '<span class="cdx-av-qkind">' + esc(t(KIND_KEY[q.kind] || KIND_KEY.open)) + '</span>' +
      '<span class="cdx-av-qtext">' + esc(q.prompt) + '</span>' +
      (q.required ? '' : '<span class="cdx-av-qopt">' + esc(t('cohorts.aval_optional')) + '</span>') +
      (st ? '<span class="cdx-av-qsum">' + esc(answersLabel(st.answered)) +
              (st.avg == null ? '' : ' · ' + esc(st.avg.toFixed(1))) + '</span>' +
            '<span class="cdx-av-qcar" aria-hidden="true">▾</span>' : '');
    // Before the send there is nothing to open, so the row is not a control: an
    // inert button that looks pressable is the same lie as a send button offered
    // before it works.
    const clickable = !!st;
    return '<div class="cdx-av-qrow' + (open ? ' is-open' : '') + '">' +
        (clickable
          ? '<button type="button" class="cdx-av-qhead" data-av-row="' + esc(String(q.id)) + '"' +
              ' aria-expanded="' + (open ? 'true' : 'false') + '">' + head + '</button>'
          : '<div class="cdx-av-qhead is-static">' + head + '</div>') +
        (clickable
          ? '<div class="cdx-av-qpanel" data-av-panel="' + esc(String(q.id)) + '"' + (open ? '' : ' hidden') + '>' +
              '<div class="cdx-av-res-meta">' +
                esc(t('cohorts.aval_q_answered').replace('{n}', String(st.answered)).replace('{total}', String(total))) +
              '</div>' +
              // cdx-qr-host is the renderer's OWN dense variant, the one the live
              // host panel uses. Adopting it rather than re-styling the bars keeps a
              // single chart implementation with a mode, the same shape as
              // person-table.js mounted in two scopes. Its projector-sized default
              // would give one rating question about a phone screen and a half.
              '<div class="cdx-av-chart cdx-qr-host" data-av-kind="' + esc(q.kind) + '"' +
                ' data-av-chart="' + esc(String(q.id)) + '"></div>' +
            '</div>'
          : '') +
      '</div>';
  }).join('');

  const preview = ctx.preview
    ? '<div class="cdx-av-preview">' + items.map((q, i) =>
        questionCard(itemFromRow(q), i, {}, t, { total: items.length, readOnly: true })).join('') + '</div>'
    : '';
  const previewBtn = '<button type="button" class="cdx-btn cdx-btn-sm cdx-av-prev" data-av-preview>' +
    esc(t(ctx.preview ? 'cohorts.aval_preview_hide' : 'cohorts.aval_preview')) + '</button>';
  const lockChip = s.instrument_locked
    ? '<span class="cdx-av-lockchip">' + esc(t('cohorts.aval_locked')) + '</span>' : '';

  // ONE head, in all three stages. It always names the instrument and counts the
  // questions; the export controls simply join it once there is something to export.
  // The previous build swapped the whole head for a different one after the send,
  // which is what made the same list read as a different section.
  const sech =
    '<span class="cdx-doss-subhead cdx-av-subhead">' + esc(t('cohorts.aval_instrument')) + '</span>' +
    '<span class="cdx-av-count">' + esc(t('cohorts.aval_qcount').replace('{n}', String(items.length))) + '</span>' +
    lockChip + previewBtn +
    (sent && respondents(s.responses)
      ? '<button type="button" class="cdx-btn cdx-btn-sm" data-av-report>' + esc(t('cohorts.aval_report')) + '</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-av-export>' + esc(t('cohorts.aval_export')) + '</button>'
      : '');

  const empty = sent && !respondents(s.responses)
    ? '<div class="cdx-empty">' + esc(t('cohorts.aval_no_results')) + '</div>' : '';
  return '<div class="cdx-av-sec">' +
      '<div class="cdx-av-sech">' + sech + '</div>' +
      empty +
      '<div class="cdx-av-qlist">' + rows + '</div>' +
      preview +
      '<div class="cdx-av-todo">' + esc(t('cohorts.aval_editor_todo')) + '</div>' +
    '</div>';
}

// "9 respostas" / "1 resposta" / "sem respostas", so a row never reads "0 respostas".
export function answersLabel(n) {
  if (!n) return t('cohorts.aval_answers_none');
  if (n === 1) return t('cohorts.aval_answer_one');
  return t('cohorts.aval_answers').replace('{n}', String(n));
}

// A chart is drawn the first time its row is opened, into the panel that is already
// in the tree. Drawing on open (rather than up front) keeps a ten-question dossier
// from building ten charts nobody looked at; drawing INTO an element that always
// exists is the other half, because a panel the renderer is allowed to omit is
// exactly the shape that broke the send button twice on the student side.
//
// NOTHING here passes `name` or `onRemoveAnswer`: renderTextFeed would happily print
// a respondent's name and wire a delete-one-answer button, and neither belongs on an
// anonymous survey (§3.4 item 7). Its own fallback to t('questions.qr_anonymous') is
// the display we want.
function drawChart(ctx, id) {
  const box = ctx.el.querySelector('[data-av-chart="' + id + '"]');
  if (!box || box.getAttribute('data-drawn')) return;
  const q = liveQuestions(ctx.state.questions).find((x) => String(x.id) === String(id));
  if (!q) return;
  const st = statsFor(q, ctx.state.responses);
  renderResults(st.question, st.counts, box, { showResults: true });
  box.setAttribute('data-drawn', '1');
}

function wire(ctx) {
  ctx.el.querySelectorAll('[data-av-sc]').forEach((b) => b.addEventListener('click', () => {
    ctx.scenario = Number(b.getAttribute('data-av-sc'));
    ctx.preview = false;
    ctx.openIds.clear();
    reload(ctx);
  }));
  // Toggling patches the two elements that change and leaves the rest alone. A full
  // repaint here would throw him back to the top of a ten-question list, which is
  // the same complaint that produced js/list-sync.js and the student gate's
  // in-place patching.
  ctx.el.querySelectorAll('[data-av-row]').forEach((b) => b.addEventListener('click', () => {
    const id = b.getAttribute('data-av-row');
    const panel = ctx.el.querySelector('[data-av-panel="' + id + '"]');
    if (!panel) return;
    const open = panel.hidden;
    panel.hidden = !open;
    b.setAttribute('aria-expanded', open ? 'true' : 'false');
    const row = b.closest('.cdx-av-qrow');
    if (row) row.classList.toggle('is-open', open);
    if (open) { ctx.openIds.add(id); drawChart(ctx, id); } else { ctx.openIds.delete(id); }
  }));
  const prev = ctx.el.querySelector('[data-av-preview]');
  if (prev) prev.addEventListener('click', () => { ctx.preview = !ctx.preview; paint(ctx); });
  const go = ctx.el.querySelector('[data-av-send]');
  // A greyed button still receives the click (that is the price of keeping it
  // hoverable), so the no-op is explicit rather than implied by the attribute.
  if (go) go.addEventListener('click', () => {
    if (!canSend(ctx.state)) return;
    ctx.scenario = 3;
    reload(ctx);
  });
}
