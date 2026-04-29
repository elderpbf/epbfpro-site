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

  // True when the canvas has essentially zero pixel-color variance, which is
  // what html2canvas produces for cross-origin iframes (Slides, embedded video):
  // it cannot read the iframe's pixels, so the area paints as the fallback bg
  // and the entire central region comes back uniform. Real panels (even mostly
  // monochrome ones with text or an image) have far more variance than the
  // threshold below.
  function _isBlankCapture(canvas) {
    try {
      var ctx = canvas.getContext('2d');
      var w = canvas.width, h = canvas.height;
      var sx = Math.floor(w * 0.2), sy = Math.floor(h * 0.2);
      var sw = Math.floor(w * 0.6), sh = Math.floor(h * 0.6);
      if (sw < 4 || sh < 4) return false;
      var data = ctx.getImageData(sx, sy, sw, sh).data;
      var r0 = data[0], g0 = data[1], b0 = data[2];
      var maxDiff = 0;
      for (var i = 0; i < data.length; i += 400) {
        var d = Math.abs(data[i] - r0) + Math.abs(data[i+1] - g0) + Math.abs(data[i+2] - b0);
        if (d > maxDiff) maxDiff = d;
      }
      return maxDiff < 12;
    } catch (err) {
      return false;
    }
  }

  // Browser-native screen capture fallback. Used when html2canvas yields a
  // blank canvas (cross-origin iframe). The user is prompted to share the
  // current tab; we grab a single frame and stop the stream.
  async function _captureViaScreen() {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      throw new Error('getDisplayMedia not supported in this browser');
    }
    var stream = await navigator.mediaDevices.getDisplayMedia({
      video: { displaySurface: 'browser' },
      preferCurrentTab: true,
      audio: false,
    });
    try {
      var video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await new Promise(function(resolve, reject) {
        video.onloadedmetadata = function() { video.play().then(resolve, reject); };
        video.onerror = reject;
      });
      await new Promise(requestAnimationFrame);
      var canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 1920;
      canvas.height = video.videoHeight || 1080;
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas;
    } finally {
      stream.getTracks().forEach(function(t) { t.stop(); });
    }
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
      if (_isBlankCapture(canvas)) {
        _probe('html2canvas returned a uniform image (likely a cross-origin iframe).', 'warn');
        var ok = window.confirm(
          'A captura padrão ficou em branco (provavelmente um iframe). ' +
          'Capturar via compartilhamento de tela? ' +
          'O navegador pedirá permissão; selecione esta aba e clique em Compartilhar.'
        );
        if (!ok) {
          _probe('User declined screen-share fallback. Aborting.', 'info');
          _probeEnd();
          return;
        }
        try {
          canvas = await _captureViaScreen();
          _probe('Screen-share capture: OK (' + canvas.width + 'x' + canvas.height + ')', 'ok');
        } catch (err) {
          _probe('Screen-share failed: ' + (err && err.message ? err.message : String(err)), 'error');
          if (typeof window.showToastError === 'function') window.showToastError('Captura via tela falhou.');
          _probeEnd();
          return;
        }
      }
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
