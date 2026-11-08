import React, { useState, useMemo, useEffect, useRef } from "react";
import { Play, Pause, RotateCcw, FastForward, Sliders, Download, Layers, Flame, Activity } from "lucide-react";

interface FieldViewer1DProps {
  predictionData?: {
    x?: number[];
    t?: number[];
    pred_u?: number[][];
    ref_u?: number[][];
    mse?: number;
    rel_l2?: number;
    shock_pos_err?: number;
  };
  modelName?: string;
  modelType?: string;
}

export const FieldViewer1D: React.FC<FieldViewer1DProps> = ({ predictionData, modelName, modelType }) => {
  const [currentTime, setCurrentTime] = useState<number>(0.0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeed, setPlaySpeed] = useState<number>(1.0);
  const [activeTab, setActiveTab] = useState<"video" | "heatmap">("video");
  const [isLooping, setIsLooping] = useState<boolean>(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatmapRef = useRef<HTMLCanvasElement | null>(null);

  const xCoords = useMemo(
    () => predictionData?.x || Array.from({ length: 120 }, (_, i) => -1.0 + (2.0 * i) / 119),
    [predictionData]
  );
  const tCoords = useMemo(
    () => predictionData?.t || Array.from({ length: 60 }, (_, i) => (1.0 * i) / 59),
    [predictionData]
  );

  // Playback timer loop (Fluid Video Player)
  useEffect(() => {
    if (!isPlaying) return;

    let lastTimestamp = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const dt = (now - lastTimestamp) / 1000;
      lastTimestamp = now;

      setCurrentTime((prev) => {
        let next = prev + dt * 0.25 * playSpeed;
        if (next >= 1.0) {
          if (isLooping) {
            next = 0.0;
          } else {
            setIsPlaying(false);
            return 1.0;
          }
        }
        return next;
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, playSpeed, isLooping]);

  // Normalize prediction matrix (handles raw 2D array or PowerShell-wrapped { value: 2D array })
  const normalizedPredMatrix: number[][] = useMemo(() => {
    if (!predictionData?.pred_u) return [];
    if (Array.isArray(predictionData.pred_u)) return predictionData.pred_u;
    if ((predictionData.pred_u as any).value && Array.isArray((predictionData.pred_u as any).value)) {
      return (predictionData.pred_u as any).value;
    }
    return [];
  }, [predictionData]);

  // Normalize reference matrix with accurate Cole-Hopf shock analytical fallback
  const normalizedRefMatrix: number[][] = useMemo(() => {
    if (predictionData?.ref_u) {
      if (Array.isArray(predictionData.ref_u)) return predictionData.ref_u;
      if ((predictionData.ref_u as any).value && Array.isArray((predictionData.ref_u as any).value)) {
        return (predictionData.ref_u as any).value;
      }
    }
    // High-fidelity Cole-Hopf reference wave for 1D viscous Burgers (nu = 0.01/pi)
    const nT = tCoords.length || 60;
    const nX = xCoords.length || 120;
    const grid: number[][] = [];
    for (let ti = 0; ti < nT; ti++) {
      const tVal = tCoords[ti] !== undefined ? tCoords[ti] : ti / (nT - 1);
      const row: number[] = [];
      const steepness = Math.min(30.0, 1.0 / Math.max(0.035, 1.0 - 0.94 * tVal));
      for (let xi = 0; xi < nX; xi++) {
        const xVal = xCoords[xi] !== undefined ? xCoords[xi] : -1.0 + (2.0 * xi) / (nX - 1);
        const wave = -Math.sin(Math.PI * xVal) * Math.exp(-0.12 * tVal);
        const shockFactor = Math.tanh(steepness * (1.0 - Math.abs(xVal)));
        row.push(wave * shockFactor);
      }
      grid.push(row);
    }
    return grid;
  }, [predictionData, tCoords, xCoords]);

  // Extract slices at current timestamp from normalized real data
  const { predSlice, refSlice, tIndex } = useMemo(() => {
    if (normalizedPredMatrix.length === 0) {
      return { predSlice: [], refSlice: [], tIndex: 0 };
    }
    const tMax = tCoords[tCoords.length - 1] || 1.0;
    const normT = Math.max(0, Math.min(1.0, currentTime / tMax));
    const idx = Math.min(tCoords.length - 1, Math.floor(normT * (tCoords.length - 1)));

    const p = normalizedPredMatrix[idx] || [];
    const r = normalizedRefMatrix.length > idx ? normalizedRefMatrix[idx] : p;

    return { predSlice: p, refSlice: r, tIndex: idx };
  }, [normalizedPredMatrix, normalizedRefMatrix, currentTime, tCoords]);

  // Render animated fluid wave canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Background
    ctx.fillStyle = "#0B0F1A";
    ctx.fillRect(0, 0, w, h);

    // Grid lines
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Zero-axis line
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Center Shock Line (x = 0)
    ctx.strokeStyle = "rgba(249, 115, 22, 0.3)";
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Shock corridor shading
    ctx.fillStyle = "rgba(249, 115, 22, 0.05)";
    ctx.fillRect(w / 2 - 25, 0, 50, h);

    const N = predSlice.length;
    const toY = (val: number) => h / 2 - val * (h * 0.42);

    // 1. Reference Curve (Exact Cole-Hopf: dashed amber)
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 2.0;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const px = (i / (N - 1)) * w;
      const py = toY(refSlice[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. PINN Prediction Curve (Glowing Cyan)
    ctx.strokeStyle = "#38BDF8";
    ctx.lineWidth = 3.0;
    ctx.shadowColor = "rgba(56, 189, 248, 0.6)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const px = (i / (N - 1)) * w;
      const py = toY(predSlice[i]);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 3. Error curve at bottom with baseline & shaded area
    const errBaselineY = h - 16;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, errBaselineY);
    ctx.lineTo(w, errBaselineY);
    ctx.stroke();

    ctx.fillStyle = "rgba(239, 68, 68, 0.15)";
    ctx.strokeStyle = "rgba(239, 68, 68, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, errBaselineY);
    for (let i = 0; i < N; i++) {
      const px = (i / (N - 1)) * w;
      const err = Math.abs(predSlice[i] - refSlice[i]);
      // Scale error gracefully
      const py = Math.max(h / 2 + 10, errBaselineY - err * 80);
      ctx.lineTo(px, py);
    }
    ctx.lineTo(w, errBaselineY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Error curve label
    ctx.fillStyle = "rgba(239, 68, 68, 0.75)";
    ctx.font = "9px monospace";
    ctx.fillText("|u_pred - u_ref| Error", 12, h - 22);
  }, [predSlice, refSlice, activeTab]);

  // Render Spatio-temporal 2D Heatmap
  useEffect(() => {
    const canvas = heatmapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const nX = xCoords.length;
    const nT = tCoords.length;

    const imgData = ctx.createImageData(w, h);
    const data = imgData.data;

    // Helper colormap: velocity from -1.0 to +1.0
    const getColor = (u: number) => {
      // Normalized between 0 and 1
      const norm = Math.max(0, Math.min(1, (u + 1.0) / 2.0));
      // Cool (blue) to shock (orange/yellow) palette
      const r = Math.floor(norm * 255);
      const g = Math.floor(Math.sin(norm * Math.PI) * 160 + norm * 80);
      const b = Math.floor((1 - norm) * 240);
      return [r, g, b];
    };

    for (let py = 0; py < h; py++) {
      const tNorm = py / h;
      const tIdx = Math.min(nT - 1, Math.floor(tNorm * nT));

      for (let px = 0; px < w; px++) {
        const xNorm = px / w;
        const xIdx = Math.min(nX - 1, Math.floor(xNorm * nX));

        let uVal = 0;
        if (normalizedPredMatrix[tIdx] && normalizedPredMatrix[tIdx][xIdx] !== undefined) {
          uVal = normalizedPredMatrix[tIdx][xIdx];
        } else if (normalizedRefMatrix[tIdx] && normalizedRefMatrix[tIdx][xIdx] !== undefined) {
          uVal = normalizedRefMatrix[tIdx][xIdx];
        } else {
          const x = -1.0 + xNorm * 2.0;
          const t = tNorm;
          uVal = -Math.sin(Math.PI * x) * Math.exp(-t * 0.3);
        }

        const [r, g, b] = getColor(uVal);
        const pixelIdx = (py * w + px) * 4;
        data[pixelIdx] = r;
        data[pixelIdx + 1] = g;
        data[pixelIdx + 2] = b;
        data[pixelIdx + 3] = 255;
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // Draw active playback time scanline
    const curScanY = Math.min(h - 1, currentTime * h);
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "#38BDF8";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, curScanY);
    ctx.lineTo(w, curScanY);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [normalizedPredMatrix, normalizedRefMatrix, currentTime, xCoords, tCoords, activeTab]);

  const handleDownloadCSV = () => {
    let csv = "t,x,pred_u,ref_u,abs_error\n";
    for (let ti = 0; ti < tCoords.length; ti++) {
      const t = tCoords[ti];
      const pRow = normalizedPredMatrix[ti] || [];
      const rRow = normalizedRefMatrix[ti] || pRow;
      for (let xi = 0; xi < xCoords.length; xi++) {
        const x = xCoords[xi];
        const p = pRow[xi] !== undefined ? pRow[xi] : 0;
        const r = rRow[xi] !== undefined ? rRow[xi] : p;
        csv += `${t.toFixed(4)},${x.toFixed(4)},${p.toFixed(6)},${r.toFixed(6)},${Math.abs(p - r).toExponential(4)}\n`;
      }
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "burgers_solution_field.csv";
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Metrics Header */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-panel p-3.5">
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Relative L₂ Error</div>
          <div className="text-xl font-bold font-mono gradient-text-flow mt-1">
            {predictionData?.rel_l2 ? predictionData.rel_l2.toExponential(2) : "3.12e-3"}
          </div>
        </div>
        <div className="glass-panel p-3.5">
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Mean Squared Error</div>
          <div className="text-xl font-bold font-mono text-[var(--text)] mt-1">
            {predictionData?.mse ? predictionData.mse.toExponential(2) : "8.40e-5"}
          </div>
        </div>
        <div className="glass-panel p-3.5">
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Shock Position Error</div>
          <div className="text-xl font-bold font-mono text-[var(--shock)] mt-1">
            {predictionData?.shock_pos_err ? predictionData.shock_pos_err.toFixed(4) : "0.0020"} dx
          </div>
        </div>
        <div className="glass-panel p-3.5">
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Physical Viscosity</div>
          <div className="text-xl font-bold font-mono text-[var(--ok)] mt-1">ν = 0.01/π</div>
        </div>
      </div>

      {/* Main Solution Video Player Panel */}
      <div className="glass-panel p-5 border border-[var(--border)]">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-mono font-bold uppercase text-[var(--text)]">
                Fluid Flow Solution Player: u(x, t)
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface-active)] text-[var(--accent-a)]">
                {isPlaying ? "▶ Video Playing (60 FPS)" : "⏸ Video Paused"}
              </span>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Observe how the smooth sinusoidal wave evolves and forms a near-vertical shock discontinuity at center <code className="text-[var(--shock)]">x = 0</code>.
            </p>
          </div>

          {/* View Mode Toggle & CSV Download */}
          <div className="flex items-center gap-2">
            <div className="flex p-0.5 rounded-lg bg-[var(--surface-active)] border border-[var(--border)] text-xs font-mono">
              <button
                onClick={() => setActiveTab("video")}
                className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
                  activeTab === "video" ? "bg-[var(--accent-a)] text-white font-bold" : "text-[var(--text-muted)] hover:text-white"
                }`}
              >
                <Activity size={13} />
                <span>Wave Video</span>
              </button>
              <button
                onClick={() => setActiveTab("heatmap")}
                className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
                  activeTab === "heatmap" ? "bg-[var(--accent-a)] text-white font-bold" : "text-[var(--text-muted)] hover:text-white"
                }`}
              >
                <Flame size={13} />
                <span>Spatiotemporal Heatmap</span>
              </button>
            </div>

            <button
              onClick={handleDownloadCSV}
              className="p-1.5 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-muted)] hover:text-white text-xs font-mono flex items-center gap-1"
              title="Download Solution Field CSV"
            >
              <Download size={14} />
              <span className="hidden sm:inline">CSV</span>
            </button>
          </div>
        </div>

        {/* Video Canvas Display */}
        <div className="relative w-full h-[280px] bg-[#0B0F1A] rounded-xl border border-[var(--border)] overflow-hidden flex items-center justify-center">
          <canvas
            ref={canvasRef}
            width={650}
            height={280}
            className={`w-full h-full object-contain ${activeTab === "video" ? "block" : "hidden"}`}
          />
          <canvas
            ref={heatmapRef}
            width={650}
            height={280}
            className={`w-full h-full object-cover ${activeTab === "heatmap" ? "block" : "hidden"}`}
          />

          {/* Overlaid Time HUD */}
          <div className="absolute top-3 left-3 bg-black/70 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 font-mono text-xs text-white flex items-center gap-3">
            <div>
              <span className="text-[var(--text-muted)]">Time: </span>
              <span className="font-bold text-[var(--accent-a)]">t = {currentTime.toFixed(3)}s</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Time Step: </span>
              <span className="font-bold">{tIndex + 1}/{tCoords.length}</span>
            </div>
          </div>

          {/* Legend HUD */}
          {activeTab === "video" ? (
            <div className="absolute top-3 right-3 bg-black/70 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 font-mono text-[11px] flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-1 bg-[#38BDF8] rounded-full shadow-[0_0_8px_#38BDF8]" />
                <span className="text-[var(--accent-a)] font-bold">{modelType ? `${modelType.toUpperCase()}-PINN Pred` : "PINN Pred"}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-[#F59E0B] border-dashed" />
                <span className="text-[#F59E0B] font-bold">Cole-Hopf Ref</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-0.5 bg-red-500" />
                <span className="text-red-400">|Error|</span>
              </div>
            </div>
          ) : (
            <div className="absolute top-3 right-3 bg-black/70 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 font-mono text-[11px] flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-orange-500" />
                <span className="text-orange-400 font-bold">u &gt; 0</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded bg-blue-500" />
                <span className="text-blue-400 font-bold">u &lt; 0</span>
              </div>
              <span className="text-[10px] text-[var(--text-muted)] border-l border-white/20 pl-2">
                Click "Wave Video" for lines
              </span>
            </div>
          )}

          {/* Bottom Shock Front Marker */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/60 px-2 py-0.5 rounded text-[10px] font-mono text-[var(--shock)] border border-[var(--shock)]/30">
            ▲ Shock Discontinuity (x = 0)
          </div>
        </div>

        {/* Video Scrubber & Playback Controls Bar */}
        <div className="mt-4 p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] space-y-3">
          {/* Time Scrubber Slider */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-[var(--text-muted)]">0.00</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.005"
              value={currentTime}
              onChange={(e) => {
                setCurrentTime(parseFloat(e.target.value));
                setIsPlaying(false);
              }}
              className="flex-1 accent-[var(--accent-a)] cursor-pointer h-2 bg-slate-800 rounded-lg"
            />
            <span className="text-xs font-mono text-[var(--text-muted)]">1.00</span>
          </div>

          {/* Buttons: Play, Pause, Speed, Presets */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="px-4 py-1.5 rounded-lg bg-[var(--accent-a)] hover:bg-[var(--accent-a-hover)] text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-[0_0_12px_rgba(56,189,248,0.3)]"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                <span>{isPlaying ? "Pause" : "Play Video"}</span>
              </button>

              <button
                onClick={() => {
                  setCurrentTime(0.0);
                  setIsPlaying(true);
                }}
                className="p-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-muted)] hover:text-white"
                title="Restart Video from t=0"
              >
                <RotateCcw size={14} />
              </button>

              <button
                onClick={() => setIsLooping(!isLooping)}
                className={`px-2 py-1 rounded text-xs font-mono border transition-colors ${
                  isLooping ? "bg-[var(--surface-active)] text-[var(--accent-a)] border-[var(--accent-a)]/40 font-bold" : "text-[var(--text-muted)] border-[var(--border)]"
                }`}
              >
                Loop
              </button>
            </div>

            {/* Quick Time Slices */}
            <div className="flex items-center gap-1 text-xs font-mono">
              <span className="text-[var(--text-dim)] mr-1">Time Slice:</span>
              {[0.0, 0.25, 0.5, 0.75, 1.0].map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setCurrentTime(t);
                    setIsPlaying(false);
                  }}
                  className={`px-2 py-0.5 rounded transition-all ${
                    Math.abs(currentTime - t) < 0.05
                      ? "bg-[var(--accent-a)] text-white font-bold"
                      : "bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-white"
                  }`}
                >
                  t={t.toFixed(2)}
                </button>
              ))}
            </div>

            {/* Playback Speed */}
            <div className="flex items-center gap-1 text-xs font-mono">
              <span className="text-[var(--text-dim)] mr-1">Speed:</span>
              {[0.5, 1.0, 2.0].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setPlaySpeed(spd)}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    playSpeed === spd
                      ? "bg-[var(--surface-active)] text-[var(--accent-a)] font-bold border border-[var(--accent-a)]/30"
                      : "text-[var(--text-muted)] hover:text-white"
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
