'use strict';
// Codex API facade.
//
// The Codex frontend NEVER types raw Worker action strings. It calls the
// functional methods below; each maps to a legacy action string (the Worker
// contract is FROZEN) through the shared callWorker(). As each tab migrates,
// its methods are added here using the real action names read from the Worker
// at that time — never invent an action string.
//
// Worker-action legend (historical codenames, do NOT rename — frozen wire
// contract):
//   ct_*  -> Content + Cohorts          (was "ClassTrail")
//   cv_*  -> Lesson surface + Drive       (was "ClassVault")
//   cp_*  -> Questions / live sessions    (was "ClassPulse")
//   *_presentation, presentations table, R2 classforge/{slug}/ -> Slides (decks)
//
// Methods take an optional params object passed straight through, so no
// guessed field names live here; param shapes are pinned when each method is
// actually wired during its tab's migration.
//
// Assumed globals: callWorker (../backstage/js/api-client.js).
window.CodexAPI = (function() {

  // Generic passthrough. Every namespaced method routes through here, so each
  // raw action string appears in exactly one place.
  function call(action, params) {
    var p = {};
    if (params) {
      for (var k in params) { if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k]; }
    }
    p.action = action;
    return callWorker(p);
  }

  return {
    call: call,

    // Slides — authored decks (the Slides sub-tab + deck editor). Deck JSON
    // lives in R2 via the presentation_json actions; metadata in the
    // presentations table. Google Slides embeds are NOT handled here; they
    // render in Lessons via their existing item types.
    slides: {
      list:        function(p) { return call('list_presentations', p); },
      getDeck:     function(p) { return call('get_presentation_json', p); },  // p: { slug }
      saveDeck:    function(p) { return call('put_presentation_json', p); },  // p: { slug, data }
      register:    function(p) { return call('register_presentation', p); },
      remove:      function(p) { return call('delete_presentation', p); },    // p: { slug }
      uploadImage: function(p) { return call('upload_image', p); }
    },

    // Questions — live sessions, banks, stats.
    questions: {
      listSessions: function(p) { return call('list_sessions', p); },
      listSets:     function(p) { return call('list_question_sets', p); },
      getQuestions: function(p) { return call('get_questions', p); },
      sessionState: function(p) { return call('get_session_state', p); },
      activeForCohort: function(p) { return call('cp_get_active_for_turma', p); }
    },

    // Session <-> deck linking (shared by Lessons + Questions surfaces).
    links: {
      link:    function(p) { return call('link_presentation', p); },   // p: { code, slug }
      unlink:  function(p) { return call('unlink_presentation', p); }, // p: { code }
      forSlug: function(p) { return call('get_linked_session', p); }   // p: { slug }
    },

    // AI helpers (provider fallback chain lives in the Worker).
    ai: {
      question: function(p) { return call('ai_question', p); },
      theme:    function(p) { return call('ai_theme', p); }
    }

    // cohorts: {}  // populated during the Cohorts migration (real ct_* names)
    // content: {}  // populated during the Content migration (real ct_*/cv_* names)
    // lessons: {}  // populated during the Lessons migration (real cv_* names)
  };
})();
