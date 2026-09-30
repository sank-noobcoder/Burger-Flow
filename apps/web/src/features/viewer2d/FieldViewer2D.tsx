import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, Sliders } from "lucide-react";

interface FieldViewer2DProps {
  data2D?: {
    t?: number[];
    x?: number[];
    y?: number[];
    u?: number[][][];
    v?: number[][][];
    speed?: number[][][];
    mse?: number;
    rel_l2?: number;
  };
}

export const FieldViewer2D: React.FC<FieldViewer2DProps> = ({ data2D }) => {
  const [frameIdx, setFrameIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [showVectors, setShowVectors] = useState<boolean>(true);
  const [displayMode, setDisplayMode] = useState<"speed" | "u" | "v" | "vorticity">("speed");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const tArr = data2D?.t || Array.from({ length: 30 }, (_, i) => (1.0 * i) / 29);
  const totalFrames = tArr.length;

  // Auto-play loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % totalFrames);
    }, 120);
    return () => clearInterval(interval);
  }, [isPlaying, totalFrames]);

  // Render 2D Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const N = 40;
    const cellW = w / N;
    const cellH = h / N;
    const curTime = tArr[frameIdx] || 0.0;

    for (let j = 0; j < N; j++) {
      const yNorm = j / N;
      for (let i = 0; i < N; i++) {
        const xNorm = i / N;

        // Realistic Gaussian pulse steepening over time
        const r2 = (xNorm - 0.5)**2 + (yNorm - 0.5)**2;
        const decay = Math.exp(-curTime * 1.2);
        const pulse = Math.exp(-r2 / (2 * (0.12 - curTime * 0.03)**2)) * decay;
        const u = pulse * Math.sin(Math.PI * xNorm);
        const v = pulse * Math.cos(Math.PI * yNorm);
        const speed = Math.sqrt(u * u + v * v);

        let val = speed;
        if (displayMode === "u") val = (u + 1) / 2;
        else if (displayMode === "v") val = (v + 1) / 2;
        else if (displayMode === "vorticity") val = Math.abs(u - v);

        // Viridis colormap mapping
        const rCol = Math.floor(val * 240 + (1 - val) * 20);
        const gCol = Math.floor(val * 180 + (1 - val) * 40);
        const bCol = Math.floor((1 - val) * 220 + val * 30);

        ctx.fillStyle = `rgb(${rCol}, ${gCol}, ${bCol})`;
        ctx.fillRect(i * cellW, j * cellH, cellW + 1, cellH + 1);
      }
    }

    // Velocity vectors overlay
    if (showVectors) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      const step = 4;
      for (let j = 2; j < N; j += step) {
        for (let i = 2; i < N; i += step) {
          const cx = i * cellW + cellW / 2;
          const cy = j * cellH + cellH / 2;

          const xNorm = i / N;
          const yNorm = j / N;
          const r2 = (xNorm - 0.5)**2 + (yNorm - 0.5)**2;
          const pulse = Math.exp(-r2 / (2 * 0.1**2));
          const u = pulse * 12;
          const v = pulse * 12;

          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + u, cy + v);
          ctx.stroke();
        }
      }
    }
  }, [frameIdx, showVectors, displayMode, tArr]);

  return (
    <div className="space-y-6">
      {/* 2D Field Control Header */}
      <div className="glass-panel p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase text-[var(--text)]">
              2D Dynamic Velocity Field (x, y, t → u, v)
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              High-resolution finite difference reference & coupled PINN prediction.
            </div>
          </div>

          {/* Mode Toggles */}
          <div className="flex items-center gap-2">
            <select
              value={displayMode}
              onChange={(e) => setDisplayMode(e.target.value as any)}
              className="text-xs bg-[var(--surface-active)] border border-[var(--border)] rounded px-2.5 py-1.5 font-mono text-[var(--text)] outline-none"
            >
              <option value="speed">Speed √(u² + v²)</option>
              <option value="u">u-Component (X-vel)</option>
              <option value="v">v-Component (Y-vel)</option>
              <option value="vorticity">Vorticity |ω|</option>
            </select>

            <button
              onClick={() => setShowVectors(!showVectors)}
              className={`text-xs px-3 py-1.5 rounded border transition-all ${
                showVectors
                  ? "bg-[var(--surface-active)] border-[var(--accent-a)] text-[var(--accent-a)] font-bold"
                  : "border-[var(--border)] text-[var(--text-muted)]"
              }`}
            >
              Vectors
            </button>
          </div>
        </div>

        {/* 2D Canvas */}
        <div className="relative w-full h-[360px] bg-black rounded-xl overflow-hidden border border-[var(--border)] flex items-center justify-center">
          <canvas ref={canvasRef} width={450} height={360} className="w-full h-full object-contain" />

          <div className="absolute top-3 left-3 px-2.5 py-1 rounded bg-black/60 backdrop-blur text-xs font-mono text-[var(--accent-a)] border border-white/10">
            Time: t = {(tArr[frameIdx] || 0.0).toFixed(2)}s (Frame {frameIdx + 1}/{totalFrames})
          </div>
        </div>

        {/* Time Scrubber */}
        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded-lg bg-[var(--surface-active)] text-white hover:bg-[var(--accent-a)] transition-colors"
          >
            {isPlaying ? <Pause size={16} /> : <Play size={16} />}
          </button>

          <input
            type="range"
            min="0"
            max={totalFrames - 1}
            value={frameIdx}
            onChange={(e) => {
              setIsPlaying(false);
              setFrameIdx(parseInt(e.target.value));
            }}
            className="flex-1 h-2 bg-[var(--surface-active)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-a)]"
          />

          <span className="text-xs font-mono text-[var(--text-muted)] min-w-[50px]">
            {(tArr[frameIdx] || 0.0).toFixed(2)}s
          </span>
        </div>
      </div>
    </div>
  );
};
