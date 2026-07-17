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

// The nav only reaches for these two actions; anything else throws loudly rather than
// resolving to {} — a silent empty response would paint a "working" screenshot of nothing.
export function stubWorker(p) {
  if (p.action === 'ct_list_clients') return Promise.resolve({ clients: CLIENTS });
  if (p.action === 'ct_list_turmas')  return Promise.resolve({ turmas: TURMAS[p.client_slug] || [] });
  return Promise.reject(new Error('harness: unstubbed action ' + p.action));
}
