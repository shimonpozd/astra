import React, { useEffect, useMemo, useRef } from "react";

/**
 * Параметры "космоса".
 */
type StarfieldProps = {
  className?: string;
  density?: number;
  drift?: { near: number; mid: number; far: number };
  twinkleAmplitude?: number;
  twinkleFreq?: { near: number; mid: number; far: number };
  maxRadius?: { near: number; mid: number; far: number };
  colors?: {
    near: string[];
    mid: string[];
    far: string[];
  };
  mouseParallax?: boolean;
  showConnections?: boolean;
  connectionDistance?: number;
  showNebulae?: boolean;
  theme?: 'dark' | 'light';
};

type Star = {
  x: number;
  y: number;
  r: number;
  c: string;
  phase: number;
};

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function generateStars(
  w: number,
  h: number,
  count: number,
  maxR: number,
  palette: string[],
  rng: () => number
): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = Math.max(0.3, rng() * maxR);
    const c = palette[Math.floor(rng() * palette.length)];
    const phase = rng() * Math.PI * 2;
    stars.push({ x, y, r, c, phase });
  }
  return stars;
}

function makeRng(seed = 1337) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const StarfieldBackground: React.FC<StarfieldProps> = ({
  className = "",
  density = 80.0,
  drift = { near: -10, mid: -5, far: -2 },
  twinkleAmplitude = 0.35,
  twinkleFreq = { near: 2.0, mid: 4.0, far: 7.0 },
  maxRadius = { near: 1.8, mid: 1.3, far: 1.0 },
  colors,
  mouseParallax = true,
  showConnections = true,
  connectionDistance = 150,
  showNebulae = true,
  theme = 'dark',
}) => {
  const defaultColors = theme === 'dark' ? {
    near: ["255,240,220", "255,230,200", "245,220,180", "255,255,255"],
    mid: ["220,200,180", "230,210,190", "240,220,200"],
    far: ["200,180,160", "210,190,170", "220,200,180"],
  } : {
    near: ["220,200,180", "230,210,190", "240,220,200"],
    mid: ["200,180,160", "210,190,170", "220,200,180"],
    far: ["180,160,140", "190,170,150", "200,180,160"],
  };

  const finalColors = colors || defaultColors;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>();
  const dpiRef = useRef<number>(1);
  const starsRef = useRef<{ near: Star[]; mid: Star[]; far: Star[] } | null>(null);
  const driftPhaseRef = useRef<{ near: number; mid: number; far: number }>({ near: 0, mid: 0, far: 0 });
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });

  const backdrop = useMemo(
    () => {
      const isDark = theme === 'dark';
  
      if (!showNebulae) {
        return (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background: isDark
                ? "radial-gradient(circle at 50% 50%, rgba(42,36,31,0.98), rgba(44,38,33,1))"
                : "radial-gradient(circle at 50% 50%, rgba(250,248,245,0.95), rgba(240,238,230,1))",
            }}
          />
        );
      }
  
      return (
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: isDark
              ? [
                  "radial-gradient(circle at 50% 50%, rgba(42,36,31,0.98), rgba(44,38,33,1))",
                  "radial-gradient(ellipse 800px 600px at 20% 30%, rgba(194,169,112,0.18), transparent 70%)",
                  "radial-gradient(ellipse 700px 500px at 75% 25%, rgba(194,169,112,0.15), transparent 65%)",
                  "radial-gradient(ellipse 900px 700px at 50% 70%, rgba(194,169,112,0.12), transparent 60%)",
                  "radial-gradient(ellipse 600px 400px at 85% 60%, rgba(194,169,112,0.10), transparent 55%)",
                  "radial-gradient(ellipse 500px 350px at 10% 80%, rgba(194,169,112,0.14), transparent 50%)"
                ].join(",")
              : [
                  "radial-gradient(circle at 50% 50%, rgba(250,248,245,0.95), rgba(240,238,230,1))",
                  "radial-gradient(ellipse 800px 600px at 20% 30%, rgba(194,169,112,0.22), transparent 70%)",
                  "radial-gradient(ellipse 700px 500px at 75% 25%, rgba(194,169,112,0.20), transparent 65%)",
                  "radial-gradient(ellipse 900px 700px at 50% 70%, rgba(194,169,112,0.16), transparent 60%)",
                  "radial-gradient(ellipse 600px 400px at 85% 60%, rgba(194,169,112,0.14), transparent 55%)",
                  "radial-gradient(ellipse 500px 350px at 10% 80%, rgba(194,169,112,0.18), transparent 50%)"
                ].join(","),
            mixBlendMode: isDark ? "screen" : "multiply",
          }}
        />
      );
    },
    [theme, showNebulae]
  );
  

  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    if (!ctx) return;

    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();
      const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
      dpiRef.current = dpr;

      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${Math.floor(width)}px`;
      canvas.style.height = `${Math.floor(height)}px`;

      const area = (canvas.width * canvas.height) / (dpr * dpr);
      const total = Math.floor((density / 100000) * area);
      const farCount = Math.floor(total * 0.5);
      const midCount = Math.floor(total * 0.35);
      const nearCount = Math.max(1, total - farCount - midCount);

      const rng = makeRng(42);
      const gen = (count: number, maxR: number, palette: string[]) =>
        generateStars(canvas.width, canvas.height, count, maxR * dpr, palette, rng);

      starsRef.current = {
        far: gen(farCount, maxRadius.far, finalColors.far),
        mid: gen(midCount, maxRadius.mid, finalColors.mid),
        near: gen(nearCount, maxRadius.near, finalColors.near),
      };
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [density, maxRadius.far, maxRadius.mid, maxRadius.near, finalColors.far, finalColors.mid, finalColors.near]);

  useEffect(() => {
    if (!mouseParallax) return;
    const onMove = (e: MouseEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      mouseRef.current.x = (e.clientX - rect.left) / Math.max(1, rect.width);
      mouseRef.current.y = (e.clientY - rect.top) / Math.max(1, rect.height);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [mouseParallax]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let last = performance.now();

    function drawLayer(stars: Star[], t: number, driftPxPerSec: number, twinkleT: number, parallaxScale: number) {
      if (!canvas) return;
      const w = canvas.width, h = canvas.height;
      const mx = (mouseRef.current.x - 0.5) * parallaxScale * w * 0.02;
      const my = (mouseRef.current.y - 0.5) * parallaxScale * h * 0.02;

      const phase = (driftPxPerSec * t) % w;

      if (showConnections && parallaxScale > 0.5) {
        const dpr = dpiRef.current;
        const maxDist = connectionDistance * dpr;

        for (let i = 0; i < stars.length; i++) {
          const s1 = stars[i];
          let x1 = s1.x + phase + mx;
          if (x1 < 0) x1 += w;
          if (x1 >= w) x1 -= w;
          const y1 = s1.y + my;

          for (let j = i + 1; j < Math.min(i + 15, stars.length); j++) {
            const s2 = stars[j];
            let x2 = s2.x + phase + mx;
            if (x2 < 0) x2 += w;
            if (x2 >= w) x2 -= w;
            const y2 = s2.y + my;

            const dx = x2 - x1;
            const dy = y2 - y1;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < maxDist) {
              const opacity = (1 - dist / maxDist) * 0.15;
              ctx.strokeStyle = `rgba(${s1.c}, ${opacity})`;
              ctx.lineWidth = 0.5;
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
            }
          }
        }
      }

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];

        let x = s.x + phase + mx;
        if (x < 0) x += w;
        if (x >= w) x -= w;
        const y = s.y + my;

        const base = 0.4 + (s.r / 2.5);
        const tw = Math.sin(s.phase + (twinkleT * 2 * Math.PI)) * twinkleAmplitude;
        const alpha = clamp(base + tw, 0.15, 0.95);

        ctx.fillStyle = `rgba(${s.c}, ${alpha * 0.12})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r * 2.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${s.c}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function frame(now: number) {
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;

      const layers = starsRef.current;
      if (!layers) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      driftPhaseRef.current.near += dt;
      driftPhaseRef.current.mid += dt;
      driftPhaseRef.current.far += dt;

      if (!canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      drawLayer(
        layers.far,
        driftPhaseRef.current.far,
        drift.far,
        (now / 1000) / Math.max(0.001, twinkleFreq.far),
        0.3
      );
      drawLayer(
        layers.mid,
        driftPhaseRef.current.mid,
        drift.mid,
        (now / 1000) / Math.max(0.001, twinkleFreq.mid),
        0.6
      );
      drawLayer(
        layers.near,
        driftPhaseRef.current.near,
        drift.near,
        (now / 1000) / Math.max(0.001, twinkleFreq.near),
        1.0
      );

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [drift.far, drift.mid, drift.near, twinkleAmplitude, twinkleFreq.far, twinkleFreq.mid, twinkleFreq.near, showConnections, connectionDistance]);

  return (
    <div ref={containerRef} className={`absolute inset-0 pointer-events-none ${className}`}>
      {backdrop}
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
};

export default StarfieldBackground;