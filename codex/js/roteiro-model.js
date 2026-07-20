// js/roteiro-model.js  (shared seam — Cohorts aula sub-tab now, presenter later)
// The lesson-runbook (roteiro) model: a pure, DOM-free structure for the ordered
// blocos -> pontos conduction plan of a single aula. Shape:
//   { blocos: [ { id, nome, pausa?:bool, pontos: [
//       { id, n, rotulo, tipo, dur, chamada?, notas:[str], slideRef?:str|null }
//   ] } ] }
// tipo in resgate|expositivo|pratica|fechamento|pausa.
//
// This is NOT the ementa (js/ementa.js, outline of WHAT to cover) and NOT the
// lesson content itself: the roteiro carries only order, time and short
// annotations to pull from while teaching, never the content. Mirrors the
// emptyEmenta/normalizeEmenta/ementaStats shape discipline so a second
// consumer (the presenter, later) gets the same tested, DOM-free logic.
//
// Lifted into js/ because it already has 2+ consumers by design: the Cohorts
// aula editor (this fatia) and the presenter's ponto<->slide pane (fatia 3).
//
// track-46 fatia 2.5: blocos/pontos carry DETERMINISTIC, stable ids (b1,b2… /
// p1,p2…), minted by normalizeRoteiro when missing, continuing from the max
// id already present (never Math.random/Date.now — see nextBlocoId/
// nextPontoId). The list-rail addresses rows by id, and a ponto's `n` is
// recomputed on every structural change (renumber), so it cannot double as an
// identity. The structural CRUD mutators below (add/rename/remove/reorder/
// move) are all PURE (never touch their input, always return a NEW roteiro)
// and TOTAL (never throw; an unknown id returns the roteiro normalized and
// otherwise untouched) — the view calls them straight from click handlers,
// where a throw would be a dead tab.

export function emptyRoteiro() {
  return { blocos: [] };
}

// Coerce arbitrary stored/parsed input (object OR JSON string) into the valid
// shape. Never throws; junk input becomes an empty roteiro. Every ponto gets a
// notas:[] default so callers never null-check it. Any bloco/ponto missing an
// id gets one minted (b1,b2… / p1,p2…, globally unique per kind), continuing
// from the highest numeric suffix already present so a partially-seeded
// roteiro never collides; an id already present is always preserved as-is.
export function normalizeRoteiro(input) {
  let obj = input;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); } catch (_) { return { blocos: [] }; }
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.blocos)) return { blocos: [] };
  const rawBlocos = [];
  for (const b of obj.blocos) {
    if (!b || typeof b !== 'object') continue;
    const pontos = [];
    if (Array.isArray(b.pontos)) {
      for (const p of b.pontos) {
        if (!p || typeof p !== 'object') continue;
        const notas = Array.isArray(p.notas)
          ? p.notas.filter((x) => x != null).map((x) => String(x))
          : [];
        pontos.push({
          id: (p.id != null && p.id !== '') ? String(p.id) : null,
          n: (p.n === null || p.n === undefined || p.n === '') ? null : Number(p.n),
          rotulo: String(p.rotulo || ''),
          tipo: String(p.tipo || 'expositivo'),
          dur: Number(p.dur) || 0,
          chamada: (p.chamada != null && p.chamada !== '') ? String(p.chamada) : '',
          notas,
          slideRef: (p.slideRef != null && p.slideRef !== '') ? String(p.slideRef) : null,
        });
      }
    }
    rawBlocos.push({
      id: (b.id != null && b.id !== '') ? String(b.id) : null,
      nome: (b.nome != null && b.nome !== '') ? String(b.nome) : null,
      pausa: !!b.pausa,
      pontos,
    });
  }
  let nextB = _maxSuffix(rawBlocos.map((b) => b.id), 'b') + 1;
  let nextP = _maxSuffix(rawBlocos.flatMap((b) => b.pontos.map((p) => p.id)), 'p') + 1;
  // Ids are scoped PER ROTEIRO: every one of them restarts at b1/p1. So an id
  // copied in from another roteiro routinely collides with one already here —
  // exactly what `promover` does (patchPonto lifts a ponto out of a curso base and
  // into an aula's roteiro, ids and all). A duplicate id is silent corruption:
  // _locate/findPonto/updatePonto/removePonto all stop at the FIRST match, so
  // editing or deleting "that ponto" would hit the wrong one, permanently (the old
  // code preserved any id present and never checked).
  //
  // normalizeRoteiro is therefore the SINGLE guardian of id uniqueness: first
  // occurrence keeps its id, any later collision is reminted. Every load and every
  // save round-trips through here, so patchPonto — and anything added later that
  // copies ids between roteiros (fatia 3's ponto->slide links) — is safe by
  // construction instead of by remembering.
  const usedB = new Set();
  const usedP = new Set();
  const takeB = (id) => (id && !usedB.has(id)) ? id : ('b' + nextB++);
  const takeP = (id) => (id && !usedP.has(id)) ? id : ('p' + nextP++);
  const blocos = rawBlocos.map((b) => ({
    id: _claim(takeB(b.id), usedB),
    nome: b.nome,
    pausa: b.pausa,
    pontos: b.pontos.map((p) => ({
      id: _claim(takeP(p.id), usedP),
      n: p.n,
      rotulo: p.rotulo,
      tipo: p.tipo,
      dur: p.dur,
      chamada: p.chamada,
      notas: p.notas,
      slideRef: p.slideRef,
    })),
  }));
  return { blocos };
}

// Record an id as taken and hand it back, so the claim and the use are one
// expression (a claim that forgot to register would let the NEXT duplicate through).
function _claim(id, used) { used.add(id); return id; }

// The highest numeric suffix already used by an id of the form `<prefix><N>`
// (0 if none) — the base nextBlocoId/nextPontoId/normalizeRoteiro count up from.
function _maxSuffix(ids, prefix) {
  let max = 0;
  const re = new RegExp('^' + prefix + '(\\d+)$');
  for (const id of ids) {
    if (typeof id !== 'string') continue;
    const m = id.match(re);
    if (m) { const n = Number(m[1]); if (n > max) max = n; }
  }
  return max;
}

// Locate a ponto by id inside an ALREADY-normalized roteiro. Internal (no
// re-normalize) counterpart to the exported findPonto below.
function _locate(r, pontoId) {
  const pid = String(pontoId);
  for (let bi = 0; bi < r.blocos.length; bi++) {
    const b = r.blocos[bi];
    for (let pi = 0; pi < b.pontos.length; pi++) {
      if (b.pontos[pi].id === pid) return { bloco: b, bi, pi };
    }
  }
  return null;
}

// Rewrite a bloco's pontos array to follow `orderedIds`; any ponto not named
// (should not happen given the contract, but never drops one) keeps its
// original relative order, appended after the named ones. Mutates `bloco` in
// place — callers always operate on an already-cloned working copy.
function _applyOrder(bloco, orderedIds) {
  const ids = Array.isArray(orderedIds) ? orderedIds.map(String) : [];
  const byId = new Map(bloco.pontos.map((p) => [p.id, p]));
  const used = new Set();
  const ordered = [];
  for (const id of ids) {
    const p = byId.get(id);
    if (p && !used.has(id)) { ordered.push(p); used.add(id); }
  }
  for (const p of bloco.pontos) { if (!used.has(p.id)) ordered.push(p); }
  bloco.pontos = ordered;
}

// The next deterministic bloco/ponto id, given what already exists. Used by
// addBloco/addPonto/addPausa AND directly by callers (e.g. the view) that need
// to know an id before committing a mutation.
export function nextBlocoId(roteiro) {
  const r = normalizeRoteiro(roteiro);
  return 'b' + (_maxSuffix(r.blocos.map((b) => b.id), 'b') + 1);
}
export function nextPontoId(roteiro) {
  const r = normalizeRoteiro(roteiro);
  return 'p' + (_maxSuffix(r.blocos.flatMap((b) => b.pontos.map((p) => p.id)), 'p') + 1);
}

// The dropdown-choosable tipos (pausa is a bloco, not a choice in the ponto editor).
export const TIPOS = ['resgate', 'expositivo', 'pratica', 'fechamento'];

// ── Structural CRUD mutators (pure, total, renumber at the end) ────────────

export function addBloco(roteiro, patch) {
  const r = normalizeRoteiro(roteiro);
  const p = patch || {};
  r.blocos.push({
    id: nextBlocoId(r),
    nome: (p.nome != null && p.nome !== '') ? String(p.nome) : null,
    pausa: !!p.pausa,
    pontos: [],
  });
  return renumber(r);
}

export function renameBloco(roteiro, blocoId, nome) {
  const r = normalizeRoteiro(roteiro);
  const bloco = r.blocos.find((b) => b.id === String(blocoId));
  if (bloco) bloco.nome = (nome != null && nome !== '') ? String(nome) : null;
  return renumber(r);
}

// Removes the bloco AND every ponto it carries (no orphan pontos survive).
export function removeBloco(roteiro, blocoId) {
  const r = normalizeRoteiro(roteiro);
  r.blocos = r.blocos.filter((b) => b.id !== String(blocoId));
  return renumber(r);
}

// Reorders blocos by `orderedIds`; an unknown id in the list is ignored, and a
// bloco missing from the list keeps its relative position, appended after the
// named ones — so a stale/partial id list never drops a bloco.
export function reorderBlocos(roteiro, orderedIds) {
  const r = normalizeRoteiro(roteiro);
  const ids = Array.isArray(orderedIds) ? orderedIds.map(String) : [];
  const byId = new Map(r.blocos.map((b) => [b.id, b]));
  const used = new Set();
  const ordered = [];
  for (const id of ids) {
    const b = byId.get(id);
    if (b && !used.has(id)) { ordered.push(b); used.add(id); }
  }
  for (const b of r.blocos) { if (!used.has(b.id)) ordered.push(b); }
  r.blocos = ordered;
  return renumber(r);
}

// Appends a new ponto at the end of `blocoId`'s pontos, with sane defaults for
// an unfinished patch (empty rótulo, tipo expositivo, dur 0, empty notas).
// Unknown blocoId: TOTAL — returns the roteiro normalized, untouched.
export function addPonto(roteiro, blocoId, patch) {
  const r = normalizeRoteiro(roteiro);
  const bloco = r.blocos.find((b) => b.id === String(blocoId));
  if (!bloco) return renumber(r);
  const p = patch || {};
  const notas = Array.isArray(p.notas) ? p.notas.filter((x) => x != null).map((x) => String(x)) : [];
  bloco.pontos.push({
    id: nextPontoId(r),
    n: null,
    rotulo: String(p.rotulo || ''),
    tipo: String(p.tipo || 'expositivo'),
    dur: Number(p.dur) || 0,
    chamada: (p.chamada != null && p.chamada !== '') ? String(p.chamada) : '',
    notas,
    slideRef: (p.slideRef != null && p.slideRef !== '') ? String(p.slideRef) : null,
  });
  return renumber(r);
}

// Applies only the fields present in `patch` (rotulo/tipo/dur/chamada/notas/
// slideRef); everything else on the ponto is preserved untouched. `id` and `n`
// are NEVER writable through the patch — they are the stability contract the
// list-rail and renumber() depend on, so a patch cannot hijack another ponto's
// id or fake a listing position. Unknown pontoId: TOTAL, roteiro untouched.
export function updatePonto(roteiro, pontoId, patch) {
  const r = normalizeRoteiro(roteiro);
  const hit = _locate(r, pontoId);
  if (!hit) return renumber(r);
  const ponto = hit.bloco.pontos[hit.pi];
  const p = patch || {};
  if (p.rotulo !== undefined) ponto.rotulo = String(p.rotulo || '');
  if (p.tipo !== undefined) ponto.tipo = String(p.tipo || 'expositivo');
  if (p.dur !== undefined) ponto.dur = Number(p.dur) || 0;
  if (p.chamada !== undefined) ponto.chamada = (p.chamada != null && p.chamada !== '') ? String(p.chamada) : '';
  if (p.notas !== undefined) ponto.notas = Array.isArray(p.notas) ? p.notas.filter((x) => x != null).map((x) => String(x)) : [];
  if (p.slideRef !== undefined) ponto.slideRef = (p.slideRef != null && p.slideRef !== '') ? String(p.slideRef) : null;
  return renumber(r);
}

// Unknown pontoId: TOTAL, roteiro untouched.
export function removePonto(roteiro, pontoId) {
  const r = normalizeRoteiro(roteiro);
  const hit = _locate(r, pontoId);
  if (!hit) return renumber(r);
  hit.bloco.pontos.splice(hit.pi, 1);
  return renumber(r);
}

// Moves the ponto to `blocoId`, then orders that bloco's pontos per
// `orderedIds` (the full desired order, moved ponto included — the view sends
// this straight from the list-rail's onMoveItem callback). Unknown pontoId or
// blocoId: TOTAL, roteiro untouched.
export function movePonto(roteiro, pontoId, blocoId, orderedIds) {
  const r = normalizeRoteiro(roteiro);
  const hit = _locate(r, pontoId);
  const target = r.blocos.find((b) => b.id === String(blocoId));
  if (!hit || !target) return renumber(r);
  const [ponto] = hit.bloco.pontos.splice(hit.pi, 1);
  target.pontos.push(ponto);
  _applyOrder(target, orderedIds);
  return renumber(r);
}

// Reorders pontos WITHIN one bloco. Unknown blocoId: TOTAL, roteiro untouched.
export function reorderPontos(roteiro, blocoId, orderedIds) {
  const r = normalizeRoteiro(roteiro);
  const bloco = r.blocos.find((b) => b.id === String(blocoId));
  if (!bloco) return renumber(r);
  _applyOrder(bloco, orderedIds);
  return renumber(r);
}

// { ponto, bloco, bi, pi } or null. Always operates on a fresh normalize, so
// the returned bloco/ponto are NOT aliases of whatever the caller passed in.
export function findPonto(roteiro, pontoId) {
  const r = normalizeRoteiro(roteiro);
  const hit = _locate(r, pontoId);
  return hit ? { ponto: r.blocos[hit.bi].pontos[hit.pi], bloco: r.blocos[hit.bi], bi: hit.bi, pi: hit.pi } : null;
}

// Renumbers n = 0..N-1 over the non-pausa pontos in listing order; a ponto of
// tipo 'pausa' always gets n:null (it is a first-class point in time, never a
// numbered conduction step). Runs at the end of every structural mutator
// above, so callers never call it directly except after a bulk operation.
export function renumber(roteiro) {
  const r = normalizeRoteiro(roteiro);
  let n = 0;
  for (const b of r.blocos) {
    for (const p of b.pontos) {
      p.n = (p.tipo === 'pausa') ? null : n++;
    }
  }
  return r;
}

// Appends a new bloco carrying exactly one ponto of tipo 'pausa' (water/
// bathroom break, mid-session) at the END of the roteiro. First-class: its
// dur counts in totalMin like any other ponto, but it never gets a number
// (renumber above) and is excluded from roteiroStats' pontos/praticas count.
export function addPausa(roteiro, patch) {
  const r = normalizeRoteiro(roteiro);
  const p = patch || {};
  const dur = Number(p.dur) || 0;
  r.blocos.push({
    id: nextBlocoId(r),
    nome: null,
    pausa: true,
    pontos: [{
      id: nextPontoId(r),
      n: null,
      rotulo: (p.rotulo != null && p.rotulo !== '') ? String(p.rotulo) : '',
      tipo: 'pausa',
      dur,
      chamada: '',
      notas: [],
      slideRef: null,
    }],
  });
  return renumber(r);
}

// Sum of every ponto's dur across every bloco, the pausa included (it is a
// first-class ponto, not an aside).
export function totalMin(roteiro) {
  const r = normalizeRoteiro(roteiro);
  let sum = 0;
  for (const b of r.blocos) for (const p of b.pontos) sum += Number(p.dur) || 0;
  return sum;
}

// Sum of a single bloco's pontos. Takes the bloco itself (not the full
// roteiro), so callers can total one bloco without normalizing the whole tree.
export function blocoMin(bloco) {
  const pontos = (bloco && Array.isArray(bloco.pontos)) ? bloco.pontos : [];
  return pontos.reduce((s, p) => s + (Number(p && p.dur) || 0), 0);
}

// pontos = numbered pontos only (the pausa has no n and is not counted as a
// conduction "point"); praticas = count of tipo:'pratica'.
export function roteiroStats(roteiro) {
  const r = normalizeRoteiro(roteiro);
  let pontos = 0;
  let praticas = 0;
  for (const b of r.blocos) {
    for (const p of b.pontos) {
      if (p.tipo === 'pausa') continue;
      pontos++;
      if (p.tipo === 'pratica') praticas++;
    }
  }
  return { pontos, praticas };
}

// Reads aula.hours (in HOURS) against the roteiro's planned time (in minutes).
// reservaMin is the healthy slack (questions, realistic-paced práticas,
// unplanned detours), never negative; estouro fires only when the roteiro
// itself overflows the aula's hours.
export function compat(roteiro, aulaHours) {
  const planejadoMin = totalMin(roteiro);
  const capMin = (Number(aulaHours) || 0) * 60;
  const reservaMin = Math.max(0, capMin - planejadoMin);
  const estouro = planejadoMin > capMin;
  return { planejadoMin, reservaMin, estouro };
}

// Format minutes as a short duration: under an hour -> "45 min"; on the hour
// -> "1h"; otherwise -> "1h30" (2-digit remainder).
export function fmtDur(min) {
  const m = Math.max(0, Math.round(Number(min) || 0));
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? (h + 'h') : (h + 'h' + String(rem).padStart(2, '0'));
}

// ── Fatia 2: promover (aula -> curso base) helpers ─────────────────────────
// Promote scope "ponto": patch ONE ponto from `source` (the aula's roteiro) into
// `target` (a curso base roteiro), leaving everything else in target untouched.
// Matched by the ponto's stable `n` first (survives target/source drifting apart
// in bloco order); falls back to the same bi/pi position when `n` is null (the
// pausa) or has no match. A ponto found nowhere in target's bloco is APPENDED to
// that bloco (never silently dropped); a target with fewer blocos than `ref.bi`
// gets a new bloco appended at the end, carrying just this ponto (best-effort
// placement, never throws, never mutates the inputs). No merge beyond this one
// field, no versioning: last write wins, matching the promote design.
export function patchPonto(target, source, ref) {
  const t = normalizeRoteiro(target);
  const s = normalizeRoteiro(source);
  const bi = ref && ref.bi;
  const pi = ref && ref.pi;
  const srcBloco = s.blocos[bi];
  const srcPonto = srcBloco && srcBloco.pontos[pi];
  if (!srcPonto) return t;
  const copy = Object.assign({}, srcPonto, { notas: srcPonto.notas.slice() });
  const bloco = t.blocos[bi];
  if (!bloco) {
    t.blocos.push({ nome: srcBloco.nome, pausa: !!srcBloco.pausa, pontos: [copy] });
    return t;
  }
  let idx = -1;
  if (copy.n != null) idx = bloco.pontos.findIndex((p) => p.n === copy.n);
  if (idx === -1 && pi < bloco.pontos.length) idx = pi;
  if (idx === -1) bloco.pontos.push(copy);
  else bloco.pontos[idx] = copy;
  return t;
}

// The next free curso base number given the ones already in use (1 if none).
// Used by the "promover > nova base" and "Cursos > + Nova base" flows.
export function nextBaseNumber(existingNumbers) {
  const nums = (Array.isArray(existingNumbers) ? existingNumbers : [])
    .map(Number).filter((n) => Number.isFinite(n));
  return nums.length ? Math.max(...nums) + 1 : 1;
}
