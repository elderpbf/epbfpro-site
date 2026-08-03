// The REAL config shapes every live consumer of js/list-rail.js uses, in one place.
//
// Why this exists: the grouping core is being generalized to N levels (track-41, Élder
// 2026-07-17: "vai que outra sessão depois precisa ter 3 níveis ou mais... senão cada um faz
// do seu jeito"). That core is live on 10 screens, and the dangerous configs are exactly the
// ones the visual harness does NOT cover — courses' editable sections + cross-section drag,
// the flat list, the loose bucket. The CSS is untouched by that refactor, so **identical HTML
// means identical pixels**: freezing the emitted markup here is a complete gate, and cheaper
// and stricter than screenshots.
//
// Shapes are transcribed from the live call sites; keep them in sync when a consumer changes:
//   cohorts/courses.js  -> sections + editable + onMoveItem + loose bucket   (the riskiest)
//   cohorts/cohorts.js  -> sections + bands + exclusive + renderHead         (CLIENTES nav)
//   cohorts/cohorts.js  -> flat + reorder + footer + add                     (aula hub)
//   content/items.js    -> flat + emptyText fn
//   questions/sessions.js -> flat + emptyHtml + headPanel + autohide

export function makeEl() {
  let html = '';
  const listeners = {};
  return {
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    style: { setProperty() {}, removeProperty() {} },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 320, height: 600 }),
    set innerHTML(v) { html = v; },
    get innerHTML() { return html; },
    parentNode: null,
  };
}

const COURSES = [
  { id: 1, title: 'IA para Magistrados', section_id: 10 },
  { id: 2, title: 'IA para Cartórios', section_id: 10 },
  { id: 3, title: 'Curso sem seção', section_id: null },   // -> the __none loose bucket
];
const COURSE_SECS = [{ id: 10, title: 'Ativos' }, { id: 11, title: 'Arquivados' }];

const TURMAS = [
  { id: 't1', client: 'acme', name: 'Turma A' },
  { id: 't2', client: 'globex', name: 'Turma B' },
];
const CLIENTS = [
  { id: 'acme', title: 'Acme', band: 'ativo' },
  { id: 'globex', title: 'Globex', band: 'inativo' },
  { id: 'vazio', title: 'Vazio', band: 'ativo' },   // no turmas -> sections.emptyText
];
const BANDS = [{ id: 'ativo', title: 'Ativos' }, { id: 'futuro', title: 'Futuros' }, { id: 'inativo', title: 'Inativos' }];

const AULAS = [{ id: 'a1', n: 1 }, { id: 'a2', n: 2 }];

// Each shape: { name, cfg }. Deterministic — no Date, no random, no live state.
export const SHAPES = [
  {
    name: 'courses: sections + editable + onMoveItem + loose bucket',
    cfg: {
      title: 'Cursos',
      items: () => COURSES,
      getId: (c) => c.id,
      renderRow: (c) => ({ main: '<span class="x">' + c.title + '</span>' }),
      selectedId: () => 2,
      onSelect: () => {},
      add: { label: '+', title: 'Novo curso', onAdd: () => {} },
      dragHint: 'Arrastar para reordenar',
      newSectionLabel: '+ Nova seção',
      footer: () => '<details>Arquivados</details>',
      emptyText: 'Nenhum curso',
      reorder: { onReorder: () => {} },
      sections: {
        of: (c) => c.section_id,
        list: () => COURSE_SECS,
        editable: true,
        onCreate: () => {}, onRename: () => {}, onDelete: () => {}, onMoveItem: () => {},
      },
    },
  },
  {
    // Gained a real `search` in track-56 fase 4: Clientes had lost its box in the migration to
    // this rail and nobody noticed, because the filter code and the CSS stayed behind.
    name: 'cohorts CLIENTES: search + sections + bands + exclusive + renderHead + emptyText',
    cfg: {
      title: 'Clientes',
      add: { label: '+', title: 'Novo cliente', onAdd: () => {} },
      items: () => TURMAS,
      getId: (t) => t.client + '/' + t.id,
      renderRow: (t) => ({ main: '<div class="m">' + t.name + '</div>' }),
      rowClass: (t) => (t.id === 't1' ? 'cdx-ph-live' : 'cdx-ph-done is-archived'),
      selectedId: () => 'acme/t1',
      onSelect: () => {},
      search: { fields: (t) => [t.name, t.client], placeholder: 'Buscar turma, curso ou cliente' },
      emptyText: (q) => (String(q || '').trim() ? 'Nenhuma turma encontrada.' : 'Nenhum cliente'),
      sections: {
        of: (t) => t.client,
        list: () => CLIENTS,
        exclusive: true,
        openId: () => 'acme',
        onToggle: () => {},
        renderHead: (sec, count) => ({ main: '<span class="ava">A</span>' + sec.title + ' (' + count + ')', act: '<button>+</button>' }),
        emptyText: 'Nenhuma turma cadastrada.',
      },
      bands: { of: (sec) => sec.band, list: () => BANDS },
    },
  },
  {
    name: 'aula hub: flat + reorder + footer + add',
    cfg: {
      title: 'Aulas · Turma 1',
      items: () => AULAS,
      getId: (a) => a.id,
      renderRow: (a) => ({ main: '<span>' + a.n + '</span>' }),
      selectedId: () => 'a1',
      onSelect: () => {},
      add: { label: '+', title: 'Nova aula', onAdd: () => {} },
      emptyText: 'Sem aulas',
      footer: () => '<div class="outros">Outros</div>',
      reorder: { canDrag: () => true, onReorder: () => {} },
    },
  },
  {
    name: 'items: flat + emptyText fn + no head',
    cfg: {
      title: '',
      items: () => [{ id: 7, t: 'Item' }],
      getId: (it) => it.id,
      renderRow: (it) => ({ main: it.t, act: '<button>x</button>' }),
      selectedId: () => null,
      onSelect: () => {},
      emptyText: () => 'Biblioteca vazia',
    },
  },
  {
    name: 'empty: nothing at all -> emptyText',
    cfg: { items: () => [], getId: (x) => x.id, emptyText: 'Nada aqui' },
  },
  {
    name: 'empty: emptyHtml wins over emptyText',
    cfg: { items: () => [], getId: (x) => x.id, emptyText: 'ignorado', emptyHtml: () => '<div class="rich">📋</div>' },
  },
  {
    name: 'filter chips + headPanel expanded',
    cfg: {
      title: 'Sessões',
      add: { label: '+', title: 'Nova sessão', onAdd: () => {} },
      headPanel: () => '<form id="f"><input value="x"></form>',
      items: () => [{ id: 's1', n: 'S1' }],
      getId: (s) => s.id,
      renderRow: (s) => ({ main: s.n }),
      selectedId: () => 's1',
      onSelect: () => {},
      filter: { chips: [{ key: 'all', label: 'Todas', count: 3 }, { key: 'open', label: 'Abertas' }], active: () => 'all', onFilter: () => {} },
    },
  },
  {
    name: 'headPanel collapsed -> no panel element',
    cfg: {
      title: 'Sessões',
      add: { label: '+', title: 'Nova sessão', onAdd: () => {} },
      headPanel: () => '',
      items: () => [{ id: 's1', n: 'S1' }],
      getId: (s) => s.id,
      renderRow: (s) => ({ main: s.n }),
    },
  },
  {
    // content/labs.js — the first consumer of BOTH search and the (long-declared, never used)
    // filter chips. Freezing it pins the anatomy Élder chose: the search row sits between the
    // title and the chips (architecture/list-rail.md §3).
    name: 'labs: search + filter chips (chips as a function of the query)',
    cfg: {
      items: () => [{ key: 'k5', title: 'Tokens' }, { key: 'k22', title: 'Próximo Token' }],
      getId: (l) => l.key,
      renderRow: (l) => ({ main: l.title }),
      selectedId: () => 'k5',
      onSelect: () => {},
      search: { fields: (l) => [l.title, l.key], placeholder: 'Buscar lab' },
      filter: {
        chips: () => [{ key: 'all', label: 'Todos', count: 2 }, { key: 'on', label: 'Ativos', count: 2 }],
        active: () => 'all',
        onFilter: () => {},
      },
      footer: () => '<button>Arquivados (0)</button>',
    },
  },
];
