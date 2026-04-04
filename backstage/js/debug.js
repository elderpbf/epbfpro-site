/* =========================================================
   ClassPulse — Shared Debug Panel  v2.0
   3 tabs: Log · Errors · Probe
   ─────────────────────────────────────────────────────────
   Tab 1  Log    — explicit bsLog() / dbg() calls
                   + console.error / console.warn capture
   Tab 2  Errors — auto-captured window.onerror
                   + unhandledrejection
   Tab 3  Probe  — bsProbe() temporary calls
                   hidden until first call
                   × button clears and hides the tab
   ─────────────────────────────────────────────────────────
   Exposes globals: bsLog(msg, level)
                    dbg(type, msg)   ← same as bsLog, args flipped
                    bsProbe(msg, level)
   Safe to include on every page — panel is always available
   but collapsed by default.
   ========================================================= */

(function () {
  'use strict';

  // ── State ──────────────────────────────────────────────────────────────────
  var logEntries   = [];
  var errEntries   = [];
  var probeEntries = [];
  var activeTab    = 'log';
  var probeVisible = false;
  var mounted      = false;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function pad(n) { return String(n).padStart(2, '0'); }
  function ts() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Public API ─────────────────────────────────────────────────────────────

  function bsLog(msg, level) {
    logEntries.push({ ts: ts(), level: level || 'log', msg: String(msg) });
    if (logEntries.length > 300) logEntries.shift();
    if (mounted) { renderTab('log'); updateBadges(); }
  }

  // Reversed-arg alias so go/index.html's dbg(type, msg) keeps working
  function dbg(type, msg) {
    bsLog(String(msg), type || 'log');
  }

  function bsProbe(msg, level) {
    probeEntries.push({ ts: ts(), level: level || 'log', msg: String(msg) });
    if (probeEntries.length > 300) probeEntries.shift();
    if (!probeVisible) {
      probeVisible = true;
      if (mounted) {
        var btn = document.getElementById('bsdp-tab-probe');
        if (btn) btn.style.display = '';
      }
    }
    if (mounted) {
      if (activeTab !== 'probe') switchTab('probe');
      else renderTab('probe');
      openPanel();
      updateBadges();
    }
  }

  window.bsLog   = bsLog;
  window.dbg     = dbg;
  window.bsProbe = bsProbe;

  // ── Auto-capture ───────────────────────────────────────────────────────────

  var _cerr  = console.error.bind(console);
  var _cwarn = console.warn.bind(console);

  console.error = function () {
    _cerr.apply(console, arguments);
    bsLog(Array.from(arguments).map(String).join(' '), 'error');
  };
  console.warn = function () {
    _cwarn.apply(console, arguments);
    bsLog(Array.from(arguments).map(String).join(' '), 'warn');
  };

  window.addEventListener('error', function (e) {
    var msg = (e.message || 'Unknown error') +
              (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : '');
    errEntries.push({ ts: ts(), level: 'error', msg: msg });
    if (mounted) { renderTab('errors'); updateBadges(); }
  });

  window.addEventListener('unhandledrejection', function (e) {
    var msg = 'Unhandled: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
    errEntries.push({ ts: ts(), level: 'error', msg: msg });
    if (mounted) { renderTab('errors'); updateBadges(); }
  });

  // ── Styles ─────────────────────────────────────────────────────────────────
  var css = [
    // container + toggle button
    '#bsdp{position:fixed;bottom:1rem;right:1rem;z-index:99999;font-family:monospace;font-size:11px;display:flex;flex-direction:column;align-items:flex-end;gap:4px}',
    '#bsdp-toggle{background:#1a1a1a;color:#4f4;border:1px solid #333;border-radius:4px;padding:3px 9px;cursor:pointer;opacity:.65;font-family:monospace;font-size:11px;display:flex;align-items:center;gap:5px}',
    '#bsdp-toggle:hover{opacity:1}',
    '#bsdp-main-badge{background:#fc8181;color:#000;border-radius:8px;padding:0 4px;font-size:9px;font-weight:700;display:none;line-height:1.4}',
    '#bsdp-main-badge.vis{display:inline}',

    // panel
    '#bsdp-panel{display:none;background:rgba(12,12,12,.97);border:1px solid #2a2a2a;border-radius:8px;width:430px;max-height:320px;flex-direction:column;overflow:hidden}',
    '#bsdp-panel.open{display:flex}',

    // tab bar
    '#bsdp-tabs{display:flex;border-bottom:1px solid #222;flex-shrink:0}',
    '.bsdp-tab{background:none;border:none;border-bottom:2px solid transparent;color:#555;cursor:pointer;font-family:monospace;font-size:10px;padding:5px 11px;letter-spacing:.05em;text-transform:uppercase;display:inline-flex;align-items:center;gap:4px}',
    '.bsdp-tab:hover{color:#aaa}',
    '.bsdp-tab.active{color:#4f4;border-bottom-color:#4f4}',
    '#bsdp-tab-errors.active{color:#fc8181;border-bottom-color:#fc8181}',
    '#bsdp-tab-probe{color:#c80}',
    '#bsdp-tab-probe.active{color:#f90;border-bottom-color:#f90}',
    '.bsdp-tab-badge{background:#fc8181;color:#000;border-radius:8px;padding:0 3px;font-size:9px;font-weight:700;line-height:1.4;display:none}',
    '.bsdp-tab-badge.vis{display:inline}',
    '.bsdp-tab-x{color:#555;cursor:pointer;font-size:14px;line-height:1;padding:0 1px;margin-left:1px}',
    '.bsdp-tab-x:hover{color:#fc8181}',

    // toolbar
    '#bsdp-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:3px 8px;border-bottom:1px solid #1a1a1a;flex-shrink:0}',
    '.bsdp-tbtn{background:none;border:1px solid #333;border-radius:3px;color:#555;cursor:pointer;font-family:monospace;font-size:10px;padding:1px 7px}',
    '.bsdp-tbtn:hover{color:#ccc;border-color:#555}',

    // content areas
    '.bsdp-content{display:none;overflow-y:auto;flex:1;padding:2px 0}',
    '.bsdp-content.active{display:block}',

    // log entries
    '.bsdp-entry{display:flex;gap:6px;padding:1px 8px;border-bottom:1px solid #111;font-size:10px;line-height:1.5;word-break:break-all}',
    '.bsdp-ts{color:#3a3a3a;flex-shrink:0}',
    '.bsdp-msg{color:#bbb}',
    '.bsdp-entry.error .bsdp-msg{color:#fc8181;font-weight:bold}',
    '.bsdp-entry.warn  .bsdp-msg{color:#c80}',
    '.bsdp-entry.ok    .bsdp-msg{color:#4a4}',
    '.bsdp-entry.info  .bsdp-msg{color:#bbb}',
    '.bsdp-entry.poll  .bsdp-msg{color:#3a6080}',

    // probe empty state
    '#bsdp-empty-probe{color:#444;font-size:10px;padding:14px 10px;text-align:center;display:none}',
  ].join('');

  // ── DOM ────────────────────────────────────────────────────────────────────

  function mount() {
    if (mounted) return;
    mounted = true;

    var styleEl = document.createElement('style');
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    var pill = document.createElement('div');
    pill.id = 'bsdp';
    pill.innerHTML =
      '<div id="bsdp-panel">' +
        '<div id="bsdp-tabs">' +
          '<button class="bsdp-tab active" id="bsdp-tab-log" data-tab="log">' +
            'Log<span class="bsdp-tab-badge" id="bsdp-badge-log"></span>' +
          '</button>' +
          '<button class="bsdp-tab" id="bsdp-tab-errors" data-tab="errors">' +
            'Errors<span class="bsdp-tab-badge" id="bsdp-badge-errors"></span>' +
          '</button>' +
          '<button class="bsdp-tab" id="bsdp-tab-probe" data-tab="probe" style="display:none">' +
            'Probe<span class="bsdp-tab-badge" id="bsdp-badge-probe"></span>' +
            '<span class="bsdp-tab-x" id="bsdp-probe-x" title="Dismiss probe">&times;</span>' +
          '</button>' +
        '</div>' +
        '<div id="bsdp-toolbar">' +
          '<button class="bsdp-tbtn" id="bsdp-copy">copy</button>' +
          '<button class="bsdp-tbtn" id="bsdp-clear">clear</button>' +
        '</div>' +
        '<div class="bsdp-content active" id="bsdp-content-log"></div>' +
        '<div class="bsdp-content" id="bsdp-content-errors"></div>' +
        '<div class="bsdp-content" id="bsdp-content-probe">' +
          '<div id="bsdp-empty-probe">No probe output</div>' +
        '</div>' +
      '</div>' +
      '<button id="bsdp-toggle">DBG<span id="bsdp-main-badge"></span></button>';

    document.body.appendChild(pill);

    // toggle
    document.getElementById('bsdp-toggle').addEventListener('click', function () {
      document.getElementById('bsdp-panel').classList.toggle('open');
    });

    // tab clicks
    document.getElementById('bsdp-tabs').addEventListener('click', function (e) {
      // probe dismiss X
      if (e.target.id === 'bsdp-probe-x') { e.stopPropagation(); dismissProbe(); return; }
      var btn = e.target.closest('.bsdp-tab');
      if (btn && btn.dataset.tab) switchTab(btn.dataset.tab);
    });

    // copy
    document.getElementById('bsdp-copy').addEventListener('click', function () {
      var src = activeTab === 'log' ? logEntries : activeTab === 'errors' ? errEntries : probeEntries;
      var text = src.map(function (e) {
        return '[' + e.ts + '] [' + e.level.toUpperCase() + '] ' + e.msg;
      }).join('\n');
      navigator.clipboard.writeText(text).catch(function () {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      });
      var btn = document.getElementById('bsdp-copy');
      btn.textContent = 'ok!';
      setTimeout(function () { btn.textContent = 'copy'; }, 1200);
    });

    // clear
    document.getElementById('bsdp-clear').addEventListener('click', function () {
      if (activeTab === 'log')    { logEntries   = []; renderTab('log'); }
      if (activeTab === 'errors') { errEntries   = []; renderTab('errors'); }
      if (activeTab === 'probe')  { dismissProbe(); return; }
      updateBadges();
    });

    // restore probe tab visibility if there's already content
    if (probeVisible) {
      document.getElementById('bsdp-tab-probe').style.display = '';
    }

    renderAll();
  }

  if (document.body) { mount(); }
  else { document.addEventListener('DOMContentLoaded', mount); }

  // ── Tab management ─────────────────────────────────────────────────────────

  function switchTab(name) {
    activeTab = name;
    document.querySelectorAll('.bsdp-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.bsdp-content').forEach(function (c) {
      c.classList.toggle('active', c.id === 'bsdp-content-' + name);
    });
  }

  function openPanel() {
    var panel = document.getElementById('bsdp-panel');
    if (panel) panel.classList.add('open');
  }

  function dismissProbe() {
    probeEntries = [];
    probeVisible = false;
    var btn = document.getElementById('bsdp-tab-probe');
    if (btn) btn.style.display = 'none';
    switchTab('log');
    renderTab('probe');
    updateBadges();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  function renderTab(tab) {
    var entries = tab === 'log' ? logEntries : tab === 'errors' ? errEntries : probeEntries;
    var el = document.getElementById('bsdp-content-' + tab);
    if (!el) return;

    // probe empty state
    if (tab === 'probe') {
      var empty = document.getElementById('bsdp-empty-probe');
      if (empty) empty.style.display = entries.length === 0 ? '' : 'none';
    }

    // clear and rebuild entries
    var existing = el.querySelectorAll('.bsdp-entry');
    existing.forEach(function (n) { n.remove(); });

    entries.forEach(function (entry) {
      var div = document.createElement('div');
      div.className = 'bsdp-entry ' + entry.level;
      div.innerHTML = '<span class="bsdp-ts">' + entry.ts + '</span>' +
                      '<span class="bsdp-msg">' + esc(entry.msg) + '</span>';
      el.appendChild(div);
    });
    el.scrollTop = el.scrollHeight;
  }

  function renderAll() {
    renderTab('log');
    renderTab('errors');
    renderTab('probe');
    updateBadges();
  }

  function updateBadges() {
    var logErrs   = logEntries.filter(function (e) { return e.level === 'error'; }).length;
    var errCount  = errEntries.length;
    var probeErrs = probeEntries.filter(function (e) { return e.level === 'error'; }).length;
    setBadge('bsdp-badge-log',    logErrs);
    setBadge('bsdp-badge-errors', errCount);
    setBadge('bsdp-badge-probe',  probeErrs);
    setBadge('bsdp-main-badge',   logErrs + errCount + probeErrs);
  }

  function setBadge(id, count) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = count || '';
    el.classList.toggle('vis', count > 0);
  }

})();
