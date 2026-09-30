import React, { useMemo } from "react";
import { useRunStream } from "../../hooks/useRunStream";
import { AlertCircle, Activity, Disc, StopCircle, CheckCircle2, ArrowLeft } from "lucide-react";

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

  // Generate SVG loss polyline
  const svgLossPoints = useMemo(() => {
    if (metrics.length < 2) return "";
    const width = 600;
    const height = 200;

    // Use log10 loss for scaling
    const logLosses = metrics.map((m) => Math.log10(Math.max(1e-6, m.loss)));
    const minLog = Math.min(...logLosses);
    const maxLog = Math.max(...logLosses, minLog + 0.1);

    return metrics
      .map((m, idx) => {
        const x = (idx / (metrics.length - 1)) * width;
        const normY = (Math.log10(Math.max(1e-6, m.loss)) - minLog) / (maxLog - minLog);
        const y = height - normY * (height - 20) - 10;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
  }, [metrics]);

  const currentLoss = latestMetric?.loss || runDetails?.best_loss || 0.0;
  const currentEpoch = latestMetric?.epoch || runDetails?.epochs || 0;
  const patienceCount = latestMetric?.patience || 0;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Top Bar Navigation & Controls */}
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
              <h1 className="text-2xl font-bold font-heading">{runDetails?.name || "Training Monitor"}</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface-active)] text-[var(--accent-a)] border border-[var(--border)]">
                {runDetails?.dimension}D BURGERS
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">Run ID: {runId}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {runDetails?.status === "running" && (
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

      {/* Phase Banner */}
      <div className="glass-panel p-4 mb-6 flex flex-wrap items-center justify-between gap-4 border border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="text-xs font-mono text-[var(--text-muted)] uppercase">Training Phase:</div>
          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold font-mono ${
              currentPhase === "search"
                ? "bg-[rgba(249,115,22,0.15)] text-[var(--shock)] border border-[var(--shock)]/40"
                : "bg-[rgba(56,189,248,0.15)] text-[var(--accent-a)] border border-[var(--accent-a)]/40"
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                currentPhase === "search" ? "bg-[var(--shock)] animate-pulse" : "bg-[var(--accent-a)]"
              }`}
            />
            <span>Phase: {currentPhase.toUpperCase()}</span>
            {isRiActive && (
              <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-[var(--shock)] text-black font-extrabold">
                RI ACTIVE
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6 text-xs font-mono">
          <div>
            <span className="text-[var(--text-muted)]">Epoch: </span>
            <span className="text-[var(--text)] font-bold">{currentEpoch.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Best Loss: </span>
            <span className="text-[var(--accent-a)] font-bold">{currentLoss ? currentLoss.toExponential(3) : "—"}</span>
          </div>
          <div>
            <span className="text-[var(--text-muted)]">Patience: </span>
            <span className={patienceCount > 2000 ? "text-[var(--warn)] font-bold" : "text-[var(--ok)] font-bold"}>
              {patienceCount}/3,000
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Loss Graph & Region Detector Overlay */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Loss Curve with Sawtooth Explanation */}
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-[var(--text)] uppercase">Loss Evolution (Log Scale)</span>
              <div
                className="group relative cursor-pointer text-[var(--text-dim)] hover:text-white"
                title="Exploration Sawtooth Behavior"
              >
                <AlertCircle size={14} />
              </div>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)]">Total Loss (L_PDE + λ·L_BC + λ·L_RI)</span>
          </div>

          {/* Tooltip notice */}
          <div className="p-2.5 rounded bg-[rgba(56,189,248,0.06)] border border-[var(--accent-a)]/20 text-[11px] text-[var(--text-muted)] mb-3">
            <strong className="text-[var(--shock)]">Note:</strong> Sawtooth spikes are expected: re-initialization is actively resetting parameters in low-gradient zones to explore alternative minima.
          </div>

          <div className="w-full h-[220px] bg-[#0B0F1A] rounded-lg p-2 border border-[var(--border)] relative overflow-hidden">
            {metrics.length < 2 ? (
              <div className="w-full h-full flex items-center justify-center text-xs font-mono text-[var(--text-dim)]">
                Gathering epoch metric events...
              </div>
            ) : (
              <svg viewBox="0 0 600 200" className="w-full h-full">
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

        {/* Detected Low-Gradient Regions Visualizer */}
        <div className="glass-panel p-5">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-mono font-bold text-[var(--text)] uppercase">
              Detected Low-Gradient Regions (A% = 30%)
            </span>
            <span className="text-[10px] font-mono text-[var(--shock)] font-bold">
              {regionsSample.length > 0 ? `${regionsSample.length} points sampled` : "Monitoring"}
            </span>
          </div>

          <div className="p-2.5 rounded bg-[rgba(249,115,22,0.06)] border border-[var(--shock)]/20 text-[11px] text-[var(--text-muted)] mb-3">
            Paper Eq. 3: Identifies points with lowest spatial/temporal velocity derivatives <code className="font-mono text-xs">Σ|∂V_j/∂X_i|</code>.
          </div>

          <div className="w-full h-[220px] bg-[#0B0F1A] rounded-lg border border-[var(--border)] relative flex items-center justify-center p-3">
            {regionsSample.length === 0 ? (
              <div className="text-xs font-mono text-[var(--text-dim)] text-center">
                Awaiting detection cycle (every 2,000 epochs)...
              </div>
            ) : (
              <svg viewBox="0 0 400 200" className="w-full h-full">
                {/* Domain frame */}
                <rect x="20" y="20" width="360" height="160" fill="none" stroke="rgba(255,255,255,0.15)" strokeDasharray="3 3" />
                {/* Detected points */}
                {regionsSample.map((pt, idx) => {
                  // Normalize coordinates to svg width/height
                  const xNorm = pt.length > 0 ? (pt[0] + 1.0) / 2.0 : 0.5; // for x in [-1, 1]
                  const yNorm = pt.length > 1 ? pt[1] : 0.5; // for t in [0, 1]
                  const cx = 20 + xNorm * 360;
                  const cy = 20 + yNorm * 160;
                  return (
                    <circle
                      key={idx}
                      cx={cx}
                      cy={cy}
                      r="3.5"
                      fill="#F97316"
                      opacity="0.8"
                    />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
