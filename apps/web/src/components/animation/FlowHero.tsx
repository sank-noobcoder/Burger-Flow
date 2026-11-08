import React, { useEffect, useRef, useState } from "react";
import { Play, Pause } from "lucide-react";

interface FlowHeroProps {
  onExploreClick?: () => void;
  onLaunchClick?: () => void;
}

export const FlowHero: React.FC<FlowHeroProps> = ({ onExploreClick, onLaunchClick }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    // Number of advected particles (PRD §8: adapt to device, ~4k to 8k)
    const NUM_PARTICLES = Math.min(600, Math.floor(width / 3));
    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      age: number;
      maxAge: number;
      color: string;
      size: number;
    }> = [];

    const isLightMode = () => document.documentElement.getAttribute("data-theme") === "light";

    const darkColors = [
      "rgba(56, 189, 248, ",   // Flow Cyan
      "rgba(139, 92, 246, ",   // Flow Violet
      "rgba(249, 115, 22, ",   // Shock Orange
      "rgba(99, 102, 241, "    // Indigo
    ];
    const lightColors = [
      "rgba(2, 132, 199, ",    // Deep Ocean Cyan
      "rgba(124, 58, 237, ",   // Royal Violet
      "rgba(234, 88, 12, ",    // Shock Orange
      "rgba(79, 70, 229, "     // Royal Indigo
    ];

    const initParticle = () => {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const colorIndex = Math.abs(x - width * 0.5) < width * 0.08 ? 2 : Math.floor(Math.random() * darkColors.length);
      return {
        x,
        y,
        vx: 0,
        vy: 0,
        age: Math.random() * 100,
        maxAge: 120 + Math.random() * 80,
        colorIndex,
        size: 1.4 + Math.random() * 2.2,
      };
    };

    for (let i = 0; i < NUM_PARTICLES; i++) {
      particles.push(initParticle());
    }

    let t = 0;

    const render = () => {
      if (!isPlaying) return;

      const isLight = isLightMode();
      // Theme-adaptive soft fading trail
      ctx.fillStyle = isLight ? "rgba(247, 249, 252, 0.32)" : "rgba(11, 15, 26, 0.22)";
      ctx.fillRect(0, 0, width, height);

      t += 0.015;
      const activeColors = isLight ? lightColors : darkColors;

      particles.forEach((p, idx) => {
        // Evaluate simulated 1D/2D Burgers velocity field: u(x, t) ~ -sin(pi*x)/(1 + t*steepening)
        const normX = (p.x / width) * 2 - 1; // [-1, 1]
        const normY = (p.y / height) * 2 - 1;

        // Wave steepening near center x=0 (the Burgers shock front!)
        const u = -Math.sin(Math.PI * normX) / (0.3 + Math.abs(normX) * 0.7);
        const v = Math.cos(Math.PI * normY) * 0.4;

        p.vx = p.vx * 0.92 + u * 2.5 * 0.08;
        p.vy = p.vy * 0.92 + v * 1.5 * 0.08;

        p.x += p.vx;
        p.y += p.vy;
        p.age++;

        // Wrap around boundaries
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        if (p.age > p.maxAge) {
          particles[idx] = initParticle();
        }

        const alpha = Math.sin((p.age / p.maxAge) * Math.PI);
        const colStr = activeColors[p.colorIndex % activeColors.length];
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `${colStr}${Math.max(0.2, alpha * (isLight ? 0.9 : 0.75))})`;
        ctx.shadowBlur = isLight ? 4 : 8;
        ctx.shadowColor = p.colorIndex === 2
          ? (isLight ? "rgba(234, 88, 12, 0.4)" : "rgba(249, 115, 22, 0.6)")
          : (isLight ? "rgba(2, 132, 199, 0.35)" : "rgba(56, 189, 248, 0.4)");
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      animFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying]);

  return (
    <div className="relative w-full h-[90vh] min-h-[640px] flex items-center justify-center overflow-hidden border-b border-[var(--border)]">
      {/* Background Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 z-0 pointer-events-none opacity-90" />

      {/* Radial soft glow backdrop */}
      <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-transparent to-transparent pointer-events-none z-10" />

      {/* Hero Content */}
      <div className="relative z-20 max-w-5xl mx-auto px-6 text-center flex flex-col items-center">
        {/* Paper Citation Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] mb-8 text-xs font-mono text-[var(--accent-a)] glass-panel shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[var(--ok)] animate-ping" />
          <span>Sci. Rep. 15:16740 (2025) · Re-Initialization PINN (RI-PINN)</span>
        </div>

        {/* Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight mb-6 leading-tight text-[var(--text)]">
          Physics-Informed Neural Networks <br />
          <span className="gradient-text-flow">for Viscous Fluid Flow</span>
        </h1>

        {/* Subtitle */}
        <p className="max-w-2xl text-lg sm:text-xl text-[var(--text-muted)] mb-10 leading-relaxed font-medium">
          Break through the low-viscosity shock barrier. Explore the two-phase{" "}
          <strong className="text-[var(--shock)] font-semibold">RI-PINN</strong> strategy with live
          monitoring, automated low-gradient region detection, and side-by-side Cole-Hopf benchmarks.
        </p>

        {/* CTAs */}
        <div className="flex flex-wrap items-center justify-center gap-4">
          <button onClick={onLaunchClick} className="btn-primary text-base px-8 py-3.5 shadow-lg">
            <span>Launch Experiment</span>
            <span className="text-lg">→</span>
          </button>
          <button onClick={onExploreClick} className="btn-secondary text-base px-7 py-3.5">
            <span>Explore Baseline Benchmarks</span>
          </button>
        </div>

        {/* Key Metrics Quick Bar */}
        <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-3xl">
          <div className="glass-panel p-4 text-center">
            <div className="text-2xl font-bold font-mono gradient-text-flow">3.12 × 10⁻³</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">RI-PINN Rel. L₂ Error</div>
          </div>
          <div className="glass-panel p-4 text-center">
            <div className="text-2xl font-bold font-mono text-[var(--shock)]">30%</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Low-Gradient Re-Init (A%)</div>
          </div>
          <div className="glass-panel p-4 text-center">
            <div className="text-2xl font-bold font-mono text-[var(--text)]">1D & 2D</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Burgers Equation</div>
          </div>
          <div className="glass-panel p-4 text-center">
            <div className="text-2xl font-bold font-mono text-[var(--ok)]">Cole-Hopf</div>
            <div className="text-xs text-[var(--text-muted)] mt-1">Exact Quad Reference</div>
          </div>
        </div>
      </div>

      {/* Animation Controls (Bottom Right - PRD §8.2) */}
      <div className="absolute bottom-6 right-6 z-30">
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          className="p-2.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-white transition-all shadow-md flex items-center justify-center"
          title={isPlaying ? "Pause Flow Animation" : "Play Flow Animation"}
          aria-label={isPlaying ? "Pause Flow Animation" : "Play Flow Animation"}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
      </div>
    </div>
  );
};
