import React, { useState, useEffect, useRef } from "react";
import { Waves, Sparkles, Activity, ShieldCheck, ArrowRight } from "lucide-react";

interface SplashScreenProps {
  onFinish?: () => void;
  minDurationMs?: number;
}

const STAGES = [
  "Initializing Neural Collocation Grid...",
  "Loading Cole-Hopf Analytical Baselines (ν = 0.01/π)...",
  "Calibrating RI-PINN Two-Phase Schedules...",
  "Scientific Platform Ready."
];

export const SplashScreen: React.FC<SplashScreenProps> = ({
  onFinish,
  minDurationMs = 2400
}) => {
  const [progress, setProgress] = useState<number>(0);
  const [stageIdx, setStageIdx] = useState<number>(0);
  const [isFadingOut, setIsFadingOut] = useState<boolean>(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Background animated fluid flow waves
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // Draw subtle luminous wave currents
      const waves = [
        { amp: 30, freq: 0.003, speed: 0.02, color: "rgba(56, 189, 248, 0.08)", y: h * 0.48 },
        { amp: 45, freq: 0.002, speed: 0.015, color: "rgba(139, 92, 246, 0.06)", y: h * 0.52 },
        { amp: 20, freq: 0.004, speed: 0.025, color: "rgba(249, 115, 22, 0.05)", y: h * 0.55 },
      ];

      waves.forEach((wv) => {
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const y = wv.y + Math.sin(x * wv.freq + t * wv.speed) * wv.amp;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h);
        ctx.fillStyle = wv.color;
        ctx.fill();
      });

      t += 1;
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animId);
    };
  }, []);

  // Progress ticker & stage advancement
  useEffect(() => {
    const startTime = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const pct = Math.min(100, Math.floor((elapsed / minDurationMs) * 100));
      setProgress(pct);

      if (pct < 30) setStageIdx(0);
      else if (pct < 65) setStageIdx(1);
      else if (pct < 90) setStageIdx(2);
      else setStageIdx(3);

      if (elapsed >= minDurationMs) {
        clearInterval(interval);
        setIsFadingOut(true);
        setTimeout(() => {
          if (onFinish) onFinish();
        }, 500); // 500ms fade transition
      }
    }, 25);

    return () => clearInterval(interval);
  }, [minDurationMs, onFinish]);

  const handleSkip = () => {
    setIsFadingOut(true);
    setTimeout(() => {
      if (onFinish) onFinish();
    }, 250);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-[var(--bg)] transition-all duration-500 overflow-hidden select-none ${
        isFadingOut ? "opacity-0 scale-105 pointer-events-none" : "opacity-100 scale-100"
      }`}
    >
      {/* Background Interactive Fluid Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none opacity-80" />

      {/* Ambient Radial Gradient Glows */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-violet-500/10 rounded-full blur-[90px] pointer-events-none" />

      {/* Main Content Modal Container */}
      <div className="relative z-10 w-full max-w-md mx-4 p-8 rounded-3xl bg-[var(--bg-card)] backdrop-blur-2xl border border-[var(--border)] shadow-[0_20px_60px_rgba(0,0,0,0.5)] text-center flex flex-col items-center">
        
        {/* Animated Brand Emblem with Pulse Ring */}
        <div className="relative mb-6">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-tr from-cyan-500 to-violet-600 blur-lg opacity-60 animate-pulse" />
          <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-500 via-sky-500 to-indigo-600 text-white flex items-center justify-center shadow-xl shadow-cyan-500/25">
            <Waves size={32} className="animate-bounce" style={{ animationDuration: "2.5s" }} />
          </div>
        </div>

        {/* Title & Tagline */}
        <div className="space-y-1 mb-6">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-black font-heading tracking-tight text-[var(--text)]">
              BurgersFlow
            </h1>
            <span className="text-[10px] font-mono tracking-wider uppercase text-cyan-400 font-bold px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/25">
              PINN Studio
            </span>
          </div>
          <p className="text-xs font-mono text-[var(--text-muted)]">
            Scientific Viscous Fluid PDE Solver
          </p>
        </div>

        {/* Dynamic Progress Bar */}
        <div className="w-full space-y-2 mb-6">
          <div className="flex justify-between items-center text-[11px] font-mono">
            <span className="text-[var(--text-dim)] flex items-center gap-1.5">
              <Activity size={12} className="text-cyan-400 animate-spin" style={{ animationDuration: "3s" }} />
              {progress < 100 ? "Calibrating Environment" : "System Loaded"}
            </span>
            <span className="font-bold text-cyan-400 font-mono">{progress}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-[var(--surface-active)] overflow-hidden p-0.5 border border-[var(--border)]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-violet-500 transition-all duration-75 shadow-[0_0_12px_rgba(56,189,248,0.7)]"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Current Ticker Stage Notice */}
          <div className="h-5 flex items-center justify-center text-[11px] font-mono text-[var(--text-muted)] transition-opacity">
            <span className="truncate">{STAGES[stageIdx]}</span>
          </div>
        </div>

        {/* Academic Mentorship Tag */}
        <div className="w-full pt-4 border-t border-[var(--border)] flex items-center justify-between text-[10px] font-mono text-[var(--text-dim)]">
          <div className="flex items-center gap-1 text-left">
            <ShieldCheck size={12} className="text-[var(--ok)] shrink-0" />
            <span className="truncate">IIEST Shibpur · RCCIIT</span>
          </div>

          <button
            onClick={handleSkip}
            className="flex items-center gap-1 hover:text-[var(--text)] text-[var(--text-muted)] transition-colors font-semibold"
          >
            <span>Enter</span>
            <ArrowRight size={11} />
          </button>
        </div>

      </div>
    </div>
  );
};
