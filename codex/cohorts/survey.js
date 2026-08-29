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
  const s = ctx.state;
  ctx.el.innerHTML =
    '<div class="cdx-av">' +
      switcherHtml(ctx) +
      headHtml(s) +
      sendBlockHtml(s) +
      instrumentHtml(ctx, s) +
      resultsHtml(s) +
    '</div>';
  wire(ctx);
  drawCharts(ctx);
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

function headHtml(s) {
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
  return '<div class="cdx-av-head">' +
      '<span class="cdx-av-pill cdx-av-pill--' + esc(s.status) + '">' + esc(t(statusKey)) + '</span>' +
      (line.length ? '<span class="cdx-av-headline">' + esc(line.join(' · ')) + '</span>' : '') +
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
  const invited = s.invited_count != null ? s.invited_count : s.invitees;
  return '<div class="cdx-av-send">' +
      '<div class="cdx-av-send-row">' +
        '<label class="cdx-av-prazo">' + esc(t('cohorts.aval_deadline')) +
          '<input type="number" min="1" max="90" class="cdx-av-days" value="' + esc(String(s.deadline_days || 7)) + '"' +
            (s.sent_at ? ' disabled' : '') + '>' +
          '<span>' + esc(t('cohorts.aval_deadline_days')) + '</span>' +
        '</label>' +
        '<button type="button" class="cdx-btn cdx-btn-primary cdx-av-go' + (ok ? '' : ' is-locked') + '"' +
          (ok ? '' : ' aria-disabled="true" title="' + esc(reasons.join(' ')) + '"') + ' data-av-send>' +
          esc(t('cohorts.aval_send')) +
        '</button>' +
        '<span class="cdx-av-invitees">' + esc(t('cohorts.aval_invitees').replace('{n}', String(invited))) + '</span>' +
      '</div>' +
      (ok ? '' :
        '<div class="cdx-av-blocks">' +
          '<div class="cdx-av-blocks-head">' + esc(t('cohorts.aval_blocked_head')) + '</div>' +
          reasons.map((r) => '<div class="cdx-av-block">' + esc(r) + '</div>').join('') +
        '</div>') +
    '</div>';
}

function instrumentHtml(ctx, s) {
  const items = liveQuestions(s.questions);
  const rows = items.map((q, i) =>
    '<div class="cdx-av-qrow">' +
      '<span class="cdx-av-qn">' + (i + 1) + '</span>' +
      '<span class="cdx-av-qkind">' + esc(t(KIND_KEY[q.kind] || KIND_KEY.open)) + '</span>' +
      '<span class="cdx-av-qtext">' + esc(q.prompt) + '</span>' +
      (q.required ? '' : '<span class="cdx-av-qopt">' + esc(t('cohorts.aval_optional')) + '</span>') +
    '</div>').join('');
  const preview = ctx.preview
    ? '<div class="cdx-av-preview">' + items.map((q, i) =>
        questionCard(itemFromRow(q), i, {}, t, { total: items.length, readOnly: true })).join('') + '</div>'
    : '';
  return '<div class="cdx-av-sec">' +
      '<div class="cdx-av-sech">' +
        '<span class="cdx-doss-subhead cdx-av-subhead">' + esc(t('cohorts.aval_instrument')) + '</span>' +
        '<span class="cdx-av-count">' + esc(t('cohorts.aval_qcount').replace('{n}', String(items.length))) + '</span>' +
        (s.instrument_locked ? '<span class="cdx-av-lockchip">' + esc(t('cohorts.aval_locked')) + '</span>' : '') +
        '<button type="button" class="cdx-btn cdx-btn-sm cdx-av-prev" data-av-preview>' +
          esc(t(ctx.preview ? 'cohorts.aval_preview_hide' : 'cohorts.aval_preview')) + '</button>' +
      '</div>' +
      '<div class="cdx-av-qlist">' + rows + '</div>' +
      preview +
      '<div class="cdx-av-todo">' + esc(t('cohorts.aval_editor_todo')) + '</div>' +
    '</div>';
}

function resultsHtml(s) {
  if (!s.sent_at) return '';
  const items = liveQuestions(s.questions);
  const answered = respondents(s.responses);
  const total = s.invited_count != null ? s.invited_count : s.invitees;
  const pct = total ? Math.round(answered / total * 100) : 0;
  const body = answered
    ? items.map((q) => {
        const st = statsFor(q, s.responses);
        return '<div class="cdx-av-res">' +
          '<div class="cdx-av-res-q">' + esc(q.prompt) + '</div>' +
          '<div class="cdx-av-res-meta">' +
            esc(t('cohorts.aval_q_answered').replace('{n}', String(st.answered)).replace('{total}', String(total))) +
            (st.avg == null ? '' : ' · ' + esc(st.avg.toFixed(1))) +
          '</div>' +
          '<div class="cdx-av-chart" data-av-chart="' + esc(String(q.id)) + '"></div>' +
        '</div>';
      }).join('')
    : '<div class="cdx-empty">' + esc(t('cohorts.aval_no_results')) + '</div>';
  return '<div class="cdx-av-sec">' +
      '<div class="cdx-av-sech">' +
        '<span class="cdx-doss-subhead cdx-av-subhead">' +
          esc(t(isClosed(s) ? 'cohorts.aval_final' : 'cohorts.aval_results')) + '</span>' +
        '<span class="cdx-av-rate">' +
          esc(t('cohorts.aval_rate').replace('{n}', String(answered)).replace('{total}', String(total))) +
          ' (' + pct + '%)</span>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-av-report>' + esc(t('cohorts.aval_report')) + '</button>' +
        '<button type="button" class="cdx-btn cdx-btn-sm" data-av-export>' + esc(t('cohorts.aval_export')) + '</button>' +
      '</div>' + body +
    '</div>';
}

// The charts are drawn after the frame exists, because renderResults writes into a
// live element rather than returning HTML. NOTHING here passes `name` or
// `onRemoveAnswer`: renderTextFeed would happily print a respondent's name and wire
// a delete-one-answer button, and neither belongs on an anonymous survey (§3.4
// item 7). Its own fallback to t('questions.qr_anonymous') is the display we want.
function drawCharts(ctx) {
  const s = ctx.state;
  if (!s.sent_at) return;
  liveQuestions(s.questions).forEach((q) => {
    const box = ctx.el.querySelector('[data-av-chart="' + q.id + '"]');
    if (!box) return;
    const st = statsFor(q, s.responses);
    renderResults(st.question, st.counts, box, { showResults: true });
  });
}

function wire(ctx) {
  ctx.el.querySelectorAll('[data-av-sc]').forEach((b) => b.addEventListener('click', () => {
    ctx.scenario = Number(b.getAttribute('data-av-sc'));
    ctx.preview = false;
    reload(ctx);
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
