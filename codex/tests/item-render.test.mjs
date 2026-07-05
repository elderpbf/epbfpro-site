// codex/js/item-render.js — Codex-owned, type-dispatched item content renderer
// (cdx- port of the legacy CTRenderer global). It emits the SAME .ctr-* markup
// the Trail/admin CSS already styles, so the render is byte-identical; only the
// code shape changed. The pure HTML builders + type dispatch are unit-tested
// here; the DOM application (innerHTML + listeners) and the lazy marked.js path
// are verified on staging, per the project test philosophy.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// item-render resolves /r2 asset paths through the facade's assetUrl(), which reads
// window.WORKER_URL. Stub an (empty) window so assetUrl is an identity prefix here;
// the WORKER_URL-prefix behavior is locked by its own test below.
globalThis.window = globalThis.window || {};

import {
  dispatchType,
  promptHtml,
  modelInfoHtml,
  attachmentHtml,
  pdfEmbedHtml,
  paperShellHtml,
} from '../js/item-render.js';

// ── dispatch ─────────────────────────────────────────────────────────────────
test('dispatchType: maps known types, falls back to markdown', () => {
  assert.equal(dispatchType('prompt'), 'prompt');
  assert.equal(dispatchType('guide'), 'guide');
  assert.equal(dispatchType('material'), 'material');
  assert.equal(dispatchType('arquivo'), 'arquivo');
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

// ── attachment preview (image inline / PDF inline embed / else download) ─────
test('attachmentHtml: image -> <img>, pdf -> inline embed, other -> download link', () => {
  assert.match(attachmentHtml('/r2/a/pic.png'), /ctr-attachment-img.*<img src="\/r2\/a\/pic\.png"/s);
  assert.match(attachmentHtml('/r2/a/paper.pdf'), /ctr-pdf-embed.*data="\/r2\/a\/paper\.pdf"[^>]*class="ctr-pdf-object"/s);
  assert.match(attachmentHtml('/r2/a/data.zip'), /ctr-attachment-link.*ctr-dl-link.*Baixar arquivo/s);
  assert.equal(attachmentHtml(''), '');
});

test('pdfEmbedHtml: object embed with a download-link fallback inside; empty url -> ""', () => {
  const html = pdfEmbedHtml('/r2/a/doc.pdf');
  assert.match(html, /class="ctr-pdf-embed"/);
  assert.match(html, /data="\/r2\/a\/doc\.pdf"[^>]*type="application\/pdf"[^>]*class="ctr-pdf-object"/);
  assert.match(html, /ctr-dl-link.*Baixar PDF/s);
  assert.equal(pdfEmbedHtml(''), '');
});

// /r2 keys are served by the Worker, not the Pages origin: the src must be prefixed
// with WORKER_URL (via assetUrl), else the <img>/<object> load against the page host.
test('attachmentHtml/pdfEmbedHtml: /r2 paths resolve through WORKER_URL; http passes through', () => {
  const prev = window.WORKER_URL;
  window.WORKER_URL = 'https://codex-api.example';
  try {
    assert.match(attachmentHtml('/r2/a/pic.png'), /<img src="https:\/\/codex-api\.example\/r2\/a\/pic\.png"/);
    assert.match(pdfEmbedHtml('/r2/a/doc.pdf'), /data="https:\/\/codex-api\.example\/r2\/a\/doc\.pdf"/);
    // A full external url is not double-prefixed.
    assert.match(attachmentHtml('https://cdn.example/x.png'), /<img src="https:\/\/cdn\.example\/x\.png"/);
  } finally {
    window.WORKER_URL = prev;
  }
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

// The worker returns meta_json as a raw JSON STRING (SELECT * on a TEXT column);
// the builders must parse it, else every meta-driven field renders empty while the
// action button (which parses) still works — the "button opens, no preview" bug.
test('builders parse a string meta_json (not only a pre-parsed object)', () => {
  const mi = modelInfoHtml({ meta_json: '{"provider":"Anthropic","doc_url":"https://d"}' }, {});
  assert.match(mi, /ctr-badge-provider">Anthropic/);
  const paper = paperShellHtml({ meta_json: '{"pdf_url":"/r2/a/x.pdf"}' }, { preview: true });
  assert.match(paper, /data="\/r2\/a\/x\.pdf"[^>]*class="ctr-pdf-object"/);
});
