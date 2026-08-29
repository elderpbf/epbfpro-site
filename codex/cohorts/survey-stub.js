// codex/cohorts/survey-stub.js
// PROTOTYPE DATA. The dossier's Avaliação tab has no backend yet: migration 0054 and
// the ct_survey_* actions are unbuilt (track-64 §3.3), so this stands in for the one
// call the tab will make, shaped exactly like its response.
//
// THE SWAP POINT IS ONE LINE. When the Worker lands, survey.js replaces
//   import { loadSurvey } from './survey-stub.js';
// with a facade call, `cohorts.surveyGet({ client_slug, turma_slug })`, and nothing
// else in the tab moves — every field below is the field that action will return.
// Deliberately NOT wired through js/codex-api.js in the meantime: a facade entry
// pointing at an action the Worker does not answer fails in staging with an
// unknown-action error, which reads as a bug in the tab instead of an absent
// backend.
//
// Four scenarios, picked with ?avaliacao=1..4, so every state of the tab is
// reachable without a database. Same review device as the student prototype's
// ?survey=N, and for the same reason: the states that matter here are the LOCKED
// ones, and a real turma will not be in them on demand.
//
// The instrument is hardcoded Portuguese on purpose. These ten are rows in
// ct_survey_questions, never i18n keys (§3.9): routing them through pt.js/en.js
// would demand an invented English translation of an instrument that only ever
// exists in Portuguese.

export const SCENARIOS = [
  { n: 1, key: 'draft_blocked' },   // rascunho, duas aulas por marcar — the loud lock
  { n: 2, key: 'draft_ready' },     // rascunho, tudo pronto — send is live
  { n: 3, key: 'open_partial' },    // enviada, janela aberta, respostas chegando
  { n: 4, key: 'closed_final' },    // encerrada, estatística congelada
];

const DAY = 86400;

const QUESTIONS = [
  { id: 1, position: 1, kind: 'rating', required: 1, prompt: 'O conteúdo foi compatível com os objetivos anunciados e seguiu o programa.' },
  { id: 2, position: 2, kind: 'rating', required: 1, prompt: 'A carga horária foi adequada ao conteúdo previsto.' },
  { id: 3, position: 3, kind: 'poll', required: 1, prompt: 'O grau de complexidade do conteúdo em relação ao seu nível.',
    options: ['Foi adequado', 'Estava além do meu nível', 'Estava aquém do meu nível', 'Outro'] },
  { id: 4, position: 4, kind: 'rating', required: 1, prompt: 'O instrutor demonstrou domínio do conteúdo e trouxe referências atualizadas.' },
  { id: 5, position: 5, kind: 'rating', required: 1, prompt: 'Os exemplos usados e a didática facilitaram a compreensão.' },
  { id: 6, position: 6, kind: 'rating', required: 1, prompt: 'Você se sente em condições de aplicar o que aprendeu.' },
  { id: 7, position: 7, kind: 'rating', required: 1, prompt: 'A organização do curso de forma geral (divulgação, atendimento, estrutura).' },
  { id: 8, position: 8, kind: 'rating', required: 1, prompt: 'Sua satisfação geral com o curso.' },
  { id: 9, position: 9, kind: 'wordcloud', required: 0, prompt: 'Em até três palavras, o que você leva deste curso?' },
  { id: 10, position: 10, kind: 'open', required: 0, prompt: 'Críticas, elogios e sugestões.' },
];

// Fixed, never random: a fixture that reshuffles makes two screenshots of the same
// state disagree, and the whole point of the switcher is comparing them.
// One row per person, one column per RATING question in instrument order (q1, q2,
// q4..q8 — seven of them). A 0 means that person skipped it, which is what gives the
// per-question denominators something to differ about.
const SCALES = [
  [5, 4, 5, 5, 4, 5, 5],
  [4, 3, 5, 4, 4, 4, 4],
  [5, 5, 5, 5, 5, 5, 5],
  [4, 4, 4, 5, 3, 4, 4],
  [5, 3, 5, 5, 4, 3, 4],
  [3, 2, 4, 4, 3, 3, 3],
  [5, 4, 5, 5, 5, 4, 5],
  [4, 5, 4, 4, 4, 0, 4],
  [5, 4, 5, 5, 4, 4, 5],
  [5, 5, 5, 4, 5, 5, 5],
  [4, 4, 5, 5, 4, 4, 4],
  [5, 4, 4, 5, 5, 5, 5],
];
const CHOICES = ['Foi adequado', 'Foi adequado', 'Estava além do meu nível', 'Foi adequado',
  'Foi adequado', 'Estava aquém do meu nível', 'Foi adequado', 'Foi adequado',
  'Foi adequado', 'Foi adequado', 'Estava além do meu nível', 'Foi adequado'];
const WORDS = ['clareza prática confiança', 'organização didática', 'aplicabilidade método clareza',
  'prática confiança', 'clareza objetividade', '', 'método prática', 'clareza didática',
  'confiança aplicabilidade', 'prática clareza método', '', 'didática clareza'];
const TEXTS = [
  'O curso superou o que eu esperava. Os exemplos com peças reais fizeram toda a diferença.',
  '', 'Gostaria de mais tempo na parte de automação, foi a que mais me interessou.',
  '', 'A carga horária ficou apertada para o volume de conteúdo. Vale considerar um encontro a mais.',
  '', '', 'Excelente. Já apliquei no dia seguinte em dois processos.',
  '', 'Sugiro disponibilizar os prompts em um arquivo separado para consulta.', '', '',
];

function responsesFor(count) {
  const rows = [];
  for (let p = 0; p < count; p++) {
    const scale = SCALES[p % SCALES.length];
    let ratingCol = 0;
    QUESTIONS.forEach((q) => {
      if (q.kind === 'rating') {
        const v = scale[ratingCol++];
        if (v) rows.push({ question_id: q.id, participant_id: 100 + p, answer_num: v, answer_text: null });
      } else if (q.kind === 'poll') {
        rows.push({ question_id: q.id, participant_id: 100 + p, answer_num: null, answer_text: CHOICES[p % CHOICES.length] });
      } else {
        const txt = (q.kind === 'wordcloud' ? WORDS : TEXTS)[p % 12];
        if (txt) rows.push({ question_id: q.id, participant_id: 100 + p, answer_num: null, answer_text: txt });
      }
    });
  }
  return rows;
}

// The aulas the lock reads. Scenario 1 leaves two unmarked, which is the state Élder
// asked to be able to see: the greyed button naming exactly which ones.
function aulas(markedThrough) {
  const out = [];
  for (let i = 1; i <= 4; i++) {
    out.push({ aula_number: i, title: 'Aula ' + i, happened_on: i <= markedThrough ? '2026-08-1' + i : null });
  }
  return out;
}

export function scenarioFrom(search) {
  const m = /(?:^|[?&])avaliacao=(\d)(?:&|$)/.exec(String(search || ''));
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= 4 ? n : 1;
}

// One survey, as ct_survey_get will return it. `invitees` is the LIVE participant
// count and `invited_count` is the one frozen at send (§3.3): the response rate's
// denominator must not move when somebody is added mid-window, and a single field
// would silently reproduce exactly that drift.
export function loadSurvey(n, now) {
  const t = now || Math.floor(Date.now() / 1000);
  const base = {
    turma_id: 1,
    status: 'draft',
    opened_at: null,
    sent_at: null,
    closes_at: null,
    deadline_days: 7,
    questions: QUESTIONS,
    invitees: 14,
    invited_count: null,
    aulas: aulas(4),
    responses: [],
    now: t,
    instrument_locked: false,
  };
  if (n === 1) return Object.assign(base, { aulas: aulas(2) });
  if (n === 2) return base;
  if (n === 3) {
    return Object.assign(base, {
      status: 'open',
      opened_at: t - 3 * DAY,
      sent_at: t - 3 * DAY,
      closes_at: t + 4 * DAY,
      invited_count: 14,
      instrument_locked: true,
      responses: responsesFor(9),
    });
  }
  return Object.assign(base, {
    status: 'closed',
    opened_at: t - 12 * DAY,
    sent_at: t - 12 * DAY,
    closes_at: t - 5 * DAY,
    invited_count: 14,
    instrument_locked: true,
    responses: responsesFor(12),
  });
}
