// ai-client.js — shared AI generation module
// Reads API keys from localStorage, delegates to Worker ai_question action.
// Rate-limited errors (429/503) are suppressed here and resolve as null.
// Callers must guard against null return.
var AIClient = (function() {
  function getKeys() {
    return {
      gemini_key:   localStorage.getItem('bs_gemini_key')   || '',
      gemini_key2:  localStorage.getItem('bs_gemini_key2')  || '',
      deepseek_key: localStorage.getItem('bs_deepseek_key') || ''
    };
  }

  function generate(params) {
    return callWorker(Object.assign(
      { action: 'ai_question', auth_token: AUTH_TOKEN },
      getKeys(),
      params
    )).catch(function(e) {
      if (e.data && e.data.rate_limited) return null;
      throw e;
    });
  }

  return { generate: generate };
})();
