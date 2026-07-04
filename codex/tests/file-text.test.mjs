// file-text.test.mjs — the client-side text extractor (codex/js/file-text.js). The actual
// PDF/DOCX parsing is browser-only (pdf.js / mammoth from the CDN, verified manually); this
// covers the node-testable seam: the cheap type check the creator uses to decide whether a
// picked file has text to extract (document) or falls back to metadata (image / binary).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasExtractableText } from '../js/file-text.js';

test('hasExtractableText recognises documents with text, not images/binaries', () => {
  assert.equal(hasExtractableText({ name: 'a.pdf', type: 'application/pdf' }), true);
  assert.equal(hasExtractableText({ name: 'a.docx', type: '' }), true, 'docx by extension even with no MIME');
  assert.equal(hasExtractableText({ name: 'notes.txt', type: 'text/plain' }), true);
  assert.equal(hasExtractableText({ name: 'photo.png', type: 'image/png' }), false);
  assert.equal(hasExtractableText({ name: 'bundle.zip', type: 'application/zip' }), false);
  assert.equal(hasExtractableText(null), false);
});
