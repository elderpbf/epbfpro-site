'use strict';

// ============================================================
// Backstage Thumbnail Capture (shared module)
// Snapshots a DOM target via html2canvas, resizes to 800x450
// JPEG, uploads to R2 via the backstage-api worker, and registers
// the presentation in D1. Engine-neutral: caller supplies slug,
// title, engine string, and DOM target selector.
//
// Consumers:
//   classforge/viewer/index.html                      (engine: 'reveal')
//   classforge/presentations/ia-capacitacao-panels/   (engine: 'panels-legacy')
//   classforge/panels/engine/thumbnail-integration.js (Panels v2)
//
// Dependencies (window globals):
//   html2canvas                (hard; from CDN)
//   bsProbe, bsProbeEnd        (soft; from debug.js)
//   showToast, showToastError  (soft; from toast helpers)
//
// Auth: reads localStorage.getItem('bs_pw_hash').
//
// Usage:
//   BackstageThumbnail.capture({
//     slug: 'my-slug',
//     title: 'My Presentation',
//     engine: 'panels',
//     targetSelector: '#pn-host',
//     backgroundSelector: '#pn-host',  // optional
//     fallbackBg: '#ffffff',           // optional
//   });
// ============================================================

window.BackstageThumbnail = (function() {

  var WORKER_URL = 'https://backstage-api.pensoia.workers.dev';
  var R2_BASE    = WORKER_URL + '/r2/classforge/';
  var REQUIRED   = ['slug', 'title', 'engine', 'targetSelector'];

  function _probe(msg, level, title) {
    if (typeof window.bsProbe === 'function') window.bsProbe(msg, level, title);
  }
  function _probeEnd() {
    if (typeof window.bsProbeEnd === 'function') window.bsProbeEnd();
  }

  async function _workerPost(params) {
    var resp = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    return resp.json();
  }

  function _resolveBackground(selector, fallback) {
    var el = selector ? document.querySelector(selector) : null;
    if (!el) return fallback;
    var bg = getComputedStyle(el).backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') return fallback;
    return bg;
  }

  async function capture(opts) {
    opts = opts || {};
    for (var i = 0; i < REQUIRED.length; i++) {
      var k = REQUIRED[i];
      if (!opts[k]) {
        _probe('capture: missing required option ' + k, 'error', 'Thumbnail capture');
        _probeEnd();
        return;
      }
    }
    if (typeof html2canvas === 'undefined') {
      console.warn('[backstage-thumbnail] html2canvas not loaded');
      _probe('html2canvas not loaded', 'error', 'Thumbnail capture');
      _probeEnd();
      return;
    }
    var target = document.querySelector(opts.targetSelector);
    if (!target) {
      _probe('target not found: ' + opts.targetSelector, 'error', 'Thumbnail capture');
      _probeEnd();
      return;
    }
    _probe('Starting capture for slug=' + opts.slug, 'info', 'Thumbnail capture');
    var bg = _resolveBackground(
      opts.backgroundSelector || opts.targetSelector,
      opts.fallbackBg || '#ffffff'
    );
    _probe('Target: ' + target.offsetWidth + 'x' + target.offsetHeight + ', bg=' + bg, 'info');
    try {
      var canvas = await html2canvas(target, {
        scale: 1,
        useCORS: true,
        logging: false,
        backgroundColor: bg,
      });
      var resized = document.createElement('canvas');
      resized.width = 800;
      resized.height = 450;
      var ctx = resized.getContext('2d');
      ctx.drawImage(canvas, 0, 0, 800, 450);
      var dataUrl = resized.toDataURL('image/jpeg', 0.85);
      var base64 = dataUrl.split(',')[1];
      var auth = (typeof localStorage !== 'undefined' ? localStorage.getItem('bs_pw_hash') : '') || '';
      var uploadRes = await _workerPost({
        action: 'upload_image',
        auth_token: auth,
        slug: opts.slug,
        filename: 'thumbnail.jpg',
        data_base64: base64,
        content_type: 'image/jpeg',
      });
      var okUpload = uploadRes && uploadRes.ok;
      _probe('Upload: ' + (okUpload ? 'OK' : 'FAIL'), okUpload ? 'ok' : 'error');
      if (!okUpload) {
        _probeEnd();
        return;
      }
      var thumbUrl = R2_BASE + opts.slug + '/thumbnail.jpg';
      await _workerPost({
        action: 'register_presentation',
        auth_token: auth,
        slug: opts.slug,
        title: opts.title,
        engine: opts.engine,
        thumbnail: thumbUrl,
      });
      if (typeof window.showToast === 'function') window.showToast('Thumbnail atualizado.');
      _probeEnd();
    } catch (err) {
      _probe('FAILED: ' + (err && err.message ? err.message : String(err)), 'error');
      if (typeof window.showToastError === 'function') window.showToastError('Erro ao capturar thumbnail.');
      _probeEnd();
    }
  }

  return { capture: capture };

})();

if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
  module.exports = window.BackstageThumbnail;
}
