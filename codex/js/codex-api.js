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
//   (no prefix)  -> Questions host/admin core (sessions, bank, Q&A, stats)
//   cp_*  -> Questions public student/trilha path   (was "ClassPulse")
//   *_presentation, presentations table, R2 classforge/{slug}/ -> Slides (decks)
//
// Methods take an optional params object passed straight through; param shapes
// are pinned when each method is wired during its tab's migration.
//
// Transport seam (window.callWorker, set before the module boot):
//   On the Trail it is provided by codex/js/worker-call.js (Codex-owned, defaults
//   to codex-api, auth-free public path). On the admin it is still
//   backstage/js/api-client.js until that page's auth is ported. The facade is
//   identical either way; tests stub this global to read back the action.

export function call(action, params) {
  const p = Object.assign({}, params || {});
  p.action = action;
  return callWorker(p);
}

// Asset/src URLs for files the Worker serves (e.g. images from R2 at /r2/<path>).
// These go through the facade too, so the backend base is referenced in ONE
// place for BOTH action calls AND asset URLs; a future Worker move repoints here,
// not in tab modules. Pass the full path including any prefix, e.g.
// assetUrl('/r2/' + iconPath). Output is identical to the old inline form.
export function assetUrl(path) {
  return (window.WORKER_URL || '') + (path || '');
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
  listSessions: (p) => call('cp_list_sessions', p),
  liveSession:  (p) => call('cp_get_live_session', p)   // currently-live session banner (Lessons)
};

// Lessons (Aula) — the in-class content-run surface. cv_get_codex_view returns
// the released-item "vault" for a turma; action read from classvault.js.
export const lessons = {
  getCodexView: (p) => call('cv_get_codex_view', p)     // { client_slug, turma_slug } -> { vault }
};

// Audience config (Codex variable-question matrix): one JSON doc in the Backstage
// `config` table. Codex resolves variable questions client-side from it; the
// Worker only persists it. New net-new actions (not part of the frozen set).
export const audiences = {
  getConfig:  () => call('get_audience_config'),      // -> { config }
  saveConfig: (p) => call('save_audience_config', p)  // { config }
};

// Browser-safe runtime config served by the Worker: values the client needs but that
// must NOT live in the public frontend repo (e.g. the Google Picker API key for the
// slides gallery's Drive import). -> { config: { googlePickerApiKey } }
export const appConfig = {
  get: () => call('get_client_config')
};

// Questions (host/admin plane): live sessions, bank, student Q&A, stats. The
// core actions carry NO prefix (the original pre-prefix ClassPulse actions);
// cp_* is the public student/trilha path (see `cp` above), out of the host
// scope. Action strings are FROZEN (Backstage Worker `actions/sessions.js`);
// param shapes pinned inline.
export const questions = {
  // Sessions
  listSessions:    (p) => call('list_sessions', p),            // -> { sessions }
  createSession:   (p) => call('create_session', p),           // { title } -> { code }
  closeSession:    (p) => call('close_session', p),            // { code }
  reopenSession:   (p) => call('reopen_session', p),           // { code } (rejects if another session is open)
  deleteSession:   (p) => call('delete_session', p),           // { code } -> cascade-deletes answers + questions + student_questions + the session row
  renameSession:   (p) => call('rename_session', p),           // { code, title } -> updates the session title
  // Live polling
  launchQuestion:  (p) => call('launch_question', p),          // { session_code, text, options, correct_answer?, type?, max_select? } -> { id }
  closeQuestion:   (p) => call('close_question', p),           // { id, show_results?, reveal_answer? }
  deleteSessionQuestion: (p) => call('delete_session_question', p), // { id } -> delete one launched question + its answers (drops it from history AND stats)
  setVisibility:   (p) => call('set_question_visibility', p),  // { id, session_code, show_results }
  sessionState:    (p) => call('get_session_state', p),        // { code } -> { session, qa_enabled, pinned_question, active_question, history } (public)
  submitAnswer:    (p) => call('submit_answer', p),            // { question_id, session_code, student_name, answer_index? | answer_value? } (public, student-side; used by the debug-only in-host simulator)
  studentInbox:    (p) => call('cp_student_inbox', p),         // { session_code, student_name } (public; the answer-page heartbeat, also marks the student "connected" for presence. The debug simulator uses it to register bot presence so auto-revelar can fire.)
  // Bank (sets + questions)
  listSets:        (p) => call('list_question_sets', p),       // -> { banks }
  getQuestions:    (p) => call('get_questions', p),            // { list_name } -> { questions }
  addQuestion:     (p) => call('add_question', p),             // { list_name, question, options, correct_answer?, type?, max_select?, presentation_id? }
  addQuestionsBulk:(p) => call('add_questions_bulk', p),       // { list_name, questions[] }
  updateQuestion:  (p) => call('update_question', p),          // { list_name, original_question, question, type?, options?, correct_answer?, max_select?, new_list_name? }
  deleteQuestion:  (p) => call('delete_question', p),          // { list_name, question }
  updateSet:       (p) => call('update_question_set', p),      // { original_name, new_name }
  deleteSet:       (p) => call('delete_question_set', p),      // { list_name }
  reorder:         (p) => call('reorder_questions', p),        // { list_name, ordered_ids }
  search:          (p) => call('search_questions', p),         // { q } (>= 2 chars)
  // Student Q&A (instructor side)
  toggleQa:               (p) => call('toggle_qa', p),                // { code, enabled }
  listStudentQuestions:   (p) => call('list_student_questions', p),   // { session_code } -> { questions }
  updateStudentQuestion:  (p) => call('update_student_question', p),  // { id, status, answer? }
  pinStudentQuestion:     (p) => call('pin_student_question', p),     // { id, session_code }
  unpinStudentQuestion:   (p) => call('unpin_student_question', p),   // { session_code }
  promoteStudentQuestion: (p) => call('promote_student_question', p), // { session_code, id } -> { id }
  deleteStudentQuestion:  (p) => call('delete_student_question', p),  // { id }
  // Stats
  sessionStats:    (p) => call('session_stats', p),            // { code }
  globalStats:     (p) => call('global_stats', p),             // { date_from?, date_to? }
  // Answer moderation
  deleteAnswer:    (p) => call('delete_answer', p),            // { answer_id }
  // Student plane (public; consumed by Trilha, not the host UI). Kept for the
  // cohorts/lessons live banner; out of the host/admin Questions scope.
  activeForCohort: (p) => call('cp_get_active_for_turma', p)   // { client_slug, turma_slug }
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
  listAllTurmas:   (p) => call('ct_list_all_turmas', p),       // every turma across clients (Lessons sidebar)
  lookupTurmaBySession: (p) => call('ct_lookup_turma_by_session', p), // { session_id } -> { turma } (live host Trilha link)
  createTurma:     (p) => call('ct_create_turma', p),
  updateTurma:     (p) => call('ct_update_turma', p),          // { client_slug, slug, name?, display_name?, course_id?, hours?, ementa_json?, date_start?, date_end?, format?, place?, meetings?, modality? } — course-instance fields added with the Cursos data model (migration 0017)
  updateTurmaMeta: (p) => call('ct_update_turma_meta', p),
  archiveTurma:    (p) => call('ct_archive_turma', p),         // { client_slug, slug }
  regenTurmaToken: (p) => call('ct_regenerate_turma_token', p),// { client_slug, slug }
  listAulas:       (p) => call('ct_list_aulas', p),            // { client_slug, turma_slug }
  createAula:      (p) => call('ct_create_aula', p),
  updateAula:      (p) => call('ct_update_aula', p),
  deleteAula:      (p) => call('ct_delete_aula', p),           // { id }
  // Participant roster (API.md — Participant Roster, ct_* family, auth required)
  listParticipants:   (p) => call('ct_list_participants', p),  // { turma_id }
  addParticipant:     (p) => call('ct_add_participant', p),    // { turma_id, name, email?, cpf? }
  updateParticipant:  (p) => call('ct_update_participant', p), // { id, name?, email?, cpf? }
  deleteParticipant:  (p) => call('ct_delete_participant', p), // { id }
  importParticipants: (p) => call('ct_import_participants', p) // { turma_id, rows[] }
};

// Courses — reusable course templates (Cohorts → Cursos sub-tab). A course is a
// MOLD: its title/hours/ementa seed a turma's OWN editable copy (see the
// course_id/hours/ementa_json fields on cohorts.updateTurma). The certificate
// snapshots the turma's copy at issue. ct_*_course family (auth required), added
// with migration 0017. ementa_json shape (frontend-owned):
//   { modules: [ { title, topics: [ { title, subtopics: [ "..." ] } ] } ] }
export const courses = {
  list:    (p) => call('ct_list_courses', p),    // { include_archived? } -> { courses } (no ementa_json, + turma_count)
  get:     (p) => call('ct_get_course', p),      // { id } -> { course } (with ementa_json)
  create:  (p) => call('ct_create_course', p),   // { title, hours?, ementa_json? } -> { course }
  update:  (p) => call('ct_update_course', p),   // { id, title?, hours?, ementa_json? } -> { course }
  archive: (p) => call('ct_archive_course', p)   // { id }
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
  getSet:          (p) => call('ct_get_set', p),            // { id } -> { set, items }
  deleteSet:       (p) => call('ct_delete_set', p),         // { id } cascades to its items
  // Tarefas (assignments) authoring + student submissions. Action names read
  // from ct-admin.js (Phase 5). listItemTurmas powers the "also released in"
  // reuse label across turmas.
  listItemTurmas:  (p) => call('ct_list_item_turmas', p),   // { item_id }
  listSubmissions: (p) => call('ct_list_submissions', p),   // { item_id, client_slug, turma_slug }
  deleteSubmission:(p) => call('ct_delete_submission', p)   // { id }
};

// Drive sync (Content -> Drive sub-tab). Configured Drive root folders + the
// synced file index. The actual Google Drive read happens client-side through
// window.BS_GOOGLE (auth-bound, Backstage-owned); these are the Worker actions
// that persist the folder config + the synced item index. Action names cv_*
// (frozen). The native Drive module reaches the backend ONLY through here.
export const drive = {
  listFolders:  (p) => call('cv_list_drive_folders', p),   // -> { folders }
  addFolder:    (p) => call('cv_add_drive_folder', p),     // { name, folder_id } -> { folder }
  updateFolder: (p) => call('cv_update_drive_folder', p),  // { id, name?, folder_id? } -> { folder }
  deleteFolder: (p) => call('cv_delete_drive_folder', p),  // { id } -> { ok }
  listItems:    (p) => call('cv_list_drive_items', p),     // -> { ok, items, last_sync }
  syncItems:    (p) => call('cv_sync_drive_items', p)      // { items } -> { ok }
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
  // Debug-only: toggle the NOVO badge for every item in an aula by moving
  // released_at relative to the 5-day window. fresh:false hides, fresh:true shows.
  setFreshness: (p) => call('ct_set_release_freshness', p), // { client_slug, turma_slug, aula_number, fresh }
  // Aggregate student-view payload for a turma: the released items with their
  // aula_number binding. Needs the turma token (read from ct_list_turmas).
  turmaView: (p) => call('ct_get_turma_view', p)    // { client_slug, turma_slug, token }
};

// Certificates — admin cert_* actions (API.md §Certificate Administration, auth required).
//
// NOTE: The PUBLIC `cert_validate` action is intentionally NOT here. It is consumed
// by the public Trilha validar page directly (no auth required) and is not a Codex
// admin operation. Certificate TEMPLATES reuse the existing `slides` facade with
// `engine: 'codex-certificate'`; no new template methods are needed here.
export const certificates = {
  issue:      (p) => call('cert_issue', p),       // { turma_id, participant_ids[], course_title, hours?, issued_on?, issuer?, template_slug?, theme?, meta_json? }
  list:       (p) => call('cert_list', p),        // { turma_id?, status?, q? }
  get:        (p) => call('cert_get', p),         // { code }
  revoke:     (p) => call('cert_revoke', p),      // { code }
  remove:     (p) => call('cert_delete', p),      // { code } — hard-delete, ONLY while status='issued'
  markSigned: (p) => call('cert_mark_signed', p), // { code }
  markSent:   (p) => call('cert_mark_sent', p),   // { code }
  attachPdf:  (p) => call('cert_attach_pdf', p)   // { code, pdf_b64 }
};
