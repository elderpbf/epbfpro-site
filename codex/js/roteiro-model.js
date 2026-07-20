// js/roteiro-model.js  (shared seam — Cohorts aula sub-tab now, presenter later)
// The lesson-runbook (roteiro) model: a pure, DOM-free structure for the ordered
// blocos -> pontos conduction plan of a single aula. Shape:
//   { blocos: [ { nome, pausa?:bool, pontos: [
//       { n, rotulo, tipo, dur, chamada?, notas:[str], slideRef?:str|null }
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

export function emptyRoteiro() {
  return { blocos: [] };
}

// Coerce arbitrary stored/parsed input (object OR JSON string) into the valid
// shape. Never throws; junk input becomes an empty roteiro. Every ponto gets a
// notas:[] default so callers never null-check it.
export function normalizeRoteiro(input) {
  let obj = input;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); } catch (_) { return { blocos: [] }; }
  }
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.blocos)) return { blocos: [] };
  const blocos = [];
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
    blocos.push({
      nome: (b.nome != null && b.nome !== '') ? String(b.nome) : null,
      pausa: !!b.pausa,
      pontos,
    });
  }
  return { blocos };
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
