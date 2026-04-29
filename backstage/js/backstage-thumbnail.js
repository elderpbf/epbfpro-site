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

  // True when the target subtree contains any iframe whose document is opaque
  // to JS (cross-origin, sandboxed, or not yet loaded). html2canvas cannot
  // capture pixels inside such iframes and, with useCORS:true, will spend ~15s
  // per opaque iframe waiting for image timeouts before giving up. Pre-detect
  // and skip straight to screen-share so the user never sits through that.
  function _hasOpaqueIframe(target) {
    try {
      var iframes = target.getElementsByTagName('iframe');
      for (var i = 0; i < iframes.length; i++) {
        try {
          if (iframes[i].contentDocument === null) return true;
        } catch (e) {
          return true; // SecurityError reading contentDocument = cross-origin
        }
      }
    } catch (e) { /* ignore */ }
    return false;
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

  // Backstage chrome that should be invisible in the captured frame -- the
  // user clicked Atualizar Thumbnail from the settings drawer, so it is open
  // when the share starts and would otherwise be baked into the screenshot.
  var SCREEN_SHARE_HIDE = ['.bs-topbar', '#settings-drawer', '#settings-overlay'];

  function _hideElements(selectors) {
    var hidden = [];
    for (var i = 0; i < selectors.length; i++) {
      var els = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < els.length; j++) {
        var el = els[j];
        hidden.push({ el: el, prev: el.style.visibility });
        el.style.visibility = 'hidden';
      }
    }
    return hidden;
  }

  function _restoreElements(hidden) {
    for (var i = 0; i < hidden.length; i++) hidden[i].el.style.visibility = hidden[i].prev;
  }

  // Browser-native screen capture fallback. Used when html2canvas yields a
  // blank canvas (cross-origin iframe) or when we pre-detect an opaque iframe.
  // The user is prompted to share the current tab; we grab a single frame
  // and stop the stream. Backstage chrome is hidden for the frame so the
  // captured image is just the panel, not the open drawer + topbar.
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
      var hidden = _hideElements(SCREEN_SHARE_HIDE);
      try {
        // Give the compositor a few frames so the hidden state is reflected
        // in the live tab-capture stream before we grab a frame.
        await new Promise(function(r) { setTimeout(r, 120); });
        var canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 1920;
        canvas.height = video.videoHeight || 1080;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        return canvas;
      } finally {
        _restoreElements(hidden);
      }
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
    var preIframe = _hasOpaqueIframe(target);
    if (preIframe) {
      _probe('Cross-origin iframe detected; skipping html2canvas, going straight to screen share.', 'info');
    }
    try {
      var canvas;
      if (preIframe) {
        if (typeof window.showToast === 'function') {
          window.showToast('Painel com iframe. Solicitando compartilhamento de tela.');
        }
        try {
          canvas = await _captureViaScreen();
          _probe('Screen-share capture: OK (' + canvas.width + 'x' + canvas.height + ')', 'ok');
        } catch (err) {
          var msg0 = err && err.message ? err.message : String(err);
          var name0 = err && err.name ? err.name : '';
          _probe('Screen-share failed: ' + msg0, 'error');
          if (typeof window.showToastError === 'function') {
            window.showToastError(
              name0 === 'NotAllowedError'
                ? 'Compartilhamento negado. Clique de novo se quiser tentar.'
                : 'Captura via tela falhou.'
            );
          }
          _probeEnd();
          return;
        }
      } else {
        canvas = await html2canvas(target, {
          scale: 1,
          useCORS: true,
          logging: false,
          backgroundColor: bg,
          imageTimeout: 2500,
        });
        if (_isBlankCapture(canvas)) {
          _probe('html2canvas returned a uniform image. Falling back to screen share.', 'warn');
          if (typeof window.showToast === 'function') {
            window.showToast('Captura padrão em branco. Solicitando compartilhamento de tela.');
          }
          try {
            canvas = await _captureViaScreen();
            _probe('Screen-share capture: OK (' + canvas.width + 'x' + canvas.height + ')', 'ok');
          } catch (err) {
            var msg1 = err && err.message ? err.message : String(err);
            var name1 = err && err.name ? err.name : '';
            _probe('Screen-share failed: ' + msg1, 'error');
            if (typeof window.showToastError === 'function') {
              window.showToastError(
                name1 === 'NotAllowedError'
                  ? 'Compartilhamento negado. Clique de novo se quiser tentar.'
                  : 'Captura via tela falhou.'
              );
            }
            _probeEnd();
            return;
          }
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
