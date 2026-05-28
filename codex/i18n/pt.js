'use strict';
// PT-BR dictionary — the source of truth for all Codex UI strings.
//
// Convention: keys are English (so code and conversation stay in English),
// values are the displayed Portuguese. A second language is added by dropping
// a sibling file (e.g. en.js) that registers CODEX_I18N['en'] with the same
// keys; the selector stays hidden until that second dictionary exists.
window.CODEX_I18N = window.CODEX_I18N || {};
window.CODEX_I18N['pt-BR'] = {
  'app.title':          'Codex',

  // Top-level tabs (internal keys plural; PT labels keep their established form)
  'nav.lessons':        'Aula',
  'nav.content':        'Conteúdo',
  'nav.cohorts':        'Turmas',
  'nav.questions':      'Perguntas',

  // Landing card descriptions
  'card.lessons.desc':   'Apresente conteúdo durante a aula',
  'card.content.desc':   'Itens, slides, apostila e tarefas',
  'card.cohorts.desc':   'Alunos, turmas e liberações',
  'card.questions.desc': 'Perguntas ao vivo, banco e estatísticas'
};
