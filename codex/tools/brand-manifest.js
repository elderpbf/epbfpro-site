// codex/tools/brand-manifest.js
// The declarative list of every PensoIA brand artifact that ships as a FILE,
// plus the emitter that turns one manifest line into the exact bytes that file
// must hold. Adding a surface = adding a line here, never copying an .svg.
//
// Division of labour, so nothing has two owners:
//   js/brand-logos.js   the ARTWORK (paths, palettes, composition). Emits the lean
//                       runtime SVG string the topbar and certificates use.
//   tools/brand-manifest.js  WHERE that artwork lands on disk, and what a standalone
//                       brand FILE looks like (the doc header the runtime string
//                       does not carry, because a topbar SVG has no reader).
//
// The header lives here rather than in brand-logos.js on purpose: every runtime
// SVG the topbar renders would otherwise pay ~750 bytes for a comment nobody opens.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as logos from '../js/brand-logos.js';

// One builder per variant family, each a function of the background key. Key = the
// `<base>` half of the naming convention in PensoIA/Brand/manifest/naming.md
// (`<base>_<mods>_<render>.<ext>`).
const BUILDERS = {
  'mark': bg => logos.mark(logos.stdColors(bg)),
  'font-wordmark': bg => logos.fontWordmark(logos.stdColors(bg)),
  'glyph-wordmark': bg => logos.glyphWordmark(logos.stdColors(bg)),
  'glyph-wordmark_tag': bg => logos.glyphWordmarkTag(logos.stdColors(bg)),
  'favicon-square': logos.faviconSquare,
  'favicon-circle': logos.faviconCircle,
  'appicon': logos.appicon,
  'appicon-adaptive-circle': logos.appiconAdaptiveCircle,
  'appicon-adaptive-squircle': logos.appiconAdaptiveSquircle,
  'biz-card': logos.bizCard
};

// Variants the canonical set ships that the generator cannot build. Empty since the
// track-47 step 4.b: the five plate icons and the business card were composed by hand
// (an 8th origin the Problem table missed) and now come out of js/brand-logos.js like
// everything else. Kept as an exported empty list, not deleted, because the coverage
// report is only honest if this number is printed even when it is zero.
export const UNBUILT_VARIANTS = [];

// Why a standalone brand file carries this and a runtime string does not: the file
// is the thing someone opens, edits by hand, or copies into a deck. No '<' and no
// '&' may ever appear here - loaded through <img src> an SVG is parsed as XML and a
// bare sign is a parse error that kills the whole image (architecture/interativos.md §7).
const FILE_HEADER =
  '/* Comfortaa embutida. O wordmark e a tagline aqui sao texto, nao contorno: sem a ' +
  'fonte o navegador cai numa sans generica e a marca sai errada em qualquer aparelho ' +
  'que nao tenha Comfortaa instalada, e em contexto isolado (SVG como imagem, arquivo ' +
  'aberto offline) nao ha webfont da pagina para socorrer. Subset dos 29 caracteres que ' +
  'o artwork da marca usa, gerado de Brand/Logo/source/Comfortaa/static/Comfortaa-Regular.ttf ' +
  'e -Bold.ttf. O unicode-range e o que impede esta face de sequestrar caracteres que ela ' +
  'nao tem: fora dessa lista o navegador segue para a proxima fonte, em vez de desenhar ' +
  'quadrado vazio. NUNCA escreva sinal de menor-que nem E-comercial neste comentario: como ' +
  'imagem o SVG e lido como XML e isso quebra o arquivo. */';

// The canonical bytes of one standalone brand file. The header only goes on files that
// actually carry the font: a plate icon is pure geometry with no <text> in it, and
// explaining an embedded font that is not there would be a comment that lies.
export function emit(entry) {
  const build = BUILDERS[entry.variant];
  if (!build) throw new Error(`brand-manifest: no builder for variant "${entry.variant}"`);
  const svg = build(entry.bg);
  return svg.includes('@font-face') ? svg.replace('<style>', '<style>' + FILE_HEADER) : svg;
}

// repo keys, and how to find each one on this machine. `site` is this tree. The other
// two are separate checkouts whose location is not fixed (the clones live off-Drive, and
// the Brand project lives ON the Drive), so they resolve by convention and are
// overridable by env. A root that does not resolve is SKIPPED AND COUNTED, never
// silently dropped: a sync test that quietly checks less than it claims is worse than
// no sync test, because it reports green for files it never opened.
export const REPOS = {
  site: 'git-repos/epbfpro-site',
  backstage: 'git-repos/backstage',
  brand: 'PensoIA/Brand'
};

const SITE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Os repos irmãos são OPT-IN por env, de propósito, e não resolvidos por convenção.
// A tentação era apontar backstage para `../backstage`, e isso está errado por dois
// motivos: aquele clone é COMPARTILHADO entre sessões paralelas, então a suíte do Codex
// ficaria refém do galho em que outra pessoa deixou a árvore; e o Brand nem repo git é,
// mora na Drive, e caminho de Drive não é o mesmo em toda máquina.
//
// Consequência assumida: sem env, este teste confere só o `site` e ANUNCIA quantos
// alvos não conferiu. A varredura cross-repo deliberada é:
//   BRAND_BACKSTAGE_ROOT=... BRAND_PROJECT_ROOT=... node --test tests/brand-sync.test.mjs
// e o portão de verdade antes de publicar marca é `node tools/brand-build.mjs --check`
// com as mesmas variáveis, que é onde a checagem dos três repos pertence.
export function repoRoot(key) {
  if (key === 'site') return SITE_ROOT;
  if (key === 'backstage') return process.env.BRAND_BACKSTAGE_ROOT || null;
  if (key === 'brand') return process.env.BRAND_PROJECT_ROOT || null;
  return null;
}

export function repoReachable(key) {
  const r = repoRoot(key);
  return !!r && fs.existsSync(r);
}

// The backstage twin. It is not a copy anyone maintains: it is DERIVED from this repo's
// ES modules by a mechanical transform (see tools/brand-twin.js) and verified by the
// sync test, which is how "two generators" stops being two sources.
export const TWIN = { repo: 'backstage', path: 'js/brand-logos.js' };

export const ARTIFACTS = [
  { variant: 'mark', bg: 'white', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/mark_bg.white.svg' } ] },
  { variant: 'mark', bg: 'navy', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/mark_bg.navy.svg' } ] },
  { variant: 'mark', bg: 'teal', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/mark_bg.teal.svg' } ] },
  { variant: 'mark', bg: 'transp', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/mark_bg.transp.svg' } ] },

  { variant: 'font-wordmark', bg: 'white', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/font-wordmark_bg.white.svg' } ] },
  { variant: 'font-wordmark', bg: 'navy', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/font-wordmark_bg.navy.svg' } ] },
  { variant: 'font-wordmark', bg: 'teal', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/font-wordmark_bg.teal.svg' } ] },
  { variant: 'font-wordmark', bg: 'transp', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/font-wordmark_bg.transp.svg' } ] },

  // The Labs pair is the same artwork under a role-named filename: `logo-dark` is the
  // navy-surface lockup (white + teal), `logo-light` the white-surface one. Same bytes,
  // two names, which is exactly the duplication the manifest exists to make provable.
  { variant: 'glyph-wordmark', bg: 'navy', format: 'svg', targets: [
    { repo: 'site', path: 'images/brand/glyph-wordmark_bg.navy.svg' },
    { repo: 'site', path: 'codex/labs/assets/logo-dark.svg' },
    { repo: 'backstage', path: 'images/brand/glyph-wordmark_bg.navy.svg' },
    { repo: 'brand', path: 'Logo/without bg/glyph-wordmark_bg.navy.svg' } ] },
  { variant: 'glyph-wordmark', bg: 'white', format: 'svg', targets: [
    { repo: 'site', path: 'images/brand/glyph-wordmark_bg.white.svg' },
    { repo: 'site', path: 'codex/labs/assets/logo-light.svg' },
    { repo: 'backstage', path: 'images/brand/glyph-wordmark_bg.white.svg' },
    { repo: 'brand', path: 'Logo/without bg/glyph-wordmark_bg.white.svg' } ] },
  { variant: 'glyph-wordmark', bg: 'transp', format: 'svg', targets: [
    { repo: 'site', path: 'images/brand/glyph-wordmark_bg.transp.svg' },
    { repo: 'backstage', path: 'images/brand/glyph-wordmark_bg.transp.svg' },
    { repo: 'brand', path: 'Logo/without bg/glyph-wordmark_bg.transp.svg' } ] },
  { variant: 'glyph-wordmark', bg: 'teal', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/glyph-wordmark_bg.teal.svg' } ] },

  { variant: 'glyph-wordmark_tag', bg: 'navy', format: 'svg', targets: [
    { repo: 'site', path: 'images/brand/glyph-wordmark_tag_bg.navy.svg' },
    { repo: 'backstage', path: 'images/brand/glyph-wordmark_tag_bg.navy.svg' },
    { repo: 'brand', path: 'Logo/without bg/glyph-wordmark_tag_bg.navy.svg' } ] },
  { variant: 'glyph-wordmark_tag', bg: 'transp', format: 'svg', targets: [
    { repo: 'site', path: 'images/brand/glyph-wordmark_tag_bg.transp.svg' },
    { repo: 'backstage', path: 'images/brand/glyph-wordmark_tag_bg.transp.svg' },
    { repo: 'brand', path: 'Logo/without bg/glyph-wordmark_tag_bg.transp.svg' } ] },
  { variant: 'glyph-wordmark_tag', bg: 'white', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/glyph-wordmark_tag_bg.white.svg' } ] },
  { variant: 'glyph-wordmark_tag', bg: 'teal', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/without bg/glyph-wordmark_tag_bg.teal.svg' } ] },

  // As placas. Só existem sobre navy ou branco: uma placa é uma SUPERFÍCIE, e a marca
  // precisa de contraste contra ela, então transp e teal não fazem sentido aqui.
  { variant: 'favicon-square', bg: 'white', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/favicon-square_bg.white.svg' } ] },
  { variant: 'favicon-square', bg: 'navy', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/favicon-square_bg.navy.svg' } ] },
  { variant: 'favicon-circle', bg: 'white', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/favicon-circle_bg.white.svg' } ] },
  { variant: 'favicon-circle', bg: 'navy', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/favicon-circle_bg.navy.svg' } ] },
  { variant: 'appicon', bg: 'white', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/appicon_bg.white.svg' } ] },
  { variant: 'appicon', bg: 'navy', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/appicon_bg.navy.svg' } ] },
  { variant: 'appicon-adaptive-circle', bg: 'white', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/appicon-adaptive-circle_bg.white.svg' } ] },
  { variant: 'appicon-adaptive-circle', bg: 'navy', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/appicon-adaptive-circle_bg.navy.svg' } ] },
  { variant: 'appicon-adaptive-squircle', bg: 'white', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/appicon-adaptive-squircle_bg.white.svg' } ] },
  { variant: 'appicon-adaptive-squircle', bg: 'navy', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/appicon-adaptive-squircle_bg.navy.svg' } ] },
  { variant: 'biz-card', bg: 'white', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/biz-card_bg.white.svg' } ] },
  { variant: 'biz-card', bg: 'navy', format: 'svg', targets: [
    { repo: 'brand', path: 'Logo/with bg/biz-card_bg.navy.svg' } ] }
];

// Raster artifacts. Same manifest, no emitter yet: a PNG comes out of the same SVG
// through Chrome headless (--headless=new --screenshot), so the pipeline is one step
// longer, not one source more. Declared now so the coverage test counts them as an
// open gap instead of leaving them invisible the way they are today.
// Cada variante foi IDENTIFICADA por diff de pixel contra o arquivo que já estava em
// disco, não deduzida do nome (track-47 4.d, Chromium 149). Dois palpites caíram:
// `logo-mark` não é a marca solta, é a placa REDONDA; e `email-logo` é a variante navy,
// não a branca. O `email-logo` bateu com diff ZERO no tamanho nativo 2400x870, o que
// prova de quebra que o rasterizador original era Chromium e que ninguém recomprimiu
// o arquivo depois.
export const RASTER_ARTIFACTS = [
  { variant: 'glyph-wordmark', bg: 'navy', format: 'png', width: 1024, targets: [
    { repo: 'site', path: 'codex/content/slides/assets/logo-dark.png' } ] },
  // codex-logo.png é byte-idêntico ao logo-light.png: mais um arquivo que era cópia
  // mantida à mão e agora é o mesmo artefato com dois destinos.
  { variant: 'glyph-wordmark', bg: 'white', format: 'png', width: 1024, targets: [
    { repo: 'site', path: 'codex/content/slides/assets/logo-light.png' },
    { repo: 'site', path: 'codex/content/slides/codex-logo.png' } ] },
  { variant: 'glyph-wordmark', bg: 'teal', format: 'png', width: 1024, targets: [
    { repo: 'site', path: 'codex/content/slides/assets/logo-teal.png' } ] },
  { variant: 'favicon-circle', bg: 'white', format: 'png', width: 1024, targets: [
    { repo: 'site', path: 'codex/content/slides/assets/logo-mark.png' } ] },
  { variant: 'glyph-wordmark', bg: 'navy', format: 'png', width: 2400, targets: [
    { repo: 'site', path: 'images/brand/email-logo.png' } ] }
];

// Every in-tree SVG the sync test is allowed to find. A brand .svg under one of these
// roots that no manifest line claims is an orphan - the hand-edited copy this whole
// track exists to make impossible.
export const SITE_SVG_ROOTS = ['images/brand', 'codex/labs/assets'];
