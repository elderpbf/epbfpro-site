// tools/terminal-embed/index.js
//
// xterm.js terminal panel. Two modes:
//   mode: 'scripted'  -- plays a list of action scenes (typed text, output,
//                        prompts, waits) as if a user were running the demo
//                        live. No backend; deterministic.
//   mode: 'ws'        -- (future) connects to a WebSocket-backed PTY for a
//                        real shell. Same xterm.js front-end.
//
// xterm.js is loaded lazily from jsdelivr the first time the tool mounts,
// so panels that don't use it don't pay the cost. The same xterm.js
// instance is reused across mounts within a session.
//
// Scene format (scripted mode):
//   ['p', text]   -- print text instantly (no newline). Used for prompts.
//   ['t', text]   -- type text animated, then newline (simulates a user typing)
//   ['o', text]   -- output text + newline (instant)
//   ['w', ms]     -- wait ms milliseconds
//   ['c', text]   -- comment line (rendered dimmed via ANSI escape)

import { registerTool } from '../../engine/registry.js';

const XTERM_VERSION = '5.3.0';
const FIT_VERSION = '0.8.0';
const XTERM_CSS = 'https://cdn.jsdelivr.net/npm/xterm@' + XTERM_VERSION + '/css/xterm.css';
const XTERM_JS = 'https://cdn.jsdelivr.net/npm/xterm@' + XTERM_VERSION + '/lib/xterm.min.js';
const FIT_JS = 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@' + FIT_VERSION + '/lib/xterm-addon-fit.min.js';

let xtermLoading = null;

function loadOnce(href, isCss) {
  return new Promise((resolve, reject) => {
    if (isCss) {
      if (document.querySelector('link[data-xterm-css]')) return resolve();
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.setAttribute('data-xterm-css', '');
      link.onload = () => resolve();
      link.onerror = reject;
      document.head.appendChild(link);
    } else {
      if (document.querySelector('script[data-xterm-src="' + href + '"]')) return resolve();
      const script = document.createElement('script');
      script.src = href;
      script.async = false;
      script.setAttribute('data-xterm-src', href);
      script.onload = () => resolve();
      script.onerror = reject;
      document.head.appendChild(script);
    }
  });
}

function loadXterm() {
  if (xtermLoading) return xtermLoading;
  xtermLoading = (async () => {
    await loadOnce(XTERM_CSS, true);
    await loadOnce(XTERM_JS, false);
    await loadOnce(FIT_JS, false);
  })();
  return xtermLoading;
}

async function playScript(term, scenes, controller) {
  for (const scene of scenes) {
    if (controller.cancelled) return;
    const op = scene[0];
    const arg = scene[1];
    if (op === 'p') {
      term.write(arg);
    } else if (op === 'o') {
      term.write(arg + '\r\n');
    } else if (op === 't') {
      for (const ch of String(arg)) {
        if (controller.cancelled) return;
        term.write(ch);
        await new Promise(r => setTimeout(r, 30 + Math.random() * 40));
      }
      term.write('\r\n');
    } else if (op === 'c') {
      term.write('\x1b[2m' + arg + '\x1b[0m\r\n');
    } else if (op === 'w') {
      await new Promise(r => setTimeout(r, Number(arg) || 0));
    }
  }
}

let mountedRoot = null;
let activeTerm = null;
let activeController = null;
let activeResize = null;

registerTool({
  id: 'terminal-embed',
  kind: 'tool',
  mount(container, config) {
    const cfg = config || {};
    const mode = cfg.mode || 'scripted';

    const root = document.createElement('div');
    root.className = 'terminal-embed';
    container.appendChild(root);
    mountedRoot = root;

    const msg = document.createElement('div');
    msg.className = 'terminal-embed__msg';
    msg.textContent = 'Carregando terminal...';
    root.appendChild(msg);

    const controller = { cancelled: false };
    activeController = controller;

    loadXterm().then(() => {
      if (mountedRoot !== root || controller.cancelled) return;
      msg.remove();

      const Term = window.Terminal;
      const FitAddon = window.FitAddon && window.FitAddon.FitAddon;

      const term = new Term({
        fontFamily: cfg.fontFamily || 'Fira Code, Menlo, Consolas, monospace',
        fontSize: cfg.fontSize || 16,
        cursorBlink: true,
        disableStdin: mode !== 'ws',
        convertEol: true,
        scrollback: 2000,
        theme: cfg.theme || {
          background: '#0a0e14',
          foreground: '#cdd9e5',
          cursor: '#5271fe',
          selectionBackground: 'rgba(82, 113, 254, 0.35)',
        },
      });

      const fit = FitAddon ? new FitAddon() : null;
      if (fit) term.loadAddon(fit);

      term.open(root);
      activeTerm = term;

      const doFit = () => { try { if (fit) fit.fit(); } catch (e) {} };
      requestAnimationFrame(doFit);
      setTimeout(doFit, 100);
      activeResize = doFit;
      window.addEventListener('resize', doFit);

      if (mode === 'scripted') {
        const scenes = Array.isArray(cfg.scenes) ? cfg.scenes : [];
        playScript(term, scenes, controller).catch(err => {
          console.warn('[terminal-embed]', err);
        });
      } else if (mode === 'ws') {
        term.write('\x1b[33mModo ws ainda nao implementado.\x1b[0m\r\n');
        term.write('Use mode=scripted ate que o backend PTY esteja em pe.\r\n');
      }
    }).catch(err => {
      if (mountedRoot !== root) return;
      msg.textContent = 'Erro ao carregar xterm.js: ' + (err && err.message ? err.message : err);
      msg.classList.add('terminal-embed__msg--error');
    });
  },
  unmount() {
    if (activeController) activeController.cancelled = true;
    activeController = null;
    if (activeResize) {
      window.removeEventListener('resize', activeResize);
      activeResize = null;
    }
    if (activeTerm) {
      try { activeTerm.dispose(); } catch (e) {}
      activeTerm = null;
    }
    if (mountedRoot && mountedRoot.parentNode) mountedRoot.remove();
    mountedRoot = null;
  },
});
