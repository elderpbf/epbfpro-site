// ai-client.js — shared AI generation module
// Delegates to Worker ai_question action. Keys are managed as Worker secrets.
// Rate-limited errors (429/503) are suppressed here and resolve as null.
// Callers must guard against null return.
var AIClient = (function() {
  function generate(params) {
    return callWorker(Object.assign(
      { action: 'ai_question', auth_token: AUTH_TOKEN },
      params
    )).catch(function(e) {
      if (e.data && e.data.rate_limited) return null;
      throw e;
    });
  }

  return { generate: generate };
})();
