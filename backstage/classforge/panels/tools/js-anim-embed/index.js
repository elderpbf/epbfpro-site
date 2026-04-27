// tools/js-anim-embed/index.js
//
// Phase 3AA. js-anim-embed: a small canvas animation (bouncing colored
// circles) that proves the panel runtime can host custom JS animations
// and that mount/unmount cleans up the requestAnimationFrame loop so we
// do not leak running loops when navigating between panels. config.balls
// sets the count (default 12).

import { registerTool } from '../../engine/registry.js';

let mounted = null;

function makeBall(width, height) {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 4,
    vy: (Math.random() - 0.5) * 4,
    r: 12 + Math.random() * 24,
    hue: Math.floor(Math.random() * 360),
  };
}

registerTool({
  id: 'js-anim-embed',
  kind: 'tool',
  mount(container, config) {
    const cfg = config || {};
    const ballCount = Number.isFinite(cfg.balls) ? cfg.balls : 12;

    const root = document.createElement('div');
    root.className = 'js-anim-embed-root';

    const canvas = document.createElement('canvas');
    canvas.className = 'js-anim-embed-canvas';
    root.appendChild(canvas);
    container.appendChild(root);

    const ctx = canvas.getContext('2d');
    const balls = [];
    let raf = 0;
    let stopped = false;

    function resize() {
      const rect = root.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (balls.length === 0) {
        for (let i = 0; i < ballCount; i++) balls.push(makeBall(rect.width, rect.height));
      }
    }

    function tick() {
      if (stopped) return;
      const rect = root.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      for (const b of balls) {
        b.x += b.vx;
        b.y += b.vy;
        if (b.x - b.r < 0 || b.x + b.r > rect.width) b.vx *= -1;
        if (b.y - b.r < 0 || b.y + b.r > rect.height) b.vy *= -1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `hsl(${b.hue}, 70%, 60%)`;
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    }

    const onResize = () => resize();
    window.addEventListener('resize', onResize);

    resize();
    raf = requestAnimationFrame(tick);

    mounted = {
      root,
      stop() {
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        window.removeEventListener('resize', onResize);
      },
    };
  },
  unmount() {
    if (!mounted) return;
    mounted.stop();
    if (typeof mounted.root.remove === 'function') mounted.root.remove();
    mounted = null;
  },
});
