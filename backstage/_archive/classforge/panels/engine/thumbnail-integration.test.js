// engine/thumbnail-integration.test.js
//
// Phase 2H: validates attachThumbnail builds the Panels v2 thumbnail
// section, wires the click handler to BackstageThumbnail.capture, guards
// missing globals, and returns [] on missing options.
//
// Run: node Site/backstage/classforge/panels/engine/thumbnail-integration.test.js

import { strict as assert } from 'node:assert';

// -- helpers ---------------------------------------------------------------

function makeButton() {
  const listeners = { click: [] };
  return {
    _listeners: listeners,
    disabled: false,
    textContent: '',
    addEventListener(type, fn) { listeners[type] = listeners[type] || []; listeners[type].push(fn); },
    click() { for (const fn of listeners.click || []) fn(); },
  };
}

function installEnv({ thumbnailAvailable = true } = {}) {
  const captureCalls = [];
  const warnings = [];
  const btn = makeButton();

  globalThis.window = globalThis;
  globalThis.document = {
    _btn: btn,
    getElementById(id) { return id === 'pn-thumbnail-btn' ? btn : null; },
  };

  if (thumbnailAvailable) {
    globalThis.window.BackstageThumbnail = {
      capture(opts) { captureCalls.push(opts); },
    };
  } else {
    delete globalThis.window.BackstageThumbnail;
  }

  const origWarn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));

  // replace setTimeout to run synchronously so textContent restore is observable
  const origSetTimeout = globalThis.setTimeout;
  const timeouts = [];
  globalThis.setTimeout = (fn) => { timeouts.push(fn); return 0; };

  return {
    btn, captureCalls, warnings, timeouts,
    flushTimeouts() { for (const fn of timeouts) fn(); },
    restore() {
      console.warn = origWarn;
      globalThis.setTimeout = origSetTimeout;
    },
  };
}

function resetEnv() {
  delete globalThis.window;
  delete globalThis.document;
}

function makeRuntime() { return {}; }

// -- tests -----------------------------------------------------------------

// Test 1: returns array of length 1
{
  const env = installEnv();
  const { attachThumbnail } = await import('./thumbnail-integration.js');
  const sections = attachThumbnail(makeRuntime(), {
    slug: 'foo', title: 'Foo', engine: 'panels', targetSelector: '#pn-host',
  });
  assert.equal(Array.isArray(sections), true);
  assert.equal(sections.length, 1);
  env.restore();
  resetEnv();
  console.log('PASS  test 1: attachThumbnail returns 1 section');
}

// Test 2: section has correct id and title
{
  const env = installEnv();
  const { attachThumbnail } = await import('./thumbnail-integration.js');
  const [section] = attachThumbnail(makeRuntime(), {
    slug: 'foo', title: 'Foo', engine: 'panels',
  });
  assert.equal(section.id, 'pn-thumbnail');
  assert.equal(section.title, 'Thumbnail');
  env.restore();
  resetEnv();
  console.log('PASS  test 2: section id=pn-thumbnail, title=Thumbnail');
}

// Test 3: content contains button id, button label, and hint
{
  const env = installEnv();
  const { attachThumbnail } = await import('./thumbnail-integration.js');
  const [section] = attachThumbnail(makeRuntime(), {
    slug: 'foo', title: 'Foo', engine: 'panels',
  });
  assert.match(section.content, /id="pn-thumbnail-btn"/);
  assert.match(section.content, /Atualizar Thumbnail/);
  assert.match(section.content, /Captura o painel/);
  env.restore();
  resetEnv();
  console.log('PASS  test 3: section content has button id, label, and hint');
}

// Test 4: onInit attaches a click listener
{
  const env = installEnv();
  const { attachThumbnail } = await import('./thumbnail-integration.js');
  const [section] = attachThumbnail(makeRuntime(), {
    slug: 'foo', title: 'Foo', engine: 'panels',
  });
  section.onInit();
  assert.equal(env.btn._listeners.click.length, 1);
  env.restore();
  resetEnv();
  console.log('PASS  test 4: onInit wires one click listener on the button');
}

// Test 5: click invokes BackstageThumbnail.capture with expected opts
{
  const env = installEnv();
  const { attachThumbnail } = await import('./thumbnail-integration.js');
  const [section] = attachThumbnail(makeRuntime(), {
    slug: 'foo',
    title: 'Foo Title',
    engine: 'panels',
    targetSelector: '#pn-host',
    fallbackBg: '#aabbcc',
  });
  section.onInit();
  env.btn.click();
  assert.equal(env.captureCalls.length, 1);
  assert.deepEqual(env.captureCalls[0], {
    slug: 'foo',
    title: 'Foo Title',
    engine: 'panels',
    targetSelector: '#pn-host',
    fallbackBg: '#aabbcc',
  });
  env.restore();
  resetEnv();
  console.log('PASS  test 5: click forwards opts to BackstageThumbnail.capture');
}

// Test 6: click disables button and sets Capturando... label; timeout restores
{
  const env = installEnv();
  const { attachThumbnail } = await import('./thumbnail-integration.js');
  const [section] = attachThumbnail(makeRuntime(), {
    slug: 'foo', title: 'Foo', engine: 'panels',
  });
  section.onInit();
  env.btn.click();
  assert.equal(env.btn.disabled, true);
  assert.equal(env.btn.textContent, 'Capturando...');
  env.flushTimeouts();
  assert.equal(env.btn.disabled, false);
  assert.equal(env.btn.textContent, 'Atualizar Thumbnail');
  env.restore();
  resetEnv();
  console.log('PASS  test 6: click toggles button state; timeout restores it');
}

// Test 7: no BackstageThumbnail global -> [] + warn
{
  const env = installEnv({ thumbnailAvailable: false });
  const { attachThumbnail } = await import('./thumbnail-integration.js');
  const sections = attachThumbnail(makeRuntime(), {
    slug: 'foo', title: 'Foo', engine: 'panels',
  });
  assert.deepEqual(sections, []);
  assert.ok(env.warnings.some(w => w.includes('BackstageThumbnail unavailable')));
  env.restore();
  resetEnv();
  console.log('PASS  test 7: missing BackstageThumbnail returns [] and warns');
}

// Test 8: missing required option -> [] + warn
{
  const env = installEnv();
  const { attachThumbnail } = await import('./thumbnail-integration.js');
  const sections = attachThumbnail(makeRuntime(), { slug: 'foo', title: 'Foo' });
  assert.deepEqual(sections, []);
  assert.ok(env.warnings.some(w => w.includes('missing required option: engine')));
  env.restore();
  resetEnv();
  console.log('PASS  test 8: missing engine option returns [] and warns');
}
