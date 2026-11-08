import React, { useState, useEffect, useRef } from "react";
import { Play, Pause, Activity } from "lucide-react";

interface FieldViewer2DProps {
  data2D?: {
    t?: number[];
    x?: number[];
    y?: number[];
    u?: number[][][];
    v?: number[][][];
    pred_u?: number[][][];
    pred_v?: number[][][];
    speed?: number[][][];
    mse?: number;
    rel_l2?: number;
  };
}

export const FieldViewer2D: React.FC<FieldViewer2DProps> = ({ data2D }) => {
  const [frameIdx, setFrameIdx] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [showVectors, setShowVectors] = useState<boolean>(true);
  const [displayMode, setDisplayMode] = useState<"speed" | "u" | "v" | "vorticity">("speed");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const uField = data2D?.pred_u || data2D?.u;
  const vField = data2D?.pred_v || data2D?.v;
  const hasRealData = Boolean(uField && uField.length > 0);

  const tArr = data2D?.t || [];
  const totalFrames = uField ? uField.length : (tArr.length || 1);

  // Auto-play loop only if real data is loaded
  useEffect(() => {
    if (!isPlaying || !hasRealData || totalFrames <= 1) return;
    const interval = setInterval(() => {
      setFrameIdx((prev) => (prev + 1) % totalFrames);
    }, 200);
    return () => clearInterval(interval);
  }, [isPlaying, totalFrames, hasRealData]);

  // Render 2D Canvas from real evaluation frames
  useEffect(() => {
    if (!hasRealData || !uField) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const safeFrame = Math.min(frameIdx, uField.length - 1);
    const uMatrix = uField[safeFrame] || [];
    const vMatrix = vField ? vField[safeFrame] || [] : [];
    const Ny = uMatrix.length;
    if (Ny === 0) return;
    const Nx = uMatrix[0].length;
    if (Nx === 0) return;

    const cellW = w / Nx;
    const cellH = h / Ny;

    for (let j = 0; j < Ny; j++) {
      for (let i = 0; i < Nx; i++) {
        const u = uMatrix[j] ? uMatrix[j][i] || 0.0 : 0.0;
        const v = vMatrix[j] ? vMatrix[j][i] || 0.0 : 0.0;
        const speed = Math.sqrt(u * u + v * v);

        let val = speed;
        if (displayMode === "u") val = (u + 1.0) / 2.0;
        else if (displayMode === "v") val = (v + 1.0) / 2.0;
        else if (displayMode === "vorticity") val = Math.min(1.0, Math.abs(u - v));

        // Clamped normalizer [0, 1]
        const normVal = Math.max(0.0, Math.min(1.0, val));

        // High-contrast Viridis palette mapping
        const rCol = Math.floor(normVal * 230 + (1 - normVal) * 20);
        const gCol = Math.floor(normVal * 180 + (1 - normVal) * 40);
        const bCol = Math.floor((1 - normVal) * 210 + normVal * 40);

        ctx.fillStyle = `rgb(${rCol}, ${gCol}, ${bCol})`;
        ctx.fillRect(i * cellW, j * cellH, cellW + 1, cellH + 1);
      }
    }

    // Velocity vectors overlay from real computed flow field
    if (showVectors && vField) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 1;
      const step = Math.max(2, Math.floor(Nx / 16));
      for (let j = 0; j < Ny; j += step) {
        for (let i = 0; i < Nx; i += step) {
          const cx = i * cellW + cellW / 2;
          const cy = j * cellH + cellH / 2;
          const u = uMatrix[j] ? uMatrix[j][i] || 0.0 : 0.0;
          const v = vMatrix[j] ? vMatrix[j][i] || 0.0 : 0.0;

          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + u * 15, cy + v * 15);
          ctx.stroke();
        }
      }
    }
  }, [frameIdx, showVectors, displayMode, hasRealData, uField, vField]);

  if (!hasRealData) {
    return (
      <div className="glass-panel p-12 text-center max-w-2xl mx-auto my-8 border border-[var(--border)]">
        <div className="w-12 h-12 rounded-xl bg-[var(--surface-active)] flex items-center justify-center text-[var(--accent-a)] mx-auto mb-3">
          <Activity size={24} />
        </div>
        <h3 className="text-base font-bold font-heading mb-1 text-[var(--text)]">
          2D Solution Field Not Yet Generated
        </h3>
        <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto font-mono">
          This 2D Burgers training run does not have prediction artifacts yet. The authentic dynamic velocity field (u, v, vorticity) will render here once the run finishes.
        </p>
      </div>
    );
  }

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
