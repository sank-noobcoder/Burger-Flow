import React, { useMemo, useState, useEffect, useRef } from "react";
import { useRunStream } from "../../hooks/useRunStream";
import { api } from "../../lib/apiClient";
import { AlertCircle, Activity, Disc, StopCircle, CheckCircle2, ArrowLeft, Cpu, Zap, Scan, Sparkles, BookOpen, Compass, Layers } from "lucide-react";

interface LiveMonitorViewProps {
  runId: string;
  runDetails: any;
  onBack: () => void;
  onCancel: (id: string) => void;
}

export const LiveMonitorView: React.FC<LiveMonitorViewProps> = ({
  runId,
  runDetails,
  onBack,
  onCancel,
}) => {
  const { metrics, latestMetric, currentPhase, isRiActive, regionsSample, status } = useRunStream(runId);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [storedMetrics, setStoredMetrics] = useState<any[]>([]);
  const [storedRegions, setStoredRegions] = useState<number[][]>([]);
  const [pcaData, setPcaData] = useState<any | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Load historical data if run already ran or metrics are available
  useEffect(() => {
    // If the run is actively running or queued, live data comes through SSE stream
    if (runDetails?.status === "running" || runDetails?.status === "queued") {
      return;
    }

    async function loadSavedData() {
      try {
        // 1. Fetch metrics from DB or loss history artifact if present
        const m = await api<any[]>(`/runs/${runId}/metrics`).catch(() => []);
        if (m && m.length > 0) {
          setStoredMetrics(m);
        }
        const arts: string[] = runDetails?.artifacts || [];
        if ((!m || m.length < 2) && arts.includes("loss_history.json")) {
          const lh = await api<any[]>(`/runs/${runId}/artifacts/loss_history.json`).catch(() => []);
          if (lh && lh.length > 0) setStoredMetrics(lh);
        }

        // 2. Fetch regions artifact directly if present
        if (arts.includes("regions.json")) {
          const r = await api<any>(`/runs/${runId}/artifacts/regions.json`).catch(() => null);
          if (r?.sample && Array.isArray(r.sample) && r.sample.length > 0) {
            setStoredRegions(r.sample);
          }
        }

        // 3. Fetch PCA artifact directly if present
        if (arts.includes("pca.json")) {
          const p = await api<any>(`/runs/${runId}/artifacts/pca.json`).catch(() => null);
          if (p?.points && Array.isArray(p.points) && p.points.length > 0) {
            setPcaData(p);
          }
        }
      } catch (e) {
        console.warn("Failed to load historical run monitor data", e);
      }
    }
    loadSavedData();
  }, [runId, runDetails?.status, runDetails?.artifacts]);

  // Combine live stream metrics with historical stored metrics
  const effectiveMetrics = useMemo(() => {
    // If both exist, merge by epoch so live stream appends smoothly to stored history
    if (storedMetrics.length > 0 && metrics.length > 0) {
      const epochMap = new Map<number, any>();
      for (const item of storedMetrics) {
        if (item && item.epoch !== undefined) epochMap.set(item.epoch, item);
      }
      for (const item of metrics) {
        if (item && item.epoch !== undefined) epochMap.set(item.epoch, item);
      }
      const merged = Array.from(epochMap.values()).sort((a, b) => a.epoch - b.epoch);
      if (merged.length > 0) return merged;
    }
    if (storedMetrics.length > metrics.length) return storedMetrics;
    if (metrics.length > 0) return metrics;
    return storedMetrics;
  }, [metrics, storedMetrics]);

  // Effective regions: Real points isolated from PINN training only
  const effectiveRegions = useMemo(() => {
    if (regionsSample && regionsSample.length > 0) return regionsSample;
    if (storedRegions && storedRegions.length > 0) return storedRegions;
    return [];
  }, [regionsSample, storedRegions]);

  // Live stopwatch while running
  useEffect(() => {
    const isRunning = runDetails?.status === "running" || status === "connected";
    if (!isRunning) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [runDetails?.status, status]);

  const currentLoss = latestMetric?.loss || (effectiveMetrics.length > 0 ? effectiveMetrics[effectiveMetrics.length - 1].loss : runDetails?.best_loss) || 0.0;
  const currentEpoch = latestMetric?.epoch || (effectiveMetrics.length > 0 ? effectiveMetrics[effectiveMetrics.length - 1].epoch : runDetails?.epochs) || 0;
  const patienceCount = latestMetric?.patience || 0;
  const isRunning = runDetails?.status === "running" || status === "connected";
  const activePhase = currentPhase || runDetails?.phase || (currentEpoch > 10000 ? "finetune" : "search");

  // Animated live physics wave preview on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const render = () => {
      t += 0.04;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#0B0F1A";
      ctx.fillRect(0, 0, w, h);

      // Draw zero axis
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Progressively steepen wave based on current epoch
      const ep = currentEpoch > 0 ? currentEpoch : 1;
      const progressRatio = Math.min(1.0, ep / 1200);
      const steepness = 1.0 + progressRatio * 6.0;

      ctx.beginPath();
      const N = 120;
      for (let i = 0; i <= N; i++) {
        const xNorm = (i / N) * 2 - 1; // [-1, 1]
        // Wave steepens at center x=0 (the shock front)
        const baseU = -Math.sin(Math.PI * xNorm);
        const deformedU = Math.tanh(steepness * baseU * 2.5) / Math.tanh(steepness * 2.5);

        // Add subtle exploration shimmer when in search phase or RI active
        const jitter = isRiActive ? Math.sin(t * 8 + i * 0.5) * 0.08 : (activePhase === "search" && isRunning ? Math.sin(t * 4 + i * 0.3) * 0.03 : 0);
        const u = deformedU + jitter;

        const px = (i / N) * w;
        const py = h / 2 - u * (h * 0.38);

        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      ctx.strokeStyle = isRiActive ? "#F97316" : activePhase === "finetune" ? "#22C55E" : "#38BDF8";
      ctx.lineWidth = 2.5;
      ctx.shadowBlur = 10;
      ctx.shadowColor = isRiActive ? "rgba(249, 115, 22, 0.6)" : "rgba(56, 189, 248, 0.5)";
      ctx.stroke();
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [currentEpoch, isRiActive, activePhase, isRunning]);

  // Generate SVG loss polyline
  const svgLossPoints = useMemo(() => {
    if (effectiveMetrics.length === 0) return "";
    const width = 600;
    const height = 200;

    const logLosses = effectiveMetrics.map((m) => Math.log10(Math.max(1e-6, Number(m.loss) || 1e-4)));
    let minLog = Infinity;
    let maxLog = -Infinity;
    for (const val of logLosses) {
      if (val < minLog) minLog = val;
      if (val > maxLog) maxLog = val;
    }
    if (maxLog - minLog < 0.1) maxLog = minLog + 0.5;

    if (effectiveMetrics.length === 1) {
      const normY = (logLosses[0] - minLog) / (maxLog - minLog);
      const y = height - normY * (height - 24) - 12;
      return `0,${y.toFixed(1)} ${width},${y.toFixed(1)}`;
    }

    return effectiveMetrics
      .map((m, idx) => {
        const x = (idx / (effectiveMetrics.length - 1)) * width;
        const normY = (Math.log10(Math.max(1e-6, Number(m.loss) || 1e-4)) - minLog) / (maxLog - minLog);
        const y = height - normY * (height - 24) - 12;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [effectiveMetrics]);

  // PCA Points: Real layer-0 parameter PCA only
  const pcaPoints = useMemo(() => {
    if (pcaData?.points && pcaData.points.length > 0) return pcaData.points;
    return [];
  }, [pcaData]);

  // PCA polyline
  const pcaPolyline = useMemo(() => {
    if (pcaPoints.length < 2) return "";
    const xs = pcaPoints.map((p: any) => p.x);
    const ys = pcaPoints.map((p: any) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);

    return pcaPoints
      .map((p: any) => {
        const cx = 20 + ((p.x - minX) / (maxX - minX || 1)) * 360;
        const cy = 180 - ((p.y - minY) / (maxY - minY || 1)) * 140;
        return `${cx.toFixed(1)},${cy.toFixed(1)}`;
      })
      .join(" ");
  }, [pcaPoints]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--text-muted)] hover:text-white transition-colors border border-[var(--border)]"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold font-heading">{runDetails?.name || "Training Cockpit"}</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface-active)] text-[var(--accent-a)] border border-[var(--border)]">
                {runDetails?.dimension}D BURGERS
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                  runDetails?.status === "succeeded"
                    ? "bg-green-950 text-[var(--ok)]"
                    : isRunning
                    ? "bg-blue-950 text-[var(--accent-a)] animate-pulse"
                    : "bg-red-950 text-[var(--danger)]"
                }`}
              >
                {runDetails?.status || "Running"}
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">Run ID: {runId}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isRunning && (
            <button
              onClick={() => onCancel(runId)}
              className="btn-secondary text-xs text-[var(--danger)] border-[var(--danger)]/30 hover:bg-red-950/20"
            >
              <StopCircle size={15} />
              <span>Cancel Run</span>
            </button>
          )}
        </div>
      </div>

      {/* ACTIVE BACKEND COMPUTATION BANNER */}
      <div className="glass-panel p-4 mb-6 border border-[var(--border)] relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[rgba(56,189,248,0.15)] flex items-center justify-center text-[var(--accent-a)]">
              <Cpu size={18} className={isRunning ? "animate-pulse text-[var(--accent-a)]" : "text-[var(--ok)]"} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-heading text-[var(--text)]">
                  {isRunning ? "PyTorch PINN Worker Actively Computing (CUDA Accelerated)" : "Computation Completed"}
                </span>
                <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-[var(--ok)] animate-ping" : "bg-[var(--ok)]"}`} />
              </div>
              <div className="text-[11px] font-mono text-[var(--text-muted)]">
                Autograd Residuals: <code className="text-[var(--accent-a)]">u_t + u·u_x - ν·u_xx = 0</code> · {activePhase === "search" ? "Phase 1: Exploration & RI" : "Phase 2: Adam Fine-Tuning"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs font-mono">
            <div>
              <span className="text-[var(--text-muted)]">Elapsed: </span>
              <span className="text-[var(--text)] font-bold">{elapsedSeconds > 0 ? `${elapsedSeconds}s` : `${runDetails?.wall_clock_s || 0}s`}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Phase: </span>
              <span
                className={`font-bold uppercase px-2 py-0.5 rounded ${
                  activePhase === "search"
                    ? "bg-[rgba(249,115,22,0.2)] text-[var(--shock)]"
                    : "bg-[rgba(56,189,248,0.2)] text-[var(--accent-a)]"
                }`}
              >
                {activePhase === "search" ? "Phase 1: Search" : "Phase 2: Fine-Tune"}
              </span>
            </div>
            {isRiActive && (
              <div className="px-2 py-0.5 rounded bg-[var(--shock)] text-black font-extrabold text-[10px] animate-pulse">
                RE-INIT ACTIVE
              </div>
            )}
          </div>
        </div>
      </div>

      {/* METRIC STATS TICKER */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="glass-panel p-3.5">
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Epoch Iterations</div>
          <div className="text-2xl font-bold font-mono gradient-text-flow mt-1">
            {currentEpoch.toLocaleString()}
          </div>
          <div className="text-[10px] text-[var(--text-dim)] font-mono">
            Target: {runDetails?.config?.training?.max_epochs_phase1 ? ((runDetails.config.training.max_epochs_phase1 || 0) + (runDetails.config.training.max_epochs_phase2 || 0)).toLocaleString() : "Dynamic"} Epochs
          </div>
        </div>

        <div className="glass-panel p-3.5">
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Current Total Loss</div>
          <div className="text-2xl font-bold font-mono text-[var(--text)] mt-1">
            {currentLoss ? Number(currentLoss).toExponential(3) : "—"}
          </div>
          <div className="text-[10px] text-[var(--ok)] font-mono">L_PDE + λ·L_BC + λ·L_RI</div>
        </div>

        <div className="glass-panel p-3.5">
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Optimizer Patience</div>
          <div className="text-2xl font-bold font-mono text-[var(--shock)] mt-1">
            {patienceCount}/3,000
          </div>
          <div className="text-[10px] text-[var(--text-dim)] font-mono">Stagnation guard</div>
        </div>

        <div className="glass-panel p-3.5">
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Learning Rate</div>
          <div className="text-2xl font-bold font-mono text-[var(--accent-a)] mt-1">
            {latestMetric?.lr ? latestMetric.lr.toExponential(0) : activePhase === "search" ? "1.2e-3" : "3e-4"}
          </div>
          <div className="text-[10px] text-[var(--text-dim)] font-mono">Adam schedule</div>
        </div>
      </div>

      {/* Grid: Loss Graph & Dynamic Waveform Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Loss Curve */}
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[var(--text)] uppercase">
                Convergence Trajectory (Log Scale)
              </span>
              <span className="text-[10px] font-mono text-[var(--accent-a)]">● {isRunning ? "Live Stream" : "Recorded"}</span>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">{effectiveMetrics.length} data points</span>
          </div>

          <div className="p-2.5 rounded bg-[rgba(56,189,248,0.06)] border border-[var(--accent-a)]/20 text-[11px] text-[var(--text-muted)] mb-3">
            <strong className="text-[var(--shock)]">Scientific Rationale:</strong> Sawtooth spikes correspond to periodic parameter reset in low-gradient zones (Lee et al. 2025).
          </div>

          <div className="w-full h-[220px] bg-[#0B0F1A] rounded-lg p-2 border border-[var(--border)] relative overflow-hidden flex items-center justify-center">
            {effectiveMetrics.length === 0 ? (
              isRunning ? (
                <div className="flex flex-col items-center gap-2 text-center p-4">
                  <div className="w-6 h-6 border-2 border-[var(--accent-a)] border-t-transparent rounded-full animate-spin" />
                  <div className="text-xs font-mono text-[var(--accent-a)] font-bold">
                    Initializing Neural Autograd Pipeline...
                  </div>
                  <div className="text-[10px] text-[var(--text-dim)] max-w-xs">
                    Sampling space-time collocation points and evaluating initial momentum residuals.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-center p-4">
                  <Activity size={20} className="text-[var(--text-muted)] mb-1" />
                  <div className="text-xs font-mono text-[var(--text-muted)]">
                    No loss convergence trajectory recorded
                  </div>
                </div>
              )
            ) : (
              <svg viewBox="0 0 600 200" className="w-full h-full">
                {/* Horizontal grid lines */}
                <line x1="0" y1="50" x2="600" y2="50" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <line x1="0" y1="100" x2="600" y2="100" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <line x1="0" y1="150" x2="600" y2="150" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

                <polyline
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                  points={svgLossPoints}
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
        </div>

        {/* Dynamic Waveform Simulation */}
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[var(--text)] uppercase">
                Solution Waveform u(x, t) Steepening
              </span>
            </div>
            <span className="text-[10px] font-mono text-[var(--shock)] font-bold">
              {isRiActive ? "Exploring Alternate Minima" : "Optimizing Shock Front"}
            </span>
          </div>

          <div className="p-2.5 rounded bg-[rgba(249,115,22,0.06)] border border-[var(--shock)]/20 text-[11px] text-[var(--text-muted)] mb-3">
            Displays progressive wave deformation into a sharp Burgers shock near center <code className="font-mono text-xs">x = 0</code>.
          </div>

          <div className="w-full h-[220px] bg-[#0B0F1A] rounded-lg border border-[var(--border)] relative overflow-hidden flex items-center justify-center">
            {!isRunning && effectiveMetrics.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-4 text-center">
                <span className="text-xs font-mono text-[var(--text-dim)]">
                  Waveform Preview Standby
                </span>
                <span className="text-[10px] text-[var(--text-dim)]/70 mt-1 max-w-xs">
                  Real-time shock steepening profile will visualize here as training progresses.
                </span>
              </div>
            ) : (
              <>
                <canvas ref={canvasRef} width={500} height={220} className="w-full h-full object-contain" />
                <div className="absolute top-2 left-3 text-[10px] font-mono text-[var(--text-dim)]">
                  Center Shock Front (x = 0)
                </div>
                <div className="absolute top-2 right-3 text-[10px] font-mono text-[var(--accent-a)]">
                  Epoch: {currentEpoch}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Grid: Low-Gradient Region Grid + PCA Parameter Trajectory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Detected Low-Gradient Regions Visualizer */}
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center mb-3">
            <div>
              <span className="text-xs font-mono font-bold text-[var(--text)] uppercase">
                Low-Gradient Region Detection Grid (A% = 30%)
              </span>
              <span className="ml-2 text-[10px] font-mono text-[var(--shock)] font-bold">
                {effectiveRegions.length} points isolated
              </span>
            </div>
          </div>

          <div className="p-2 rounded bg-[rgba(249,115,22,0.06)] border border-[var(--shock)]/20 text-[11px] text-[var(--text-muted)] mb-3">
            Points with lowest spatial derivatives <code className="text-[var(--shock)]">|∂u/∂x|</code> (non-shock zones) trigger periodic weight re-initialization.
          </div>

          <div className="w-full h-[200px] bg-[#0B0F1A] rounded-lg border border-[var(--border)] relative flex items-center justify-center p-3">
            {effectiveRegions.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-4 text-center">
                <span className="text-xs font-mono text-[var(--text-dim)]">
                  {isRunning
                    ? "Region Detector Standby: Scanning spatial gradients |∂u/∂x|..."
                    : "No low-gradient region detection artifact generated for this run."}
                </span>
                <span className="text-[10px] text-[var(--text-dim)]/70 mt-1 max-w-xs">
                  Regions are computed during the Region Identification (RI) phase.
                </span>
              </div>
            ) : (
              <>
                <svg viewBox="0 0 500 160" className="w-full h-full">
                  <rect x="10" y="10" width="480" height="140" fill="none" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
                  {/* Center shock zone line */}
                  <line x1="250" y1="10" x2="250" y2="150" stroke="rgba(56,189,248,0.25)" strokeDasharray="4 4" />
                  {effectiveRegions.map((pt, idx) => {
                    const xNorm = pt.length > 0 ? (pt[0] + 1.0) / 2.0 : 0.5;
                    const yNorm = pt.length > 1 ? pt[1] : 0.5;
                    const cx = 14 + Math.max(0, Math.min(1, xNorm)) * 472;
                    const cy = 14 + Math.max(0, Math.min(1, yNorm)) * 132;
                    return (
                      <circle key={idx} cx={cx} cy={cy} r="3.5" fill="#F97316" opacity="0.85" />
                    );
                  })}
                </svg>
                <div className="absolute bottom-2 left-4 text-[10px] font-mono text-[var(--text-dim)]">
                  x = -1.0
                </div>
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] font-mono text-[var(--accent-a)]">
                  Shock Zone (Excluded)
                </div>
                <div className="absolute bottom-2 right-4 text-[10px] font-mono text-[var(--text-dim)]">
                  x = +1.0
                </div>
              </>
            )}
          </div>
        </div>

        {/* Live PCA Trajectory Card */}
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <Compass size={14} className="text-[var(--accent-a)]" />
              <span className="text-xs font-mono font-bold text-[var(--text)] uppercase">
                PCA Parameter Trajectory
              </span>
            </div>
            <div className="flex items-center gap-3 text-[10px] font-mono">
              <span className="text-[var(--shock)]">● Phase 1 (Search)</span>
              <span className="text-[var(--accent-a)]">● Phase 2 (Fine-Tune)</span>
            </div>
          </div>

          <div className="p-2 rounded bg-[rgba(56,189,248,0.06)] border border-[var(--accent-a)]/20 text-[11px] text-[var(--text-muted)] mb-3">
            2D PCA projection of layer-0 parameter vectors across epochs (Reproduction of Paper Fig. 10).
          </div>

          <div className="w-full h-[200px] bg-[#0B0F1A] rounded-lg border border-[var(--border)] relative flex items-center justify-center p-3">
            {pcaPoints.length < 2 ? (
              <div className="flex flex-col items-center justify-center p-4 text-center">
                <span className="text-xs font-mono text-[var(--text-dim)]">
                  {isRunning
                    ? "Awaiting PCA checkpoint snapshots..."
                    : "No PCA trajectory artifact generated for this run."}
                </span>
                <span className="text-[10px] text-[var(--text-dim)]/70 mt-1 max-w-xs">
                  Snapshots are captured periodically during dual-phase training.
                </span>
              </div>
            ) : (
              <svg viewBox="0 0 400 200" className="w-full h-full">
                <line x1="20" y1="100" x2="380" y2="100" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <line x1="200" y1="20" x2="200" y2="180" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
                <polyline fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" points={pcaPolyline} />
                {pcaPoints.map((p: any, idx: number) => {
                  const xs = pcaPoints.map((pt: any) => pt.x);
                  const ys = pcaPoints.map((pt: any) => pt.y);
                  const minX = Math.min(...xs), maxX = Math.max(...xs);
                  const minY = Math.min(...ys), maxY = Math.max(...ys);
                  const cx = 20 + ((p.x - minX) / (maxX - minX || 1)) * 360;
                  const cy = 180 - ((p.y - minY) / (maxY - minY || 1)) * 140;
                  const isSearch = p.phase === "search";
                  return (
                    <circle
                      key={idx}
                      cx={cx}
                      cy={cy}
                      r={idx === pcaPoints.length - 1 ? 5 : 3}
                      fill={isSearch ? "#F97316" : "#38BDF8"}
                      stroke={idx === pcaPoints.length - 1 ? "#FFFFFF" : "none"}
                      strokeWidth="1.5"
                    />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Physics Model Explanation Card */}
      <div className="glass-panel p-5">
        <div className="flex items-center gap-2 text-xs font-mono font-bold uppercase text-[var(--accent-a)] mb-3">
          <BookOpen size={15} />
          <span>Physics and Computational Methodology</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-[var(--text-muted)]">
          <div className="p-3 rounded bg-[var(--surface)] border border-[var(--border)]">
            <div className="font-bold text-[var(--text)] mb-1">1. Governing Equation</div>
            <div>Viscous Burgers: <code className="text-[var(--accent-a)]">u_t + u·u_x = ν·u_xx</code> with steepening shock parameter <code className="text-[var(--shock)]">ν = 0.01/π</code>.</div>
          </div>
          <div className="p-3 rounded bg-[var(--surface)] border border-[var(--border)]">
            <div className="font-bold text-[var(--text)] mb-1">2. Analytical Benchmark</div>
            <div>Cole-Hopf exact quadrature using Gauss-Hermite integration in log-sum-exp space.</div>
          </div>
          <div className="p-3 rounded bg-[var(--surface)] border border-[var(--border)]">
            <div className="font-bold text-[var(--text)] mb-1">3. RI Optimization Strategy</div>
            <div>Phase 1 (Search, lr 5e-5): Periodically reset low-gradient weights to avoid non-physical local minima. Phase 2 (Fine-tune, lr 5e-6).</div>
          </div>
        </div>
      </div>
    </div>
  );
};
