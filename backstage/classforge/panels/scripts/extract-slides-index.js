#!/usr/bin/env node
/**
 * extract-slides-index.js
 * Build tool: fetches slide titles from the Google Slides API (via gws CLI)
 * and writes them into a deck's manifest.json under the `slides` key.
 *
 * Usage:
 *   node extract-slides-index.js --presentation-id=<ID> --target=<path/to/manifest.json>
 */

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

function getArg(name) {
  const prefix = `--${name}=`;
  const match = args.find(a => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

const presentationId = getArg('presentation-id');
const target = getArg('target');

if (!presentationId || !target) {
  console.error('Usage: node extract-slides-index.js --presentation-id=<ID> --target=<path/to/manifest.json>');
  console.error('Both --presentation-id and --target are required.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Validate target manifest exists and is valid JSON
// ---------------------------------------------------------------------------

const targetPath = path.resolve(target);

if (!fs.existsSync(targetPath)) {
  console.error(`Error: target file not found: ${targetPath}`);
  process.exit(1);
}

let manifest;
try {
  const raw = fs.readFileSync(targetPath, 'utf8');
  manifest = JSON.parse(raw);
} catch (err) {
  console.error(`Error: target file is not valid JSON: ${targetPath}`);
  console.error(err.message);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Fetch presentation data via gws CLI
// ---------------------------------------------------------------------------

const fields = 'slides(objectId,pageElements(shape(placeholder(type),text(textElements(textRun(content))))))';
const cmd = `gws slides:v1 presentations get ${presentationId} --fields="${fields}"`;

let rawJson;
try {
  rawJson = execSync(cmd, { encoding: 'utf8' });
} catch (err) {
  console.error('Error: gws CLI failed with non-zero exit.');
  if (err.stderr) {
    console.error(err.stderr);
  }
  process.exit(1);
}

let presentation;
try {
  presentation = JSON.parse(rawJson);
} catch (err) {
  console.error('Error: could not parse gws CLI output as JSON.');
  console.error(err.message);
  process.exit(1);
}

if (!Array.isArray(presentation.slides)) {
  console.error('Error: parsed response has no `slides` array. Check the presentation ID and field mask.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Title extraction helpers
// ---------------------------------------------------------------------------

const TITLE_PLACEHOLDER_TYPES = new Set(['TITLE', 'CENTERED_TITLE']);

/**
 * Concatenate all textRun.content values from a shape's text.textElements,
 * then strip trailing whitespace/newlines.
 */
function extractShapeText(shape) {
  const elements = shape?.text?.textElements;
  if (!Array.isArray(elements)) return '';
  return elements
    .map(el => el?.textRun?.content ?? '')
    .join('')
    .trimEnd();
}

/**
 * Extract a title from a single slide object.
 * Priority:
 *   1. TITLE or CENTERED_TITLE placeholder shape
 *   2. First non-empty text from any shape
 *   3. Fallback: "Slide N" (1-indexed)
 */
function extractTitle(slide, index) {
  const elements = Array.isArray(slide.pageElements) ? slide.pageElements : [];

  // Priority 1: title placeholder
  for (const el of elements) {
    const shape = el?.shape;
    if (!shape) continue;
    const placeholderType = shape?.placeholder?.type;
    if (TITLE_PLACEHOLDER_TYPES.has(placeholderType)) {
      const text = extractShapeText(shape);
      if (text) return { title: text, source: 'placeholder' };
    }
  }

  // Priority 2: first non-empty text from any shape
  for (const el of elements) {
    const shape = el?.shape;
    if (!shape) continue;
    const text = extractShapeText(shape);
    if (text) return { title: text, source: 'fallback-text' };
  }

  // Priority 3: positional fallback
  return { title: `Slide ${index + 1}`, source: 'fallback-index' };
}

// ---------------------------------------------------------------------------
// Build the slides array
// ---------------------------------------------------------------------------

let titledCount = 0;
let fallbackCount = 0;

const slidesArray = presentation.slides.map((slide, index) => {
  const { title, source } = extractTitle(slide, index);
  if (source === 'fallback-index') {
    fallbackCount++;
  } else {
    titledCount++;
  }
  return { id: slide.objectId, title };
});

// ---------------------------------------------------------------------------
// Write back to manifest (all other keys untouched)
// ---------------------------------------------------------------------------

manifest.slides = slidesArray;

const output = JSON.stringify(manifest, null, 2) + '\n';
fs.writeFileSync(targetPath, output, 'utf8');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(
  `Wrote ${slidesArray.length} slides to ${targetPath}; ${titledCount} titled from Slides content, ${fallbackCount} fell back to "Slide N"`
);
