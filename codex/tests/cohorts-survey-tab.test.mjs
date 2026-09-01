// codex/tests/cohorts-survey-tab.test.mjs
// The dossier's Avaliação tab (cohorts/survey.js) and the adapter under it.
//
// Three things are pinned here because each one fails SILENTLY, which is the shape
// every regression in this feature has taken so far:
//   - the greyed send button must stay hoverable, or the diagnosis Élder asked for
//     never renders (a [disabled] button receives no mouse events);
//   - the two vocabularies must map, or a 1-5 scale previews as a textarea;
//   - a survey answer must never carry a name, or the anonymous display quietly
//     stops being anonymous.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sendBlockHtml, blockText, instrumentHtml, answersLabel } from '../cohorts/survey.js';
import { statsFor, respondents, average, answersFor } from '../cohorts/survey-stats.js';
import { kindFromStored, kindToStored, itemFromRow, questionInput } from '../js/survey-question.js';
import { loadSurvey, scenarioFrom } from '../cohorts/survey-stub.js';

const NOW = 1_780_000_000;
const src = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── The greyed send button ─────────────────────────────────────────────────────

test('a blocked send stays HOVERABLE: aria-disabled, never the disabled attribute', () => {
  const html = sendBlockHtml(loadSurvey(1, NOW));
  assert.match(html, /data-av-send/);
  assert.match(html, /aria-disabled="true"/);
  assert.match(html, /is-locked/);
  const btn = html.slice(html.indexOf('<button type="button" class="cdx-btn cdx-btn-primary cdx-av-go'));
  assert.ok(!/\sdisabled[\s>]/.test(btn.slice(0, btn.indexOf('</button>'))),
    'a [disabled] button gets no mouse events, so its title tooltip never fires');
});

test('the block is named in the tooltip AND in visible text', () => {
  const html = sendBlockHtml(loadSurvey(1, NOW));
  assert.match(html, /title="[^"]*aula/i, 'the hover diagnosis Élder asked for');
  assert.match(html, /cdx-av-blocks-head/, 'and a visible list, because a phone has no hover');
  assert.match(html, /cdx-av-block">[^<]*3[^<]*4/, 'naming WHICH aulas are unmarked');
});

test('an unblocked send carries neither the lock class nor a tooltip', () => {
  const html = sendBlockHtml(loadSurvey(2, NOW));
  assert.ok(!html.includes('is-locked'));
  assert.ok(!html.includes('aria-disabled'));
  assert.ok(!html.includes('cdx-av-blocks-head'), 'nothing stands where the reasons were');
});

test('an already-sent survey says so, with the date, instead of offering the button again', () => {
  const html = sendBlockHtml(loadSurvey(3, NOW));
  assert.match(html, /is-locked/);
  assert.match(html, /\d\d\/\d\d\/\d{4}/, 'the send date, not a bare "already sent"');
});

test('after the send the block stops SHOUTING: greyed and explained, but not alarming', () => {
  const html = sendBlockHtml(loadSurvey(3, NOW));
  assert.match(html, /is-done/, 'it becomes a footnote');
  assert.ok(!html.includes('cdx-av-blocks-head'),
    'an amber "cannot send yet" box over a finished action is noise sitting on top of the numbers');
  assert.match(html, /title="[^"]*\d\d\/\d\d\/\d{4}/, 'the tooltip still carries the reason');
  assert.ok(!html.includes('cdx-av-prazo'), 'and the deadline field is gone, not merely disabled');
});

test('the invitee line changes tense once they have actually been invited', () => {
  assert.match(sendBlockHtml(loadSurvey(2, NOW)), /serão convidados/);
  assert.match(sendBlockHtml(loadSurvey(3, NOW)), /14 alunos convidados/);
});

test('blockText: one aula reads singular, several read plural and joined', () => {
  assert.match(blockText({ code: 'aulas_pending', aulas: [3] }, {}), /aula 3\b/i);
  assert.match(blockText({ code: 'aulas_pending', aulas: [1, 3, 4] }, {}), /1, 3 e 4/);
  assert.match(blockText({ code: 'aulas_pending', aulas: [] }, {}), /\S/,
    'an unknown list still produces a sentence, never an empty line');
  assert.equal(blockText({ code: 'no_instrument' }, {}).includes('cohorts.'), false,
    'every code resolves to a real key, not to the key itself');
  assert.equal(blockText({ code: 'no_invitees' }, {}).includes('cohorts.'), false);
  assert.equal(blockText({ code: 'closed' }, {}).includes('cohorts.'), false);
});

// ── The two vocabularies ───────────────────────────────────────────────────────

test('every stored kind maps, both ways', () => {
  assert.equal(kindFromStored('rating'), 'scale');
  assert.equal(kindFromStored('poll'), 'choice');
  assert.equal(kindFromStored('wordcloud'), 'words');
  assert.equal(kindFromStored('open'), 'text');
  ['scale', 'choice', 'words', 'text'].forEach((k) => assert.equal(kindFromStored(kindToStored(k)), k));
});

test('an unknown kind THROWS instead of degrading to a textarea', () => {
  assert.throws(() => kindFromStored('nps'), /unknown stored kind/);
  assert.throws(() => kindFromStored(undefined), /unknown stored kind/);
  assert.throws(() => kindToStored('scale5'), /unknown kind/);
});

test('itemFromRow flips required into optional, and carries the per-question config', () => {
  assert.equal(itemFromRow({ kind: 'rating', required: 1, prompt: 'x' }).optional, false);
  assert.equal(itemFromRow({ kind: 'open', required: 0, prompt: 'x' }).optional, true);
  assert.deepEqual(itemFromRow({ kind: 'poll', required: 1, options: ['a', 'b'] }).options, ['a', 'b']);
  assert.deepEqual(itemFromRow({ kind: 'poll', required: 1, options_json: '["a","b"]' }).options, ['a', 'b']);
  const bounded = itemFromRow({ kind: 'rating', required: 1, options: { min: 1, max: 10 } });
  assert.equal(bounded.min, 1);
  assert.equal(bounded.max, 10);
});

test('a mapped row renders the right control, which is what a bad map would hide', () => {
  const rows = loadSurvey(1, NOW).questions;
  assert.match(questionInput(itemFromRow(rows[0]), 0, {}, (k) => k), /cdx-sv-scale/);
  assert.match(questionInput(itemFromRow(rows[2]), 2, {}, (k) => k), /cdx-sv-choices/);
  assert.match(questionInput(itemFromRow(rows[8]), 8, {}, (k) => k), /cdx-sv-words/);
  assert.match(questionInput(itemFromRow(rows[9]), 9, {}, (k) => k), /cdx-sv-text/);
});

// ── The stats adapter ──────────────────────────────────────────────────────────

const ROWS = [
  { question_id: 1, participant_id: 7, answer_num: 5, answer_text: null },
  { question_id: 1, participant_id: 8, answer_num: 3, answer_text: null },
  { question_id: 3, participant_id: 7, answer_num: null, answer_text: 'Foi adequado' },
  { question_id: 3, participant_id: 8, answer_num: null, answer_text: 'Outro' },
  { question_id: 10, participant_id: 7, answer_num: null, answer_text: 'muito bom' },
  { question_id: 10, participant_id: 8, answer_num: null, answer_text: '   ' },
];

test('poll: options stay an ARRAY with a parallel counts array', () => {
  const q = { id: 3, kind: 'poll', prompt: 'p', options: ['Foi adequado', 'Outro'] };
  const st = statsFor(q, ROWS);
  assert.ok(Array.isArray(st.question.options));
  assert.deepEqual(st.counts, [1, 1]);
  assert.equal(st.question.voter_count, 2, 'the denominator the bar chart prefers over the summed counts');
  assert.equal(st.avg, null);
});

test('rating: options become {min,max} and the values ride on text_answers', () => {
  const st = statsFor({ id: 1, kind: 'rating', prompt: 'p' }, ROWS);
  assert.deepEqual(st.question.options, { min: 1, max: 5 }, 'handing an ARRAY here draws zero bars, silently');
  assert.deepEqual(st.question.text_answers, [{ value: 5 }, { value: 3 }]);
  assert.equal(st.answered, 2);
  assert.equal(st.avg, 4);
});

test('rating honours per-question bounds, so the scale never comes from localStorage', () => {
  const st = statsFor({ id: 1, kind: 'rating', prompt: 'p', options: { min: 1, max: 10 } }, ROWS);
  assert.deepEqual(st.question.options, { min: 1, max: 10 });
});

test('ANONYMOUS: a text answer never carries a name', () => {
  const st = statsFor({ id: 10, kind: 'open', prompt: 'p' }, ROWS);
  assert.deepEqual(st.question.text_answers, [{ value: 'muito bom' }], 'blank answers dropped');
  st.question.text_answers.forEach((a) => {
    assert.ok(!('name' in a), 'renderTextFeed prints ans.name when it is there; its fallback IS the anonymous display');
    assert.ok(!('id' in a), 'and an id is what the delete-one-answer button would key on');
  });
});

test('ANONYMOUS: the tab never wires onRemoveAnswer into the shared feed', () => {
  // Comments stripped first: this file explains the rule in prose, and a naive
  // substring check would be satisfied by its own documentation.
  const code = src('../cohorts/survey.js').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!code.includes('onRemoveAnswer'),
    'the shared seam happily renders a delete-one-answer affordance; it does not belong on an anonymous survey');
  assert.ok(!/\bname\s*:/.test(code.slice(code.indexOf('function drawCharts'))),
    'and nothing downstream may reintroduce a name');
});

test('wordcloud keeps whole phrases: the renderer splits them, this does not', () => {
  const st = statsFor({ id: 9, kind: 'wordcloud', prompt: 'p' },
    [{ question_id: 9, participant_id: 1, answer_text: 'clareza prática método' }]);
  assert.equal(st.question.type, 'wordcloud');
  assert.deepEqual(st.question.text_answers, [{ value: 'clareza prática método' }]);
});

test('respondents counts PEOPLE, not rows', () => {
  assert.equal(respondents(ROWS), 2);
  assert.equal(respondents([]), 0);
  assert.equal(respondents(null), 0);
});

test('average ignores anything non-numeric instead of poisoning the mean', () => {
  assert.equal(average([{ answer_num: 4 }, { answer_num: null }, { answer_num: 'x' }]), 4);
  assert.equal(average([]), null);
  assert.equal(answersFor(ROWS, 1).length, 2);
});

// ── The stub, which is the review surface until the Worker lands ───────────────

test('the four scenarios reach the four states the tab has to draw', () => {
  assert.equal(loadSurvey(1, NOW).status, 'draft');
  assert.equal(loadSurvey(2, NOW).status, 'draft');
  assert.equal(loadSurvey(3, NOW).status, 'open');
  assert.equal(loadSurvey(4, NOW).status, 'closed');
  assert.equal(loadSurvey(1, NOW).aulas.filter((a) => !a.happened_on).length, 2, 'scenario 1 is the LOUD lock');
  assert.equal(loadSurvey(2, NOW).aulas.filter((a) => !a.happened_on).length, 0);
});

test('the frozen denominator is a SEPARATE field from the live head count', () => {
  const open = loadSurvey(3, NOW);
  assert.equal(open.invited_count, 14, 'frozen at send, so the response rate stops drifting');
  assert.ok('invitees' in open, 'and the live count survives alongside it');
  assert.equal(loadSurvey(1, NOW).invited_count, null, 'nothing is frozen before the send');
});

test('the fixture is deterministic: two loads of one scenario agree', () => {
  assert.deepEqual(loadSurvey(4, NOW).responses, loadSurvey(4, NOW).responses);
  assert.ok(loadSurvey(4, NOW).responses.length > loadSurvey(3, NOW).responses.length);
});

test('scenarioFrom defaults to the blocked draft and refuses anything out of range', () => {
  assert.equal(scenarioFrom('?avaliacao=3'), 3);
  assert.equal(scenarioFrom('?tab=cohorts&avaliacao=4'), 4);
  assert.equal(scenarioFrom(''), 1);
  assert.equal(scenarioFrom('?avaliacao=9'), 1);
  assert.equal(scenarioFrom(null), 1);
});

test('the instrument is DATA, never i18n keys', () => {
  const stub = src('../cohorts/survey-stub.js');
  assert.ok(stub.includes('Sua satisfação geral com o curso.'),
    'the ten questions are rows in ct_survey_questions (§3.9), so they are hardcoded here, not translated');
  assert.equal(loadSurvey(1, NOW).questions.length, 10);
});

// ── The wiring the suite cannot see any other way ──────────────────────────────

test('the dossier actually mounts the tab, and knows its key', () => {
  const co = src('../cohorts/cohorts.js');
  assert.ok(co.includes("mountSurveyAdmin"), 'imported AND called');
  assert.ok(co.includes("data-dtab=\"avaliacao\""), 'the sub-tab button exists');
  assert.ok(co.includes("data-dpanel=\"avaliacao\""), 'and so does its panel');
  assert.ok(/_KNOWN_DTABS = \[[^\]]*'avaliacao'/.test(co),
    "an unknown dtab silently falls back to 'dados', so the panel would never show");
});

test('the tab is styled: both stylesheets reach the admin page', () => {
  const html = src('../index.html');
  assert.ok(html.includes('cohorts/survey-admin.css'));
  assert.ok(html.includes('css/survey-question.css'),
    'the preview cards come from the seam the Trilha loads, not from a second copy');
});

// -- One list, not two -------------------------------------------------------

const CTX = () => ({ preview: false, openIds: new Set() });

test('ONE list: a prompt is printed exactly once, never as instrument AND as result', () => {
  const s = loadSurvey(3, NOW);
  const html = instrumentHtml(CTX(), s);
  s.questions.forEach((q) => {
    const hits = html.split(q.prompt.slice(0, 40)).length - 1;
    assert.equal(hits, 1, 'repeated prompt: ' + q.prompt.slice(0, 40));
  });
});

test('before the send a row is inert: no button, no panel, no summary', () => {
  const html = instrumentHtml(CTX(), loadSurvey(1, NOW));
  assert.match(html, /cdx-av-qhead is-static/);
  assert.ok(!html.includes('data-av-row'), 'nothing to open, so nothing pretends to be openable');
  assert.ok(!html.includes('cdx-av-qpanel'));
  assert.ok(!html.includes('cdx-av-qsum'));
  assert.match(html, /cohorts\.aval_instrument|Instrumento/, 'and the head still names the instrument');
});

test('after the send every row opens onto its own chart, and starts closed', () => {
  const html = instrumentHtml(CTX(), loadSurvey(3, NOW));
  assert.equal((html.match(/data-av-row=/g) || []).length, 10, 'one toggle per question');
  assert.equal((html.match(/aria-expanded="false"/g) || []).length, 10);
  assert.equal((html.match(/data-av-panel=/g) || []).length, 10);
  assert.equal((html.match(/cdx-av-qpanel"[^>]*hidden/g) || []).length, 10, 'closed means hidden, not absent');
  assert.equal((html.match(/data-av-chart=/g) || []).length, 10);
  assert.match(html, /9 de 14 responderam \(64%\)/, 'the rate moves into the list head');
});

test('an open row is rendered open, so a repaint does not collapse what he expanded', () => {
  const ctx = CTX();
  ctx.openIds.add('4');
  const html = instrumentHtml(ctx, loadSurvey(3, NOW));
  assert.equal((html.match(/aria-expanded="true"/g) || []).length, 1);
  assert.equal((html.match(/cdx-av-qrow is-open/g) || []).length, 1);
  assert.equal((html.match(/cdx-av-qpanel"[^>]*hidden/g) || []).length, 9);
});

test('the collapsed row carries the count, and an average only where one means something', () => {
  const html = instrumentHtml(CTX(), loadSurvey(3, NOW));
  assert.match(html, /cdx-av-qsum">9 respostas · 4\.4/, 'a scale shows its average beside the count');
  assert.ok(/cdx-av-qsum">4 respostas<\/span>/.test(html) || /cdx-av-qsum">[0-9]+ respostas<\/span>/.test(html),
    'a free-text item shows the count alone');
});

test('answersLabel never says "0 respostas" and never says "1 respostas"', () => {
  assert.equal(answersLabel(0), 'sem respostas');
  assert.equal(answersLabel(1), '1 resposta');
  assert.equal(answersLabel(9), '9 respostas');
});
