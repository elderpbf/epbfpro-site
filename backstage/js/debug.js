/* =========================================================
   ClassPulse — Shared Debug Panel  v2.2
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
  var enabled      = localStorage.getItem('bs_debug') === '1';
  // Monotonic counter so each entry has a stable identity. renderTab uses this
  // to do an append-only DOM diff (preserves text selection across pushes).
  var _seqCounter  = 0;
  function nextSeq() { return _seqCounter++; }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function pad(n) { return String(n).padStart(2, '0'); }
  function ts() {
    var d = new Date();
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // ── Public API ─────────────────────────────────────────────────────────────

  function bsLog(msg, level) {
    logEntries.push({ ts: ts(), level: level || 'log', msg: String(msg), _seq: nextSeq() });
    if (logEntries.length > 300) logEntries.shift();
    if (mounted) { renderTab('log'); updateBadges(); }
  }

  // Reversed-arg alias so go/index.html's dbg(type, msg) keeps working
  function dbg(type, msg) {
    bsLog(String(msg), type || 'log');
  }

  function bsProbe(msg, level, header) {
    probeEntries.push({ ts: ts(), level: level || 'log', msg: String(msg), _seq: nextSeq() });
    if (probeEntries.length > 300) probeEntries.shift();
    probeVisible = true;
    if (mounted) {
      if (header) {
        var hdr = document.getElementById('bsdp-probe-header');
        if (hdr) { hdr.textContent = header; hdr.style.display = ''; }
      }
      renderTab('probe');
      updateBadges();
    }
  }

  function bsProbeEnd() {
    probeVisible = false;
    if (mounted) {
      var hdr = document.getElementById('bsdp-probe-header');
      if (hdr) { hdr.textContent = ''; hdr.style.display = 'none'; }
    }
  }

  window.bsDebugMount = function() {
    enabled = true;
    mount();
  };

  window.bsDebugUnmount = function() {
    var el = document.getElementById('bsdp');
    if (el) el.remove();
    mounted = false;
    enabled = false;
  };

  window.bsLog      = bsLog;
  window.dbg        = dbg;
  window.bsProbe    = bsProbe;
  window.bsProbeEnd = bsProbeEnd;

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
    errEntries.push({ ts: ts(), level: 'error', msg: msg, _seq: nextSeq() });
    if (mounted) { renderTab('errors'); updateBadges(); }
  });

  window.addEventListener('unhandledrejection', function (e) {
    var msg = 'Unhandled: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason));
    errEntries.push({ ts: ts(), level: 'error', msg: msg, _seq: nextSeq() });
    if (mounted) { renderTab('errors'); updateBadges(); }
  });

  // ── Styles ─────────────────────────────────────────────────────────────────
  var css = [
    // container + toggle button
    '#bsdp{position:fixed;bottom:1rem;right:1rem;z-index:99999;font-family:monospace;font-size:11px;display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:none}',
    '#bsdp-toggle{background:#0f2020;color:#2dd4bf;border:1px solid #0d4040;border-radius:4px;padding:3px 9px;cursor:pointer;opacity:.8;font-family:monospace;font-size:11px;display:flex;align-items:center;gap:5px;pointer-events:auto}',
    '#bsdp-toggle:hover{opacity:1;border-color:#0d9488}',
    '#bsdp-main-badge{background:#fc8181;color:#000;border-radius:8px;padding:0 4px;font-size:9px;font-weight:700;display:none;line-height:1.4}',
    '#bsdp-main-badge.vis{display:inline}',

    // panel
    '#bsdp-panel{display:none;background:#0f1e1e;border:1px solid #0d4040;border-radius:8px;width:430px;max-height:320px;flex-direction:column;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.6);pointer-events:auto}',
    '#bsdp-panel.open{display:flex}',

    // tab bar
    '#bsdp-tabs{display:flex;border-bottom:1px solid #0d4040;flex-shrink:0;background:#0a1818}',
    '.bsdp-tab{background:none;border:none;border-bottom:2px solid transparent;color:#4a8080;cursor:pointer;font-family:monospace;font-size:10px;padding:6px 12px;letter-spacing:.05em;text-transform:uppercase;display:inline-flex;align-items:center;gap:4px;transition:color .15s}',
    '.bsdp-tab:hover{color:#2dd4bf}',
    '.bsdp-tab.active{color:#2dd4bf;border-bottom-color:#0d9488}',
    '#bsdp-tab-errors.active{color:#fc8181;border-bottom-color:#fc8181}',
    '#bsdp-tab-probe{color:#22d3ee}',
    '#bsdp-tab-probe.active{color:#06b6d4;border-bottom-color:#06b6d4}',
    '.bsdp-tab-badge{background:#fc8181;color:#000;border-radius:8px;padding:0 3px;font-size:9px;font-weight:700;line-height:1.4;display:none}',
    '.bsdp-tab-badge.vis{display:inline}',

    // toolbar
    '#bsdp-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:3px 8px;border-bottom:1px solid #0d2c2c;flex-shrink:0;background:#0a1818}',
    '.bsdp-tbtn{background:none;border:1px solid #0d4040;border-radius:3px;color:#4a8080;cursor:pointer;font-family:monospace;font-size:10px;padding:1px 7px;transition:color .15s,border-color .15s}',
    '.bsdp-tbtn:hover{color:#2dd4bf;border-color:#0d9488}',

    // content areas
    '.bsdp-content{display:none;overflow-y:auto;flex:1;padding:2px 0}',
    '.bsdp-content.active{display:block}',

    // log entries
    '.bsdp-entry{display:flex;gap:6px;padding:2px 8px;border-bottom:1px solid #0a1e1e;font-size:10px;line-height:1.6;word-break:break-all}',
    '.bsdp-ts{color:#1a5050;flex-shrink:0}',
    '.bsdp-msg{color:#a0c4c4}',
    '.bsdp-entry.error .bsdp-msg{color:#fc8181;font-weight:bold}',
    '.bsdp-entry.warn  .bsdp-msg{color:#fbbf24}',
    '.bsdp-entry.ok    .bsdp-msg{color:#2dd4bf}',
    '.bsdp-entry.info  .bsdp-msg{color:#a0c4c4}',
    '.bsdp-entry.poll  .bsdp-msg{color:#2a6060}',

    // probe empty/idle state
    '#bsdp-empty-probe{color:#2a5050;font-size:10px;padding:14px 10px;text-align:center}',
  ].join('');

  // ── DOM ────────────────────────────────────────────────────────────────────

  function mount() {
    if (mounted) return;
    if (!enabled) return;
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
          '<button class="bsdp-tab" id="bsdp-tab-probe" data-tab="probe">' +
            'Probe<span class="bsdp-tab-badge" id="bsdp-badge-probe"></span>' +
          '</button>' +
        '</div>' +
        '<div id="bsdp-toolbar">' +
          '<button class="bsdp-tbtn" id="bsdp-copy">copy</button>' +
          '<button class="bsdp-tbtn" id="bsdp-clear">clear</button>' +
        '</div>' +
        '<div class="bsdp-content active" id="bsdp-content-log"></div>' +
        '<div class="bsdp-content" id="bsdp-content-errors"></div>' +
        '<div class="bsdp-content" id="bsdp-content-probe">' +
          '<div id="bsdp-probe-header" style="display:none;padding:4px 8px;background:#0a2828;border-bottom:1px solid #0d4040;color:#06b6d4;font-size:10px;font-weight:bold;position:sticky;top:0"></div>' +
          '<div id="bsdp-empty-probe">Idle - no probe running</div>' +
        '</div>' +
      '</div>' +
      '<button id="bsdp-toggle">DBG<span id="bsdp-main-badge"></span></button>';

    document.body.appendChild(pill);

    // Prevent clicks on debug panel from reaching presentation engines (Panels, Reveal)
    pill.addEventListener('click', function(e) { e.stopPropagation(); });
    pill.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    pill.addEventListener('pointerdown', function(e) { e.stopPropagation(); });

    // toggle
    document.getElementById('bsdp-toggle').addEventListener('click', function () {
      document.getElementById('bsdp-panel').classList.toggle('open');
    });

    // tab clicks
    document.getElementById('bsdp-tabs').addEventListener('click', function (e) {
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
      if (activeTab === 'probe')  { probeEntries = []; renderTab('probe'); bsProbeEnd(); }
      updateBadges();
    });

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


  // ── Render ─────────────────────────────────────────────────────────────────

  function renderTab(tab) {
    var entries = tab === 'log' ? logEntries : tab === 'errors' ? errEntries : probeEntries;
    var el = document.getElementById('bsdp-content-' + tab);
    if (!el) return;

    // Capture scroll position BEFORE mutating so we know if user was pinned to bottom
    var wasAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 30;

    // probe empty state
    if (tab === 'probe') {
      var empty = document.getElementById('bsdp-empty-probe');
      if (empty) empty.style.display = entries.length === 0 ? '' : 'none';
    }

    // Append-only diff. We keep one DOM node per entry, identified by data-seq.
    // Removing only the nodes that left `entries` (cap-shift or clear) preserves
    // the user's text selection on every other entry.
    var present = new Set();
    entries.forEach(function (e) { present.add(e._seq); });

    var existing = el.querySelectorAll('.bsdp-entry');
    existing.forEach(function (n) {
      if (!present.has(parseInt(n.dataset.seq, 10))) n.remove();
    });

    var remaining = el.querySelectorAll('.bsdp-entry');
    var lastSeq = remaining.length
      ? parseInt(remaining[remaining.length - 1].dataset.seq, 10)
      : -1;

    entries.forEach(function (entry) {
      if (entry._seq <= lastSeq) return;
      var div = document.createElement('div');
      div.className = 'bsdp-entry ' + entry.level;
      div.dataset.seq = entry._seq;
      div.innerHTML = '<span class="bsdp-ts">' + entry.ts + '</span>' +
                      '<span class="bsdp-msg">' + esc(entry.msg) + '</span>';
      el.appendChild(div);
    });

    // Only auto-scroll if user was already at (or near) the bottom
    if (wasAtBottom) el.scrollTop = el.scrollHeight;
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
    var probeErrs = probeEntries.length;
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
