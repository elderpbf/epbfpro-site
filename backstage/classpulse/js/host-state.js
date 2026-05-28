'use strict';

// CPHost.State -- shared mutable state across the host page modules.
// Declarative only: the IIFE attaches defaults; init() reads BS_AUTH.TOKEN
// and parses the ?code= URL param. Layout state and formEls are populated
// later by Layout.init / Composer.init when the DOM is ready.

(function () {
  var CPHost = window.CPHost = window.CPHost || {};

  var State = {
    // Session
    sessionCode: null,
    activeQId: null,
    pollTimer: null,
    _historyMap: {},
    _currentSession: null,

    // ClassTrail link
    _trailTurma: null,
    _trailAllTurmas: [],

    // Shared modules attached at init time
    visToggle: null,
    qaModule: null,

    // Student Q&A (sqa) state
    activeQType: null,
    activeStudentQuestionId: null,
    _sqaLastServerAnswer: null,
    _sqaDraft: null,
    _sqaDebounce: null,
    _sqaSaving: false,

    // Auth + URL
    AUTH_TOKEN: null,
    urlCode: null,

    // Composer / layout (populated by their respective init paths)
    formEls: null,
    layoutState: null,

    // Constants
    MAX_POLL_OPTS: 6,
    CHK_DEFAULTS: {
      'chk-show-results':  true,
      'chk-reveal-answer': false
    },
    TYPE_LABELS: {
      mc: 'MC', tf: 'V/F', poll: 'Enquete', open: 'Aberta',
      wordcloud: 'Nuvem', rating: 'Avaliação', numeric: 'Número'
    },
    LAYOUT_KEY: 'classpulse_b1_layout',
    DEFAULT_LAYOUT: {
      left:   { visible: true, width: 360 },
      center: { visible: true },
      right:  { visible: true, width: 380 }
    },

    init: function () {
      this.AUTH_TOKEN = (typeof BS_AUTH !== 'undefined' && BS_AUTH) ? BS_AUTH.TOKEN : null;
      this.urlCode = new URLSearchParams(location.search).get('code');
    },
  };

  CPHost.State = State;
})();
