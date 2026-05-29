// Codex API facade.
//
// Codex modules reach the Worker ONLY through this facade, never callWorker
// directly. Each method maps to a legacy action string (the Worker contract is
// FROZEN). As each tab migrates, add its methods here with the real action
// names read from the Worker; never invent an action string.
//
// Worker-action legend (historical codenames, do NOT rename — frozen contract):
//   ct_*  -> Content + Cohorts          (was "ClassTrail")
//   cv_*  -> Lesson surface + Drive       (was "ClassVault")
//   cp_*  -> Questions / live sessions    (was "ClassPulse")
//   *_presentation, presentations table, R2 classforge/{slug}/ -> Slides (decks)
//
// Methods take an optional params object passed straight through; param shapes
// are pinned when each method is wired during its tab's migration.
//
// Globals (shared Backstage script, loaded before the module boot):
//   window.callWorker  (../backstage/js/api-client.js)

export function call(action, params) {
  const p = Object.assign({}, params || {});
  p.action = action;
  return callWorker(p);
}

// Slides — authored decks (Slides sub-tab + deck editor). Deck JSON in R2 via
// the presentation_json actions. Google Slides embeds render in Lessons, not here.
export const slides = {
  list:        (p) => call('list_presentations', p),
  getDeck:     (p) => call('get_presentation_json', p),  // { slug }
  saveDeck:    (p) => call('put_presentation_json', p),  // { slug, data }
  register:    (p) => call('register_presentation', p),
  remove:      (p) => call('delete_presentation', p),    // { slug }
  uploadImage: (p) => call('upload_image', p)
};

// ClassPulse sessions list — shared by Cohorts (turma form) and Questions.
export const cp = {
  listSessions: (p) => call('cp_list_sessions', p)
};

// Questions — live sessions, banks, stats.
export const questions = {
  listSessions:    (p) => call('list_sessions', p),
  listSets:        (p) => call('list_question_sets', p),
  getQuestions:    (p) => call('get_questions', p),
  sessionState:    (p) => call('get_session_state', p),
  activeForCohort: (p) => call('cp_get_active_for_turma', p)
};

// Session <-> deck linking (shared by Lessons + Questions surfaces).
export const links = {
  link:    (p) => call('link_presentation', p),   // { code, slug }
  unlink:  (p) => call('unlink_presentation', p), // { code }
  forSlug: (p) => call('get_linked_session', p)   // { slug }
};

// AI helpers (provider fallback chain lives in the Worker).
export const ai = {
  question: (p) => call('ai_question', p),
  theme:    (p) => call('ai_theme', p),
  // Generic chat used by the item editor/creator. Mirrors the legacy
  // AIClient.generate: a rate-limit (429/503) resolves to null so callers can
  // surface a friendly "try again" instead of throwing.
  chat:     (p) => call('ai_chat', p).catch((e) => {
    if (e && e.data && e.data.rate_limited) return null;
    throw e;
  })
};

// Cohorts — clients -> turmas -> aulas. Action names read from ct-admin.js;
// param shapes noted inline.
export const cohorts = {
  listClients:     (p) => call('ct_list_clients', p),
  createClient:    (p) => call('ct_create_client', p),         // { name, display_name?, slug }
  updateClient:    (p) => call('ct_update_client', p),         // { slug, name, display_name? }
  deleteClient:    (p) => call('ct_delete_client', p),         // { slug }
  archiveClient:   (p) => call('ct_archive_client', p),        // { slug }
  setClientIcon:   (p) => call('ct_set_client_icon', p),       // { slug, mode, value, filename? }
  listTurmas:      (p) => call('ct_list_turmas', p),           // { client_slug }
  createTurma:     (p) => call('ct_create_turma', p),
  updateTurma:     (p) => call('ct_update_turma', p),          // { client_slug, slug, name, display_name? }
  updateTurmaMeta: (p) => call('ct_update_turma_meta', p),
  archiveTurma:    (p) => call('ct_archive_turma', p),         // { client_slug, slug }
  regenTurmaToken: (p) => call('ct_regenerate_turma_token', p),// { client_slug, slug }
  listAulas:       (p) => call('ct_list_aulas', p),            // { client_slug, turma_slug }
  createAula:      (p) => call('ct_create_aula', p),
  updateAula:      (p) => call('ct_update_aula', p),
  deleteAula:      (p) => call('ct_delete_aula', p)            // { id }
};

// Content — the item library (Items sub-tab) plus the shared types/tags it
// depends on. Action names read from ct-admin.js; param shapes noted inline.
export const content = {
  listItems:       (p) => call('ct_list_items', p),         // { type? }
  getItem:         (p) => call('ct_get_item', p),           // { id }
  createItem:      (p) => call('ct_create_item', p),
  updateItem:      (p) => call('ct_update_item', p),
  deleteItem:      (p) => call('ct_delete_item', p),        // { id }
  duplicateItem:   (p) => call('ct_duplicate_item', p),     // { id }
  bulkDeleteItems: (p) => call('ct_delete_items_bulk', p),  // { ids }
  uploadAsset:     (p) => call('ct_upload_asset', p),       // { item_id, filename, content_b64 }
  ingestGdoc:      (p) => call('ct_ingest_gdoc', p),        // { url, mode }
  listTypes:       (p) => call('ct_list_types', p),
  createType:      (p) => call('ct_create_type', p),        // { slug, label, icon? }
  updateType:      (p) => call('ct_update_type', p),        // { slug, label?, icon? } icon = "glyph:<key>"
  deleteType:      (p) => call('ct_delete_type', p),        // { slug } -> { error:'type_in_use', count } if used
  listTags:        (p) => call('ct_list_tags', p),
  createTag:       (p) => call('ct_create_tag', p),         // { label }
  renameTag:       (p) => call('ct_rename_tag', p),         // { id, label }
  deleteTag:       (p) => call('ct_delete_tag', p),         // { id }
  // Apostila sets (imported course content). Shared by Apostila + the Releases
  // composer (which surfaces the current set's items as the "Conteúdo do curso"
  // pool). Action names read from ct-admin.js.
  listSets:        (p) => call('ct_list_sets', p),
  getSet:          (p) => call('ct_get_set', p)             // { id } -> { set, items }
};

// Lesson presets — named bundles of library items, reused when planning a
// lesson. A Content sub-tab (Presets) and, later, the Lessons sidebar consume
// these. Action names read from cv-presets-api.js (cv_*_preset, frozen); the
// list/single responses unwrap to { presets } / { preset } in the caller.
export const presets = {
  list:   (p) => call('cv_list_presets', p),
  get:    (p) => call('cv_get_preset', p),     // { id }
  create: (p) => call('cv_create_preset', p),  // { name, item_ids }
  update: (p) => call('cv_update_preset', p),  // { id, name?, item_ids? }
  remove: (p) => call('cv_delete_preset', p)   // { id }
};

// Releases (liberações) of items to a turma. (Lives in Content, kept here as
// the cross-cutting turma<->item binding.)
export const releases = {
  release:   (p) => call('ct_release_item', p),     // { client_slug, turma_slug, item_id }
  unrelease: (p) => call('ct_unrelease_item', p),
  setAula:   (p) => call('ct_set_release_aula', p), // { ..., aula_number_or_null }
  // Aggregate student-view payload for a turma: the released items with their
  // aula_number binding. Needs the turma token (read from ct_list_turmas).
  turmaView: (p) => call('ct_get_turma_view', p)    // { client_slug, turma_slug, token }
};
