import * as React from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * Fondo de PARTÍCULAS en canvas-2D (sin WebGL): puntos navy con ~18 % de
 * destellos oro, flotando lento, con líneas tenues entre los cercanos (estilo
 * blueprint). Denso y visible pero detrás de todo (`-z-10`). Consciente del tema,
 * más ligero en móvil (menos partículas, sin líneas), se apaga con
 * `prefers-reduced-motion` y se pausa con la pestaña oculta.
 */
export function AnimatedBackground() {
  const reduce = useReducedMotion();
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    if (reduce) return; // sin movimiento → queda solo la malla del body
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mobile = window.matchMedia('(max-width: 768px)').matches;

    const GOLD = '255, 198, 0';
    const BLUE = '90, 150, 230';
    const linkDist = mobile ? 0 : 115; // sin líneas en móvil

    type P = { x: number; y: number; vx: number; vy: number; r: number; gold: boolean };
    let parts: P[] = [];
    let w = 0;
    let h = 0;
    let raf = 0;

    const build = () => {
      const perPx = mobile ? 18000 : 14000; // 1 partícula por ~N px²
      const count = Math.min(mobile ? 42 : 105, Math.floor((w * h) / perPx));
      parts = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.28,
        vy: (Math.random() - 0.5) * 0.28,
        r: Math.random() * 1.6 + 0.6,
        gold: Math.random() < 0.18,
      }));
    };

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    };

    const draw = () => {
      const dark = document.documentElement.classList.contains('dark');
      const dotA = dark ? 0.55 : 0.3;
      const lineA = dark ? 0.11 : 0.07;
      ctx.clearRect(0, 0, w, h);

      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
      }

      if (linkDist > 0) {
        for (let i = 0; i < parts.length; i++) {
          for (let j = i + 1; j < parts.length; j++) {
            const a = parts[i];
            const b = parts[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < linkDist * linkDist) {
              const t = 1 - Math.sqrt(d2) / linkDist;
              ctx.strokeStyle = `rgba(${BLUE}, ${lineA * t})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }

      for (const p of parts) {
        ctx.fillStyle = `rgba(${p.gold ? GOLD : BLUE}, ${dotA})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const onVisibility = () => (document.hidden ? stop() : start());

    resize();
    start();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [reduce]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
