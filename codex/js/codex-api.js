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
//   Also reads window.WORKER_URL (boot-set base URL, index.html) in assetUrl(),
//   falling back to '' — the single place R2/asset URLs resolve.

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

// Admin auth (Codex own-login + settings + the desktop cert-signer). The action strings
// are the frozen codex-api auth contract; feature modules reach them through this seam
// instead of calling window.callWorker directly (§3b, facade-only).
export const auth = {
  otpRequest:     (p) => call('admin_otp_request', p),   // { email }
  // The "não recebi" (didn't receive it) button has its OWN action, and it's not for show: when
  // login goes through the platform's `otp` module, re-requesting with a still-live code doesn't
  // send another e-mail (that's what stops two codes landing in the inbox). Only the explicit
  // resend sends one. Without this line, "não recebi" would answer ok with nothing going out.
  otpResend:      (p) => call('admin_otp_resend', p),     // { email }
  otpVerify:      (p) => call('admin_otp_verify', p),     // { email, code }
  changePassword: (p) => call('change_password', p),      // { auth_token, new_hash }
  validate:       (p) => call('validate_auth', p),        // { auth_token } -> { ok }
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
  launchQuestion:  (p) => call('launch_question', p),          // { session_code, text, options, correct_answer?, type?, max_select?, bank_id? } -> { id }
  launchedBankIds: (p) => call('launched_bank_ids', p),        // { session_code } -> { ids } (bank questions already applied — worker c)
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
  reorderSets:     (p) => call('reorder_question_sets', p),    // { ordered_names }: drag order of the Conjuntos sidebar
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
  unarchiveTurma:  (p) => call('ct_unarchive_turma', p),       // { client_slug, slug } -> status back to 'active'
  deleteTurma:     (p) => call('ct_delete_turma', p),          // { client_slug, slug } -> permanent, cascades per-turma rows (keeps global items + certificates)
  regenTurmaToken: (p) => call('ct_regenerate_turma_token', p),// { client_slug, slug }
  listAulas:       (p) => call('ct_list_aulas', p),            // { client_slug, turma_slug }
  createAula:      (p) => call('ct_create_aula', p),
  updateAula:      (p) => call('ct_update_aula', p),
  deleteAula:      (p) => call('ct_delete_aula', p),           // { id }
  reorderAulas:    (p) => call('ct_reorder_aulas', p),         // { client_slug, turma_slug, ordered_ids: [aula_id...] } — renumbers + remaps release/plan bindings in lockstep
  // Participant roster (API.md — Participant Roster, ct_* family, auth required)
  listParticipants:   (p) => call('ct_list_participants', p),  // { turma_id }
  listStudents:       (p) => call('ct_list_students', p),      // -> { students:[{id,email,name,role,turma_count,turmas,name_variants,...}] } cross-turma dedup roster
  // THE list, both admin scopes. turma_id is the FILTER, not a different endpoint: omit it for the
  // global Pessoas roster, pass it for a cohort's Participantes panel. Same shape either way.
  setPersonEmails:    (p) => call('ct_set_person_emails', p), // { student_id, emails:[primary,...aliases] } -> the box IS the truth; a new primary rewrites every row + RESETS validation
  listPeople:         (p) => call('ct_list_people', p),        // { turma_id? } -> { people:[{id,email,name,role,aliases,cpf,turma_count,rows:[...]}] }
  personTurmas:       (p) => call('ct_person_turmas', p),      // { student_ids:[] } -> { people:[{ student_id, turmas:[{turma_id,client_slug,turma_slug,turma_name,participant_id}] }] } — the dossiê remove decision
  setCanonicalName:   (p) => call('ct_set_canonical_name', p), // { student_id, name } -> sets + LOCKS the identity name
  // The person's data goes, one of two ways (Élder's "completa" vs "anonimizar"). preview READS
  // what each mode would cost, including what neither can reach; erase does it.
  erasePreview:       (p) => call('ct_erase_preview', p),      // { student_id } -> { participants, submissions, posts, left_behind }
  erasePerson:        (p) => call('ct_erase_person', p),       // { student_id, mode: 'purge'|'anonymize' }
  // Duplicate identities (one person, two e-mails). find -> suggested pairs; merge -> survivor
  // absorbs loser (permanent, via the e-mail alias); dismiss -> "não é a mesma pessoa", forever.
  findDuplicates:     (p) => call('ct_find_duplicates', p),    // -> { pairs:[{a,b,reasons,suggestion}], count }
  mergeStudents:      (p) => call('ct_merge_students', p),     // { survivor_id, loser_id, name?, email? } -> name + PRIMARY are chosen; the address not chosen becomes the alias
  dismissDuplicate:   (p) => call('ct_dismiss_duplicate', p),  // { a_student_id, b_student_id }
  // The Limpeza tool's other half: registrations that look like throwaway tests. Suggestion only —
  // nothing is pre-selected, and the delete goes through the ordinary deleteParticipant path.
  // dismiss -> "não é um registro de teste", forever; the mirror of dismissDuplicate above.
  findTestAccounts:   (p) => call('ct_find_test_accounts', p), // -> { people:[{id,email,name,participant_ids,reasons}], count }
  dismissTestAccount: (p) => call('ct_dismiss_test_account', p), // { student_id }
  addParticipant:     (p) => call('ct_add_participant', p),    // { turma_id, name, email?, cpf? }
  updateParticipant:  (p) => call('ct_update_participant', p), // { id, name?, email?, cpf? }
  deleteParticipant:  (p) => call('ct_delete_participant', p), // { id }
  importParticipants: (p) => call('ct_import_participants', p), // { turma_id, rows[] }
  // Trail access-control admin (Phase 7): the Alunos section drives these.
  setParticipantAccess:  (p) => call('ct_set_participant_access', p),   // { participant_id|participant_ids, status }
  setEmailVerified:      (p) => call('ct_set_email_verified', p),       // { participant_id|participant_ids, verified? } — admin "validar acesso" (track-29)
  rosterApprove:         (p) => call('ct_roster_approve', p),           // { turma_id, emails[] }
  revokeStudentSessions: (p) => call('ct_revoke_student_sessions', p),  // { participant_id }
  // QR enrollment window (Phase 7b): open mints the token + expiry (+ turma_token to
  // build the QR URL); get re-reads state for the live countdown; close shuts it.
  openEnrollment:        (p) => call('ct_open_enrollment', p),          // { client_slug, slug, ttl_seconds? } — mints if none, REUSES a live window, sets qr_shown=1
  closeEnrollment:       (p) => call('ct_close_enrollment', p),         // { client_slug, slug }
  setEnrollmentQr:       (p) => call('ct_set_enrollment_qr', p),        // { client_slug, slug, shown } — project/un-project the QR without touching the window
  getEnrollment:         (p) => call('ct_get_enrollment', p),           // { client_slug, slug } -> { open, now, enrollment_token, enrollment_expires_at, turma_token, qr_shown }
  // (Unified 2026-07-13: e-mail-only entry now rides the ONE enrollment window above; there is no
  // separate reentry open/close/get action anymore. The wall reads access.window_open from the view.)
  // Fórum moderation (Phase 8). The instructor moderates ENTIRELY from Codex (no
  // Trilha access), so this is the full toolkit: list/open threads, open a new one,
  // reply as professor, pin, delete, and edit his own (admin-authored) post.
  forumListThreads:  (p) => call('ct_forum_admin_list_threads', p),  // { client_slug, turma_slug } -> { ok, threads }
  forumGetThread:    (p) => call('ct_forum_admin_get_thread', p),    // { thread_id } -> { ok, thread, posts }
  forumCreateThread: (p) => call('ct_forum_admin_create_thread', p), // { client_slug, turma_slug, title, body, pinned? } -> { ok, thread }
  forumReply:        (p) => call('ct_forum_admin_reply', p),         // { thread_id, parent_post_id?, body } -> { ok, post }
  forumSetPinned:    (p) => call('ct_forum_set_pinned', p),          // { thread_id, pinned } -> { ok }
  forumDeletePost:   (p) => call('ct_forum_delete_post', p),         // { post_id } -> { ok }
  forumDeleteThread: (p) => call('ct_forum_delete_thread', p),       // { thread_id } -> { ok }
  forumEditPost:     (p) => call('ct_forum_admin_edit_post', p),     // { post_id, body } -> { ok } (admin-authored posts only)
  // Cross-turma teacher notifications (the topbar bell).
  forumNotifications:(p) => call('ct_forum_admin_notifications', p), // -> { ok, count, items }
  forumMarkSeen:     (p) => call('ct_forum_admin_mark_seen', p),     // { scope?: 'glance'|'all', client_slug?, turma_slug? } -> { ok } (glance = clears Dispensáveis on open; all = clears everything)
  forumDismiss:      (p) => call('ct_forum_admin_dismiss', p)        // { notif_key, up_to_at } -> { ok } (dismiss ONE Acionável)
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
  archive: (p) => call('ct_archive_course', p),  // { id }
  unarchive: (p) => call('ct_unarchive_course', p), // { id } — restores an archived course to the active list
  duplicate: (p) => call('ct_duplicate_course', p), // { id } -> { course } — copies title(+cópia)/hours/ementa/apostila into a fresh mold
  remove:  (p) => call('ct_delete_course', p),   // { id } -> { ok } | { error:'course_in_use', turma_count } when turmas still link it
  setApostila: (p) => call('ct_set_course_apostila', p), // { id, apostila_set_id|null } -> { course } — binds the course's apostila
  // Ordering + sections (track-21 Phase B, migration 0023) — mirror the tarefa-section family.
  reorder:       (p) => call('ct_reorder_courses', p),        // { ordered_ids } — sort_order for a bucket (flat list or one section)
  listSections:  (p) => call('ct_list_course_sections', p),   // -> { sections:[{id,name,position}] }
  createSection: (p) => call('ct_create_course_section', p),  // { name } -> { section }
  renameSection: (p) => call('ct_rename_course_section', p),  // { id, name }
  reorderSections:(p) => call('ct_reorder_course_sections', p),// { order:[ids] }
  deleteSection: (p) => call('ct_delete_course_section', p),  // { id } — orphans its courses to no-section
  setSection:    (p) => call('ct_set_course_section', p)      // { course_id, section_id|null, ordered_ids? } — move + reposition
};

// Roteiro (lesson runbook, track-46 fatia 2). Two scopes on the same ct_* family:
// the aula's own editable copy (roteiro_json + which curso base it points at) and
// the curso's numbered base library (Cursos -> base editor, cohorts/courses.js).
// Consumed by roteiro/roteiro-store.js (aula side) and cohorts/courses.js (curso
// side); never called with callWorker directly. Action names per the frozen
// contract in manifest/tasks/track-46.md, built in parallel on the Worker.
export const roteiro = {
  getAula:         (p) => call('ct_get_aula_roteiro', p),     // { id } -> { roteiro_json, roteiro_base_number }
  setAula:         (p) => call('ct_set_aula_roteiro', p),     // { id, roteiro_json, roteiro_base_number } -> { ok }
  listCourseBases: (p) => call('ct_list_course_roteiros', p), // { course_id } -> { roteiros:[{id,aula_number,roteiro_json}] }
  saveCourseBase:  (p) => call('ct_save_course_roteiro', p),  // { course_id, aula_number, roteiro_json } -> { ok, id } (UPSERT on course_id+aula_number)
};

// Content — the item library (Items sub-tab) plus the shared types/tags it
// depends on. Action names read from ct-admin.js; param shapes noted inline.
export const content = {
  listItems:       (p) => call('ct_list_items', p),         // { type? }
  getItem:         (p) => call('ct_get_item', p),           // { id }
  createItem:      (p) => call('ct_create_item', p),
  updateItem:      (p) => call('ct_update_item', p),
  deleteItem:      (p) => call('ct_delete_item', p),        // { id }
  setItemMembers:  (p) => call('ct_set_item_members', p),   // { parent_item_id, children:[{id,indent}] } -> { ok, children }
  duplicateItem:   (p) => call('ct_duplicate_item', p),     // { id }
  bulkDeleteItems: (p) => call('ct_delete_items_bulk', p),  // { ids }
  // Idempotent: upserts a real ct_items row per entry of the catalogue the CALLER sends,
  // so a shipped-artifact type can be released via the normal Liberações flow. The
  // catalogue is the frontend registry, and js/registry-sync.js is the one place that
  // builds it — call these through it, never with a payload assembled on the spot.
  ensureLabItems:  (p) => call('ct_ensure_lab_items', p),              // { labs: [{key,title,summary}] }
  ensureInterativoItems: (p) => call('ct_ensure_interativo_items', p), // { interativos: [...] }
  uploadAsset:     (p) => call('ct_upload_asset', p),       // { item_id, filename, content_b64 }
  ingestGdoc:      (p) => call('ct_ingest_gdoc', p),        // { url, mode }
  listTypes:       (p) => call('ct_list_types', p),
  createType:      (p) => call('ct_create_type', p),        // { slug, label, icon?, family? } family = 'item' | 'bundle' (a bundle holds other items)
  updateType:      (p) => call('ct_update_type', p),        // { slug, label?, icon?, family? } icon = "glyph:<key>"; family = 'item' | 'bundle'
  deleteType:      (p) => call('ct_delete_type', p),        // { slug } -> { error:'type_in_use', count } if used
  listTags:        (p) => call('ct_list_tags', p),
  createTag:       (p) => call('ct_create_tag', p),         // { label }
  renameTag:       (p) => call('ct_rename_tag', p),         // { id, label }
  deleteTag:       (p) => call('ct_delete_tag', p),         // { id }
  // Apostila sets (imported course content). Shared by Apostila + the Releases
  // composer (which surfaces the current set's items as the "Conteúdo do curso"
  // pool). Action names read from ct-admin.js.
  listSets:        (p) => call('ct_list_sets', p),          // -> { sets:[{id,name,category_label,item_count,course_count}] }
  getSet:          (p) => call('ct_get_set', p),            // { id } -> { set, items }
  deleteSet:       (p) => call('ct_delete_set', p),         // { id } cascades to its items
  // Apostila redesign (2026-07): create/rename apostilas, reorder live sections, and the
  // working-copy (draft) -> converge flow. The AI edits the copy; converge applies it to
  // the live items by id so releases/access are preserved. See actions/apostila.js.
  createSet:         (p) => call('ct_create_set', p),          // { name } -> { set }
  updateSet:         (p) => call('ct_update_set', p),          // { id, name?, category_label? }
  reorderSetItems:   (p) => call('ct_reorder_set_items', p),   // { set_id, ordered_ids }
  startDraft:        (p) => call('ct_start_apostila_draft', p),// { set_id } -> seeds + { exists, sections, removed }
  getDraft:          (p) => call('ct_get_apostila_draft', p),  // { set_id } -> { exists, sections, removed }
  saveDraftSection:  (p) => call('ct_save_draft_section', p),  // { set_id, id?, title, body_md, summary? } -> { section }
  deleteDraftSection:(p) => call('ct_delete_draft_section', p),// { id }
  reorderDraft:      (p) => call('ct_reorder_draft', p),       // { set_id, ordered_ids }
  discardDraft:      (p) => call('ct_discard_apostila_draft', p),// { set_id }
  convergeApostila:  (p) => call('ct_converge_apostila', p),   // { set_id, force? } -> { updated, inserted, removed } | { error:'converge_removals_released', removals }
  // Tarefas (assignments) authoring + student submissions. Action names read
  // from ct-admin.js (Phase 5). listItemTurmas powers the "also released in"
  // reuse label across turmas.
  listItemTurmas:  (p) => call('ct_list_item_turmas', p),   // { item_id }
  listSubmissions: (p) => call('ct_list_submissions', p),   // { item_id, client_slug, turma_slug } -> { submissions, flags }
  // The toggles for ALL of the turma's tarefas, at once. The panel needs them to DRAW the
  // list; without this it only knew the open card's and drew the rest as off.
  listTarefaFlags: (p) => call('ct_list_tarefa_flags', p), // { client_slug, turma_slug } -> { flags: { <item_id>: {...} } }
  deleteSubmission:(p) => call('ct_delete_submission', p),  // { id }
  // Instructor reply + grade per submission, and the per-instance toggles (t1b redesign).
  replySubmission: (p) => call('ct_reply_submission', p),   // { id, reply } (empty clears)
  gradeSubmission: (p) => call('ct_grade_submission', p),   // { id, grade } (empty clears)
  setTarefaFlags:  (p) => call('ct_set_tarefa_flags', p),   // { client_slug, turma_slug, item_id, reply_enabled?, grade_enabled? }
  // Tarefa bank sections (Fatia 6, t1b): named reorderable groups for the tarefa bank.
  // No copy/instance — placing a tarefa on an aula stays a release; these organize the bank.
  listTarefaSections:   (p) => call('ct_list_tarefa_sections', p),   // -> { sections }
  createTarefaSection:  (p) => call('ct_create_tarefa_section', p),  // { name } -> { section }
  renameTarefaSection:  (p) => call('ct_rename_tarefa_section', p),  // { id, name }
  reorderTarefaSections:(p) => call('ct_reorder_tarefa_sections', p),// { order:[id,...] }
  deleteTarefaSection:  (p) => call('ct_delete_tarefa_section', p),  // { id } orphans its tarefas
  setItemSection:       (p) => call('ct_set_item_section', p)        // { item_id, section_id|null, position? }
};

// Labs state (track-65): the admin's four decisions per lab — on/off, archived, renamed, order.
// They used to be four localStorage keys, so the public Trail never filtered them. Reached ONLY
// through js/labs-state.js, which owns the cache and the write policy; no tab module calls these
// directly. The read carries no auth on purpose (the Trail has to be able to make it).
export const labsState = {
  get:      ()  => call('ct_labs_state_get'),           // -> { ok, state: { <lab_key>: {enabled, archived, display_name, sort_order} } }
  set:      (p) => call('ct_labs_state_set', p),        // { lab_key, enabled?, archived?, display_name?, sort_order? } — absent field = unchanged
  // The whole order in ONE call, applied in a single D1 batch. A drag is one fact, and a
  // half-written order reads back as valid and is unrepairable by retry.
  setOrder: (p) => call('ct_labs_state_set_order', p)   // { keys: [lab_key, ...] } — a key left out has its position cleared
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
  setAulas:  (p) => call('ct_set_release_aulas', p), // { ..., aula_numbers: [1,3] } (#23 multi-aula)
  // Copy every released item from one turma to another, same client or a different
  // one (from_client_slug, optional, defaults server-side to client_slug). Additive:
  // items already released in the target are skipped, nothing is removed.
  copyReleases: (p) => call('ct_copy_releases', p),  // { client_slug, from_client_slug?, from_turma_slug, to_turma_slug }
  // Debug-only: toggle the NOVO badge for every item in an aula by moving
  // released_at relative to the 5-day window. fresh:false hides, fresh:true shows.
  setFreshness: (p) => call('ct_set_release_freshness', p), // { client_slug, turma_slug, aula_number, fresh }
  // Aggregate student-view payload for a turma: the released items with their
  // aula_number binding. Needs the turma token (read from ct_list_turmas). admin_full
  // bypasses reveal-on-completion so the composer/aula-hub always sees the full released
  // set (the Trail facade omits it, so student + admin-preview get the gated view).
  turmaView: (p) => call('ct_get_turma_view', Object.assign({ admin_full: true }, p))
};

// Apps: external relying-party apps that integrate via the /ext/ identity contract
// (1st: the PDF Extractor). Admin side only here: the catalog (Content > Aplicativos
// sub-tab) + the per-aula release toggle (the aula Liberações "Aplicativos" section).
// An app is released to a SPECIFIC aula (setTurmaApp carries aula_number), like content;
// the trilha reads the granted apps from ct_get_turma_view's apps[] (see releases.turmaView).
export const apps = {
  list:         (p) => call('ct_list_apps', p),           // -> { apps } (catalog: name/store_url/icon/description/enabled)
  create:       (p) => call('ct_create_app', p),          // { app_key, name, store_url?, icon?, description?, enabled? } -> { app_key, api_key } — api_key is RAW and returned ONCE, never readable again
  updateApp:    (p) => call('ct_update_app', p),          // { app_key, name?, store_url?, icon?, description?, enabled? } (only passed fields change)
  getTurmaApps: (p) => call('ct_get_turma_apps', p),      // { turma_id } -> { apps } (grants + bound aula_number, for the toggle state)
  setTurmaApp:  (p) => call('ct_set_turma_app', p)        // { turma_id, app_key, enabled, aula_number? } (release/unrelease to an aula)
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

// Certificates — public signer surface (track-58, no auth). Deliberately narrower
// than `certificates` above: the Assinador desktop app has no login of its own by
// design, so these wrap the admin actions with the constraints that make that safe
// (no e-mail field, status locked to 'issued', writes refuse anything not 'issued').
export const certSigner = {
  list:       (p) => call('cert_signer_list', p),        // { } -> always status='issued', no email
  markSigned: (p) => call('cert_signer_mark_signed', p),  // { code }
  attachPdf:  (p) => call('cert_signer_attach_pdf', p)    // { code, pdf_b64 }
};

// track-44 — comunicados (broadcast autorado). send returns { ok, comunicado_id, reach:{bell,email,push} }.
export const comunicados = {
  send: (p) => call('ct_comunicado_send', p), // { scope:'global'|'turmas', turma_ids?, category, title, body, image_key?, link?, channels:{bell,email,push} }
  list: (p) => call('ct_comunicado_list', p), // { limit? } -> { ok, comunicados:[...] }
};

// Generic e-mail (shared transport). Any tab composes its own subject/body and
// calls email.send; the Worker forwards to Resend via lib/email.js. Auth-required.
// Prefer the js/codex-email.js helper (validation + error routing) over calling
// this directly.
export const email = {
  send: (p) => call('send_email', p) // { to, subject, html?, text?, attachments?:[{filename,content(base64)}], from?, replyTo? } -> { ok, id }
};
