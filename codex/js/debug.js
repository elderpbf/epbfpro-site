/* =========================================================
   Codex - Debug Panel (codex-owned port of the dev pill)
   ---------------------------------------------------------
   A self-contained dev console, gated by localStorage.bs_debug === '1'
   (the shared dev flag; the topbar dev toggle calls bsDebugMount/Unmount).
   Deliberately a CLASSIC script loaded BEFORE the module boot, so the
   console and window.onerror capture is installed before anything else
   runs. Its dark monospace look is intentional (a debug console, not
   theme-bound), so it keeps hard-coded colors instead of the cdx- theme
   tokens; only the DOM prefix follows the contract (cdx-dbg-).

   3 tabs: Log (explicit bsLog/dbg + console.error/warn capture),
           Errors (window.onerror + unhandledrejection),
           Probe (bsProbe temporary calls, hidden until first use).

   Consumer contract (window globals, unchanged from the legacy pill so
   every caller keeps working): bsLog(msg, level), dbg(type, msg),
   bsProbe(msg, level), bsProbeEnd(), bsDebugMount(), bsDebugUnmount().
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
        var hdr = document.getElementById('cdx-dbg-probe-header');
        if (hdr) { hdr.textContent = header; hdr.style.display = ''; }
      }
      renderTab('probe');
      updateBadges();
    }
  }

  function bsProbeEnd() {
    probeVisible = false;
    if (mounted) {
      var hdr = document.getElementById('cdx-dbg-probe-header');
      if (hdr) { hdr.textContent = ''; hdr.style.display = 'none'; }
    }
  }

  window.bsDebugMount = function() {
    enabled = true;
    mount();
  };

  window.bsDebugUnmount = function() {
    var el = document.getElementById('cdx-dbg');
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
    '#cdx-dbg{position:fixed;bottom:1rem;right:1rem;z-index:99999;font-family:monospace;font-size:11px;display:flex;flex-direction:column;align-items:flex-end;gap:4px;pointer-events:none}',
    '#cdx-dbg-toggle{background:#0f2020;color:#2dd4bf;border:1px solid #0d4040;border-radius:4px;padding:3px 9px;cursor:pointer;opacity:.8;font-family:monospace;font-size:11px;display:flex;align-items:center;gap:5px;pointer-events:auto}',
    '#cdx-dbg-toggle:hover{opacity:1;border-color:#0d9488}',
    '#cdx-dbg-main-badge{background:#fc8181;color:#000;border-radius:8px;padding:0 4px;font-size:9px;font-weight:700;display:none;line-height:1.4}',
    '#cdx-dbg-main-badge.vis{display:inline}',

    // panel
    '#cdx-dbg-panel{display:none;background:#0f1e1e;border:1px solid #0d4040;border-radius:8px;width:430px;max-height:320px;flex-direction:column;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.6);pointer-events:auto}',
    '#cdx-dbg-panel.open{display:flex}',

    // tab bar
    '#cdx-dbg-tabs{display:flex;border-bottom:1px solid #0d4040;flex-shrink:0;background:#0a1818}',
    '.cdx-dbg-tab{background:none;border:none;border-bottom:2px solid transparent;color:#4a8080;cursor:pointer;font-family:monospace;font-size:10px;padding:6px 12px;letter-spacing:.05em;text-transform:uppercase;display:inline-flex;align-items:center;gap:4px;transition:color .15s}',
    '.cdx-dbg-tab:hover{color:#2dd4bf}',
    '.cdx-dbg-tab.active{color:#2dd4bf;border-bottom-color:#0d9488}',
    '#cdx-dbg-tab-errors.active{color:#fc8181;border-bottom-color:#fc8181}',
    '#cdx-dbg-tab-probe{color:#22d3ee}',
    '#cdx-dbg-tab-probe.active{color:#06b6d4;border-bottom-color:#06b6d4}',
    '.cdx-dbg-tab-badge{background:#fc8181;color:#000;border-radius:8px;padding:0 3px;font-size:9px;font-weight:700;line-height:1.4;display:none}',
    '.cdx-dbg-tab-badge.vis{display:inline}',

    // toolbar
    '#cdx-dbg-toolbar{display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:3px 8px;border-bottom:1px solid #0d2c2c;flex-shrink:0;background:#0a1818}',
    '.cdx-dbg-tbtn{background:none;border:1px solid #0d4040;border-radius:3px;color:#4a8080;cursor:pointer;font-family:monospace;font-size:10px;padding:1px 7px;transition:color .15s,border-color .15s}',
    '.cdx-dbg-tbtn:hover{color:#2dd4bf;border-color:#0d9488}',

    // content areas
    '.cdx-dbg-content{display:none;overflow-y:auto;flex:1;padding:2px 0}',
    '.cdx-dbg-content.active{display:block}',

    // log entries
    '.cdx-dbg-entry{display:flex;gap:6px;padding:2px 8px;border-bottom:1px solid #0a1e1e;font-size:10px;line-height:1.6;word-break:break-all}',
    '.cdx-dbg-ts{color:#1a5050;flex-shrink:0}',
    '.cdx-dbg-msg{color:#a0c4c4}',
    '.cdx-dbg-entry.error .cdx-dbg-msg{color:#fc8181;font-weight:bold}',
    '.cdx-dbg-entry.warn  .cdx-dbg-msg{color:#fbbf24}',
    '.cdx-dbg-entry.ok    .cdx-dbg-msg{color:#2dd4bf}',
    '.cdx-dbg-entry.info  .cdx-dbg-msg{color:#a0c4c4}',
    '.cdx-dbg-entry.poll  .cdx-dbg-msg{color:#2a6060}',

    // probe empty/idle state
    '#cdx-dbg-empty-probe{color:#2a5050;font-size:10px;padding:14px 10px;text-align:center}',
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
    pill.id = 'cdx-dbg';
    pill.innerHTML =
      '<div id="cdx-dbg-panel">' +
        '<div id="cdx-dbg-tabs">' +
          '<button class="cdx-dbg-tab active" id="cdx-dbg-tab-log" data-tab="log">' +
            'Log<span class="cdx-dbg-tab-badge" id="cdx-dbg-badge-log"></span>' +
          '</button>' +
          '<button class="cdx-dbg-tab" id="cdx-dbg-tab-errors" data-tab="errors">' +
            'Errors<span class="cdx-dbg-tab-badge" id="cdx-dbg-badge-errors"></span>' +
          '</button>' +
          '<button class="cdx-dbg-tab" id="cdx-dbg-tab-probe" data-tab="probe">' +
            'Probe<span class="cdx-dbg-tab-badge" id="cdx-dbg-badge-probe"></span>' +
          '</button>' +
        '</div>' +
        '<div id="cdx-dbg-toolbar">' +
          '<button class="cdx-dbg-tbtn" id="cdx-dbg-copy">copy</button>' +
          '<button class="cdx-dbg-tbtn" id="cdx-dbg-clear">clear</button>' +
        '</div>' +
        '<div class="cdx-dbg-content active" id="cdx-dbg-content-log"></div>' +
        '<div class="cdx-dbg-content" id="cdx-dbg-content-errors"></div>' +
        '<div class="cdx-dbg-content" id="cdx-dbg-content-probe">' +
          '<div id="cdx-dbg-probe-header" style="display:none;padding:4px 8px;background:#0a2828;border-bottom:1px solid #0d4040;color:#06b6d4;font-size:10px;font-weight:bold;position:sticky;top:0"></div>' +
          '<div id="cdx-dbg-empty-probe">Idle - no probe running</div>' +
        '</div>' +
      '</div>' +
      '<button id="cdx-dbg-toggle">DBG<span id="cdx-dbg-main-badge"></span></button>';

    document.body.appendChild(pill);

    // Prevent clicks on debug panel from reaching presentation engines (Panels, Reveal)
    pill.addEventListener('click', function(e) { e.stopPropagation(); });
    pill.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    pill.addEventListener('pointerdown', function(e) { e.stopPropagation(); });

    // toggle
    document.getElementById('cdx-dbg-toggle').addEventListener('click', function () {
      document.getElementById('cdx-dbg-panel').classList.toggle('open');
    });

    // tab clicks
    document.getElementById('cdx-dbg-tabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.cdx-dbg-tab');
      if (btn && btn.dataset.tab) switchTab(btn.dataset.tab);
    });

    // copy
    document.getElementById('cdx-dbg-copy').addEventListener('click', function () {
      var src = activeTab === 'log' ? logEntries : activeTab === 'errors' ? errEntries : probeEntries;
      var text = src.map(function (e) {
        return '[' + e.ts + '] [' + e.level.toUpperCase() + '] ' + e.msg;
      }).join('\n');
      navigator.clipboard.writeText(text).catch(function () {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      });
      var btn = document.getElementById('cdx-dbg-copy');
      btn.textContent = 'ok!';
      setTimeout(function () { btn.textContent = 'copy'; }, 1200);
    });

    // clear
    document.getElementById('cdx-dbg-clear').addEventListener('click', function () {
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
    document.querySelectorAll('.cdx-dbg-tab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.cdx-dbg-content').forEach(function (c) {
      c.classList.toggle('active', c.id === 'cdx-dbg-content-' + name);
    });
  }

  function openPanel() {
    var panel = document.getElementById('cdx-dbg-panel');
    if (panel) panel.classList.add('open');
  }


  // ── Render ─────────────────────────────────────────────────────────────────

  function renderTab(tab) {
    var entries = tab === 'log' ? logEntries : tab === 'errors' ? errEntries : probeEntries;
    var el = document.getElementById('cdx-dbg-content-' + tab);
    if (!el) return;

    // Capture scroll position BEFORE mutating so we know if user was pinned to bottom
    var wasAtBottom = (el.scrollHeight - el.scrollTop - el.clientHeight) < 30;

    // probe empty state
    if (tab === 'probe') {
      var empty = document.getElementById('cdx-dbg-empty-probe');
      if (empty) empty.style.display = entries.length === 0 ? '' : 'none';
    }

    // Append-only diff. We keep one DOM node per entry, identified by data-seq.
    // Removing only the nodes that left `entries` (cap-shift or clear) preserves
    // the user's text selection on every other entry.
    var present = new Set();
    entries.forEach(function (e) { present.add(e._seq); });

    var existing = el.querySelectorAll('.cdx-dbg-entry');
    existing.forEach(function (n) {
      if (!present.has(parseInt(n.dataset.seq, 10))) n.remove();
    });

    var remaining = el.querySelectorAll('.cdx-dbg-entry');
    var lastSeq = remaining.length
      ? parseInt(remaining[remaining.length - 1].dataset.seq, 10)
      : -1;

    entries.forEach(function (entry) {
      if (entry._seq <= lastSeq) return;
      var div = document.createElement('div');
      div.className = 'cdx-dbg-entry ' + entry.level;
      div.dataset.seq = entry._seq;
      div.innerHTML = '<span class="cdx-dbg-ts">' + entry.ts + '</span>' +
                      '<span class="cdx-dbg-msg">' + esc(entry.msg) + '</span>';
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
    setBadge('cdx-dbg-badge-log',    logErrs);
    setBadge('cdx-dbg-badge-errors', errCount);
    setBadge('cdx-dbg-badge-probe',  probeErrs);
    setBadge('cdx-dbg-main-badge',   logErrs + errCount + probeErrs);
  }

  function setBadge(id, count) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = count || '';
    el.classList.toggle('vis', count > 0);
  }

})();
