// codex/js/session-label.js
// The one way a ClassPulse session is named on an admin surface: linked to a turma it
// reads "Cliente · Turma", standalone (avulsa) it keeps its own title. This lived only
// inside questions/sessions.js until the dossiê picker turned up listing bare titles,
// which made a turma whose title omits its client ("Curso de Formação 2026") impossible
// to spot among the other clients' sessions.
//
// Accepts either row shape: list_sessions returns `title`, cp_list_sessions aliases the
// same column to `name`. Returns plain text — the caller escapes.
export function sessionLabel(session, fallback) {
  if (!session) return fallback || '';
  if (session.client_name && session.turma_name) {
    return session.client_name + ' · ' + session.turma_name;
  }
  return session.title || session.name || fallback || '';
}
