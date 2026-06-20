'use strict';

// CPHost.State -- shared mutable state across the host page modules.
// Declarative only: the IIFE attaches defaults; init() reads BS_AUTH.TOKEN
// and parses the ?code= URL param. Layout state and formEls are populated
// later by Layout.init / Composer.init when the DOM is ready.

(function () {
  var CPHost = window.CPHost = window.CPHost || {};

  var State = {
    // Mount root. null = legacy global mount (document); set to an element by
    // CPHost.mount() for sidebar-style scoped mounting. All DOM lookups go
    // through CPHost.$/qs/qsa which scope to this when set.
    root: null,
    // Tracks document-level event listeners attached during init/mount so
    // unmount() can detach them. Each entry: { target, type, fn }.
    _docListeners: [],

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
      // Idempotent: if mount() or a previous init() already seeded these
      // (sidebar-mount case), preserve them. Standalone host.html arrives
      // here with both null and falls back to the URL + BS_AUTH global.
      if (!this.AUTH_TOKEN) {
        this.AUTH_TOKEN = (typeof BS_AUTH !== 'undefined' && BS_AUTH) ? BS_AUTH.TOKEN : null;
      }
      if (!this.urlCode) {
        this.urlCode = new URLSearchParams(location.search).get('code');
      }
    },
  };

  CPHost.State = State;

  // DOM helpers scoped to State.root when set, falling back to document
  // otherwise. All CPHost modules use these instead of document.getElementById /
  // document.querySelector so the same modules can mount in either a standalone
  // page (root === document) or a sidebar right-pane (root === <div>).
  CPHost.$ = function (id) {
    var root = State.root;
    if (root && typeof root.querySelector === 'function') {
      return root.querySelector('#' + id);
    }
    return document.getElementById(id);
  };

  CPHost.qs = function (selector) {
    var root = State.root;
    return (root || document).querySelector(selector);
  };

  CPHost.qsa = function (selector) {
    var root = State.root;
    return (root || document).querySelectorAll(selector);
  };

  // Register a document-level listener (drag, outside-click, etc.) so unmount
  // can detach it. Use this whenever you would call document.addEventListener
  // or window.addEventListener from inside a CPHost module's init path.
  CPHost.addDocListener = function (target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    State._docListeners.push({ target: target, type: type, fn: fn });
  };
})();
