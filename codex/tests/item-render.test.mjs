// codex/js/item-render.js — Codex-owned, type-dispatched item content renderer
// (cdx- port of the legacy CTRenderer global). It emits the SAME .ctr-* markup
// the Trail/admin CSS already styles, so the render is byte-identical; only the
// code shape changed. The pure HTML builders + type dispatch are unit-tested
// here; the DOM application (innerHTML + listeners) and the lazy marked.js path
// are verified on staging, per the project test philosophy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dispatchType,
  promptHtml,
  modelInfoHtml,
  attachmentHtml,
  paperShellHtml,
} from '../js/item-render.js';

// ── dispatch ─────────────────────────────────────────────────────────────────
test('dispatchType: maps known types, falls back to markdown', () => {
  assert.equal(dispatchType('prompt'), 'prompt');
  assert.equal(dispatchType('guide'), 'guide');
  assert.equal(dispatchType('material'), 'material');
  assert.equal(dispatchType('paper'), 'paper');
  assert.equal(dispatchType('model_info'), 'model_info');
  assert.equal(dispatchType('google_doc'), 'google_doc');
  assert.equal(dispatchType('anything_else'), 'markdown');
  assert.equal(dispatchType(undefined), 'markdown');
});

// ── prompt (verbatim, NEVER markdown) ────────────────────────────────────────
test('promptHtml: renders body verbatim, escaped, with copy button', () => {
  const html = promptHtml({ body_md: '# not a heading & <x>' }, {});
  assert.match(html, /class="ctr-prompt-verbatim"/);
  // The hash/markdown stays literal (escaped), never parsed.
  assert.match(html, /# not a heading &amp; &lt;x&gt;/);
  assert.match(html, /class="ctr-copy-btn"/);
});

test('promptHtml: preview suppresses the copy button', () => {
  const html = promptHtml({ body_md: 'x' }, { preview: true });
  assert.ok(!/ctr-copy-btn/.test(html), 'no copy button in preview');
});

// ── model_info (no markdown, fully structural) ───────────────────────────────
test('modelInfoHtml: badges, context pill, strengths, doc link', () => {
  const html = modelInfoHtml({
    meta_json: {
      provider: 'Anthropic', model_id: 'claude', context_window: 200000,
      strengths: ['a', 'b'], doc_url: 'https://docs',
    },
  }, {});
  assert.match(html, /ctr-badge-provider">Anthropic/);
  assert.match(html, /ctr-badge-model">claude/);
  assert.match(html, /ctr-pill-context">Contexto: 200000/);
  assert.match(html, /<li>a<\/li><li>b<\/li>/);
  assert.match(html, /ctr-doc-link-btn"[^>]*>Documentação oficial/);
});

test('modelInfoHtml: preview suppresses the top affordance button only', () => {
  const html = modelInfoHtml({ meta_json: { doc_url: 'https://d' } }, { preview: true });
  assert.ok(!/ctr-affordance-btn/.test(html), 'no top affordance button in preview');
});

// ── material attachment ──────────────────────────────────────────────────────
test('attachmentHtml: image url -> <img>, other -> download link', () => {
  assert.match(attachmentHtml('/r2/a/pic.png'), /ctr-attachment-img.*<img src="\/r2\/a\/pic\.png"/s);
  assert.match(attachmentHtml('/r2/a/file.pdf'), /ctr-attachment-link.*ctr-dl-link.*Baixar arquivo/s);
  assert.equal(attachmentHtml(''), '');
});

// ── paper shell (the synchronous, markdown-free structure) ───────────────────
test('paperShellHtml: meta line, abstract, pdf embed, affordance', () => {
  const html = paperShellHtml({
    meta_json: { authors: 'Doe', year: 2024, abstract: 'sum', pdf_url: 'https://p.pdf' },
  }, {});
  assert.match(html, /ctr-paper-meta">Doe, 2024/);
  assert.match(html, /ctr-paper-abstract">sum/);
  assert.match(html, /data="https:\/\/p\.pdf"[^>]*class="ctr-pdf-object"/);
  assert.match(html, /ctr-affordance-btn"[^>]*>Baixar PDF/);
});

test('paperShellHtml: preview drops the affordance button, keeps the embed', () => {
  const html = paperShellHtml({ meta_json: { pdf_url: 'https://p.pdf' } }, { preview: true });
  assert.ok(!/ctr-affordance-btn/.test(html));
  assert.match(html, /ctr-pdf-object/);
});
