// codex/js/brand-manifest.js
// The declarative list of every PensoIA brand artifact that ships as a FILE,
// plus the emitter that turns one manifest line into the exact bytes that file
// must hold. Adding a surface = adding a line here, never copying an .svg.
//
// Division of labour, so nothing has two owners:
//   js/brand-logos.js   the ARTWORK (paths, palettes, composition). Emits the lean
//                       runtime SVG string the topbar and certificates use.
//   js/brand-manifest.js  WHERE that artwork lands on disk, and what a standalone
//                       brand FILE looks like (the doc header the runtime string
//                       does not carry, because a topbar SVG has no reader).
//
// The header lives here rather than in brand-logos.js on purpose: every runtime
// SVG the topbar renders would otherwise pay ~750 bytes for a comment nobody opens.

import * as logos from './brand-logos.js';

// One builder per variant family. Key = the `<base>` half of the naming convention
// in PensoIA/Brand/manifest/naming.md (`<base>_<mods>_<render>.<ext>`).
const BUILDERS = {
  'mark': logos.mark,
  'font-wordmark': logos.fontWordmark,
  'glyph-wordmark': logos.glyphWordmark,
  'glyph-wordmark_tag': logos.glyphWordmarkTag
};

// Variants the canonical set ships but the generator does NOT build. Their
// composition currently lives in the inline <script> of the backstage mock
// `mocks/brand/brand-book.html`, which is an 8th origin the Problem table missed.
// Listed so the coverage test can name the gap instead of silently omitting it.
export const UNBUILT_VARIANTS = [
  'favicon-square', 'favicon-circle', 'appicon',
  'appicon-adaptive-circle', 'appicon-adaptive-squircle', 'biz-card'
];

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

// The canonical bytes of one standalone brand file.
export function emit(entry) {
  const build = BUILDERS[entry.variant];
  if (!build) throw new Error(`brand-manifest: no builder for variant "${entry.variant}"`);
  const svg = build(logos.stdColors(entry.bg));
  return svg.replace('<style>', '<style>' + FILE_HEADER);
}

// repo keys. Only `site` is reachable from this tree; the others are declared so the
// sync test can COUNT what it cannot check rather than pretend full coverage.
export const REPOS = {
  site: 'git-repos/epbfpro-site',
  backstage: 'git-repos/backstage',
  brand: 'PensoIA/Brand'
};

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
    { repo: 'brand', path: 'Logo/without bg/glyph-wordmark_tag_bg.teal.svg' } ] }
];

// Raster artifacts. Same manifest, no emitter yet: a PNG comes out of the same SVG
// through Chrome headless (--headless=new --screenshot), so the pipeline is one step
// longer, not one source more. Declared now so the coverage test counts them as an
// open gap instead of leaving them invisible the way they are today.
export const RASTER_ARTIFACTS = [
  { variant: 'glyph-wordmark', bg: 'navy', format: 'png', targets: [
    { repo: 'site', path: 'codex/content/slides/assets/logo-dark.png' } ] },
  { variant: 'glyph-wordmark', bg: 'white', format: 'png', targets: [
    { repo: 'site', path: 'codex/content/slides/assets/logo-light.png' } ] },
  { variant: 'mark', bg: 'transp', format: 'png', targets: [
    { repo: 'site', path: 'codex/content/slides/assets/logo-mark.png' } ] },
  { variant: 'glyph-wordmark', bg: 'teal', format: 'png', targets: [
    { repo: 'site', path: 'codex/content/slides/assets/logo-teal.png' } ] },
  { variant: 'glyph-wordmark', bg: 'white', format: 'png', targets: [
    { repo: 'site', path: 'images/brand/email-logo.png' } ] }
];

// Every in-tree SVG the sync test is allowed to find. A brand .svg under one of these
// roots that no manifest line claims is an orphan - the hand-edited copy this whole
// track exists to make impossible.
export const SITE_SVG_ROOTS = ['images/brand', 'codex/labs/assets'];
