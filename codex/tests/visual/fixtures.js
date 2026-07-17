// Fixture data for the visual harness (tests/visual/harness.html).
//
// Shaped to exercise every visual branch of the CLIENTES nav at once, because the
// screenshot is the whole point: the three status bands (ativos/futuros/inativos),
// a client WITH an icon and one without (avatar vs initials), each turma phase
// (live/plan/done), an archived turma, and a client with no turmas.
//
// The seam is window.callWorker — codex-api.js's ONE transport (its own header says
// "tests stub this global"), so the REAL facade and the REAL module run on top of it.

const TODAY = '2026-07-16';
const day = (n) => { const d = new Date(TODAY + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export const CLIENTS = [
  { slug: 'tjmg',    name: 'TJMG',    display_name: 'Tribunal de Justiça de MG', status: 'active', icon_path: null },
  { slug: 'jfse',    name: 'JFSE',    display_name: 'Justiça Federal de Sergipe', status: 'active', icon_path: null },
  { slug: 'anoreg',  name: 'Anoreg',  display_name: 'Anoreg BR',                  status: 'active', icon_path: null },
  { slug: 'vazio',   name: 'Vazio',   display_name: 'Cliente Sem Turma',          status: 'active', icon_path: null },
  { slug: 'antigo',  name: 'Antigo',  display_name: 'Cliente Antigo',             status: 'active', icon_path: null },
];

export const TURMAS = {
  // ativo: has a live turma (dates straddle today) -> band "ativos"
  tjmg: [
    { slug: 'turma-1', name: 'Turma 1 — Magistrados', client_slug: 'tjmg', status: 'active',
      course_title: 'IA aplicada à Magistratura', aula_count: 8,
      computed_date_start: day(-10), computed_date_end: day(20) },
    { slug: 'turma-0', name: 'Turma 0 — Piloto', client_slug: 'tjmg', status: 'active',
      course_title: 'IA aplicada à Magistratura', aula_count: 4,
      computed_date_start: day(-90), computed_date_end: day(-60) },
    { slug: 'turma-x', name: 'Turma X — Cancelada', client_slug: 'tjmg', status: 'archived',
      course_title: 'IA aplicada à Magistratura', aula_count: 2,
      computed_date_start: day(-120), computed_date_end: day(-110) },
  ],
  // ativo: an undated turma reads as ongoing (cdx-ph-none)
  jfse: [
    { slug: 'turma-teste', name: 'Turma Teste', client_slug: 'jfse', status: 'active',
      course_title: '', aula_count: 1 },
  ],
  // futuro: only upcoming turmas -> band "futuros"
  anoreg: [
    { slug: 'turma-2027', name: 'Turma 2027 — Registradores', client_slug: 'anoreg', status: 'active',
      course_title: 'IA para Cartórios', aula_count: 6,
      computed_date_start: day(45), computed_date_end: day(75) },
  ],
  // no turmas at all -> the "Nenhuma turma" empty group
  vazio: [],
  // inativo: everything finished -> band "inativos"
  antigo: [
    { slug: 'turma-2024', name: 'Turma 2024', client_slug: 'antigo', status: 'active',
      course_title: 'Curso Encerrado', aula_count: 12,
      computed_date_start: day(-400), computed_date_end: day(-370) },
  ],
};

// Questions > Sessões: a FLAT list (no grouping), mixing the two card shapes the picker has —
// a turma-linked session (labelled "Cliente · Turma") and a standalone one keeping its title —
// plus an open one, which is the only one that shows the live dot.
export const SESSIONS = [
  { code: 'ABC123', title: 'Aula ao vivo', status: 'open',   created_at: '2026-07-14T10:00:00Z',
    client_name: 'TJMG', turma_name: 'Turma 1' },
  { code: 'DEF456', title: 'Sessão avulsa de Q&A', status: 'closed', created_at: '2026-07-02T10:00:00Z' },
  { code: 'GHI789', title: '', status: 'closed', created_at: '2026-06-20T10:00:00Z',
    client_name: 'JFSE', turma_name: 'Turma Teste' },
  { code: 'JKL012', title: '', status: 'closed', created_at: '2026-05-11T10:00:00Z' },  // -> "sem título"
];

// Lessons (Aula): the released vault of one turma. Shaped so EVERY sidebar section renders at
// once — classifyVault sorts by type/set_id, so one row per bucket is what fills the screen:
//   llm -> type 'llm' · external -> 'popup_url' · drive -> 'drive_file' · apostila -> set_id
//   tarefas -> 'tarefa' · items -> everything else, sub-grouped by type
// A section that does not render is a section the drag test cannot drag.
export const VAULT = [
  { id: 101, title: 'ChatGPT da turma', type: 'llm', type_label: 'LLM', summary: 'Conta compartilhada',
    meta_json: { url: 'https://chatgpt.com/' } },
  { id: 102, title: 'Portal do CNJ', type: 'popup_url', type_label: 'Link',
    meta_json: { url: 'https://www.cnj.jus.br/' } },
  { id: 103, title: 'Apostila — módulo 1', type: 'conteudo', type_label: 'Conteúdo', set_id: 7,
    body_md: '# Módulo 1\n\nTexto da apostila.' },
  // A SECOND apostila row, so one non-favourites section holds two cards side by side. That is
  // the only way to attempt a drag outside Favoritos and prove the favourites list is untouched.
  { id: 108, title: 'Apostila — módulo 2', type: 'conteudo', type_label: 'Conteúdo', set_id: 7,
    body_md: '# Módulo 2\n\nMais texto.' },
  { id: 104, title: 'Tarefa 1 — redigir despacho', type: 'tarefa', type_label: 'Tarefa',
    body_md: 'Enunciado da tarefa.' },
  { id: 105, title: 'Slides da aula 1', type: 'slide', type_label: 'Slides',
    meta_json: { url: 'https://example.invalid/slides' } },
  { id: 106, title: 'Prompt de resumo', type: 'prompt', type_label: 'Prompt',
    body_md: 'Resuma o acórdão a seguir.' },
  { id: 107, title: 'Guia rápido.pdf', type: 'drive_file', type_label: 'Drive',
    meta_json: { file_id: 'abc', folder_name: 'Aula 1', mimeType: 'application/pdf' } },
];

// Each module reaches for a small, known set of actions; anything else throws loudly rather
// than resolving to {} — a silent empty response would paint a "working" screenshot of nothing.
export function stubWorker(p) {
  if (p.action === 'ct_list_clients') return Promise.resolve({ clients: CLIENTS });
  if (p.action === 'ct_list_turmas')  return Promise.resolve({ turmas: TURMAS[p.client_slug] || [] });
  if (p.action === 'list_sessions')   return Promise.resolve({ sessions: SESSIONS });
  // Lessons
  if (p.action === 'ct_list_all_turmas') {
    const all = [];
    for (const slug of Object.keys(TURMAS)) {
      for (const t of TURMAS[slug]) all.push(Object.assign({}, t, { client_slug: slug, turma_slug: t.slug }));
    }
    return Promise.resolve({ turmas: all });
  }
  if (p.action === 'cv_get_codex_view')     return Promise.resolve({ vault: VAULT });
  if (p.action === 'cv_list_presets')       return Promise.resolve({ presets: [] });
  if (p.action === 'cp_get_live_session')   return Promise.resolve({ session: null });
  return Promise.reject(new Error('harness: unstubbed action ' + p.action));
}
