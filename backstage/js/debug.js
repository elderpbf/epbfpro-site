/* =========================================================
   Backstage — Debug Pill
   Floating debug panel, toggled via bs_debug in localStorage.
   Include on any backstage page. Safe to include always —
   renders nothing if debug mode is off.
   ========================================================= */

(function () {
  'use strict';

  if (localStorage.getItem('bs_debug') !== '1') return;

  var logs = [];

  /* ---- helpers ---- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ts() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* ---- capture ---- */
  var _error = console.error.bind(console);
  var _warn  = console.warn.bind(console);

  function bsLog(msg, level) {
    logs.push({ ts: ts(), level: level || 'log', msg: String(msg) });
    renderLogs();
  }

  console.error = function () {
    _error.apply(console, arguments);
    bsLog(Array.from(arguments).map(String).join(' '), 'error');
  };
  console.warn = function () {
    _warn.apply(console, arguments);
    bsLog(Array.from(arguments).map(String).join(' '), 'warn');
  };

  window.bsLog = bsLog;

  window.addEventListener('error', function (e) {
    bsLog((e.message || 'Unknown error') + (e.filename ? ' @ ' + e.filename + ':' + e.lineno : ''), 'error');
  });
  window.addEventListener('unhandledrejection', function (e) {
    bsLog('Unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)), 'error');
  });

  /* ---- styles ---- */
  var style = document.createElement('style');
  style.textContent = [
    '#bs-debug-pill{position:fixed;bottom:1rem;right:1rem;z-index:99999;font-family:"Inter",monospace;font-size:.78rem}',
    '#bs-debug-toggle{background:rgba(20,184,166,.9);color:#fff;border:none;border-radius:20px;padding:.3rem .75rem;cursor:pointer;font-size:.72rem;font-weight:700;letter-spacing:.04em;display:flex;align-items:center;gap:.4rem;box-shadow:0 2px 8px rgba(0,0,0,.35);transition:opacity .2s;white-space:nowrap}',
    '#bs-debug-toggle:hover{opacity:.82}',
    '#bs-debug-panel{display:none;position:absolute;bottom:2.4rem;right:0;width:400px;max-height:320px;background:#0d1117;border:1px solid rgba(20,184,166,.3);border-radius:10px;box-shadow:0 4px 24px rgba(0,0,0,.6);flex-direction:column}',
    '#bs-debug-panel.open{display:flex}',
    '#bs-debug-toolbar{display:flex;align-items:center;gap:.5rem;padding:.45rem .75rem;border-bottom:1px solid rgba(20,184,166,.12);background:rgba(20,184,166,.06);border-radius:10px 10px 0 0;flex-shrink:0}',
    '#bs-debug-toolbar-label{flex:1;color:#14b8a6;font-weight:700;font-size:.7rem;letter-spacing:.06em;text-transform:uppercase}',
    '.bs-dpill-btn{background:transparent;border:1px solid rgba(20,184,166,.3);border-radius:5px;color:#14b8a6;font-size:.68rem;font-weight:600;padding:.2rem .55rem;cursor:pointer;transition:background .15s;font-family:inherit}',
    '.bs-dpill-btn:hover{background:rgba(20,184,166,.15)}',
    '#bs-debug-log{overflow-y:auto;flex:1;padding:.3rem 0}',
    '.bs-dl-entry{padding:.22rem .75rem;border-bottom:1px solid rgba(255,255,255,.03);display:flex;gap:.5rem;align-items:flex-start;line-height:1.4}',
    '.bs-dl-entry:last-child{border-bottom:none}',
    '.bs-dl-ts{color:#3d4d5c;flex-shrink:0;font-size:.68rem;padding-top:.05rem}',
    '.bs-dl-msg{color:#cdd6e0;word-break:break-all;font-size:.74rem}',
    '.bs-dl-entry.error .bs-dl-msg{color:#fc8181}',
    '.bs-dl-entry.warn  .bs-dl-msg{color:#f6c90e}',
    '.bs-dl-entry.log   .bs-dl-msg{color:#8bc4e8}',
    '#bs-debug-badge{background:rgba(239,68,68,.85);border-radius:10px;padding:.05rem .35rem;font-size:.65rem;font-weight:700;display:none;line-height:1.2}',
    '#bs-debug-badge.vis{display:inline}'
  ].join('');
  document.head.appendChild(style);

  /* ---- DOM ---- */
  var pill = document.createElement('div');
  pill.id = 'bs-debug-pill';
  pill.innerHTML =
    '<div id="bs-debug-panel">' +
      '<div id="bs-debug-toolbar">' +
        '<span id="bs-debug-toolbar-label">Debug</span>' +
        '<button class="bs-dpill-btn" id="bs-debug-copy">Copiar</button>' +
        '<button class="bs-dpill-btn" id="bs-debug-clear">Limpar</button>' +
      '</div>' +
      '<div id="bs-debug-log"></div>' +
    '</div>' +
    '<button id="bs-debug-toggle">🐛 Debug <span id="bs-debug-badge"></span></button>';

  function mount() {
    document.body.appendChild(pill);

    var panel  = document.getElementById('bs-debug-panel');
    var toggle = document.getElementById('bs-debug-toggle');

    toggle.addEventListener('click', function () {
      panel.classList.toggle('open');
    });

    document.getElementById('bs-debug-copy').addEventListener('click', function () {
      var text = logs.map(function (e) {
        return '[' + e.ts + '] [' + e.level.toUpperCase() + '] ' + e.msg;
      }).join('\n');
      navigator.clipboard.writeText(text).catch(function () {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      });
      var btn = document.getElementById('bs-debug-copy');
      btn.textContent = 'Copiado!';
      setTimeout(function () { btn.textContent = 'Copiar'; }, 1500);
    });

    document.getElementById('bs-debug-clear').addEventListener('click', function () {
      logs = [];
      renderLogs();
    });

    renderLogs();
  }

  if (document.body) { mount(); }
  else { document.addEventListener('DOMContentLoaded', mount); }

  /* ---- render ---- */
  function renderLogs() {
    var logEl   = document.getElementById('bs-debug-log');
    var badgeEl = document.getElementById('bs-debug-badge');
    if (!logEl) return;

    logEl.innerHTML = '';
    logs.forEach(function (entry) {
      var div = document.createElement('div');
      div.className = 'bs-dl-entry ' + entry.level;
      div.innerHTML = '<span class="bs-dl-ts">' + entry.ts + '</span>' +
                      '<span class="bs-dl-msg">' + esc(entry.msg) + '</span>';
      logEl.appendChild(div);
    });
    logEl.scrollTop = logEl.scrollHeight;

    if (badgeEl) {
      var errs = logs.filter(function (e) { return e.level === 'error'; }).length;
      badgeEl.textContent = errs;
      badgeEl.classList.toggle('vis', errs > 0);
    }
  }

})();
