import React, { useState, useMemo } from "react";
import { Compass } from "lucide-react";

interface PCAPoint {
  epoch: number;
  phase: string;
  loss: number;
  x: number;
  y: number;
}

interface PCATrajectoryViewProps {
  pcaData?: {
    points: PCAPoint[];
    explained_variance: number[];
  };
}

export const PCATrajectoryView: React.FC<PCATrajectoryViewProps> = ({ pcaData }) => {
  const [selectedPoint, setSelectedPoint] = useState<PCAPoint | null>(null);

  const points = pcaData?.points || [];
  const variance = pcaData?.explained_variance || [0.0, 0.0];

  if (points.length === 0) {
    return (
      <div className="glass-panel p-12 text-center max-w-2xl mx-auto my-8 border border-[var(--border)]">
        <div className="w-12 h-12 rounded-xl bg-[var(--surface-active)] flex items-center justify-center text-[var(--accent-a)] mx-auto mb-3">
          <Compass size={24} />
        </div>
        <h3 className="text-base font-bold font-heading mb-1 text-[var(--text)]">No PCA Trajectory Recorded</h3>
        <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto font-mono">
          Layer-0 parameter vector snapshots are captured periodically during training. No PCA checkpoints are available for this run.
        </p>
      </div>
    );
  }

  // Scale coordinates to SVG viewBox (400x300)
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = xs.length ? Math.min(...xs) : -5;
  const maxX = xs.length ? Math.max(...xs) : 5;
  const minY = ys.length ? Math.min(...ys) : -5;
  const maxY = ys.length ? Math.max(...ys) : 5;

  const toSvgX = (x: number) => 30 + ((x - minX) / (maxX - minX || 1)) * 340;
  const toSvgY = (y: number) => 270 - ((y - minY) / (maxY - minY || 1)) * 240;

  const polylineStr = points.map((p) => `${toSvgX(p.x).toFixed(1)},${toSvgY(p.y).toFixed(1)}`).join(" ");

  return (
    <div className="glass-panel p-6 max-w-4xl mx-auto my-8 border border-[var(--border)]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h2 className="text-xl font-bold font-heading">PCA Parameter Trajectory</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            2D projection of layer-0 parameter vectors across training epochs (Paper Fig. 10 reproduction).
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--shock)]" />
            <span className="text-[var(--shock)]">Phase 1: Search</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent-a)]" />
            <span className="text-[var(--accent-a)]">Phase 2: Fine-Tune</span>
          </div>
        </div>
      </div>

      <div className="relative w-full h-[320px] bg-[#0B0F1A] rounded-xl border border-[var(--border)] p-4 flex items-center justify-center">
        {points.length < 2 ? (
          <div className="text-xs font-mono text-[var(--text-dim)]">
            Awaiting PCA checkpoint snapshots...
          </div>
        ) : (
          <svg viewBox="0 0 400 300" className="w-full h-full overflow-visible">
            {/* Axes */}
            <line x1="20" y1="150" x2="380" y2="150" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />
            <line x1="200" y1="20" x2="200" y2="280" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 3" />

            {/* Trajectory connecting path */}
            <polyline fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" points={polylineStr} />

            {/* Checkpoint Dots */}
            {points.map((p, idx) => {
              const cx = toSvgX(p.x);
              const cy = toSvgY(p.y);
              const isSearch = p.phase === "search";
              const isSelected = selectedPoint?.epoch === p.epoch;

              return (
                <circle
                  key={idx}
                  cx={cx}
                  cy={cy}
                  r={isSelected ? 6 : 3.5}
                  fill={isSearch ? "#F97316" : "#38BDF8"}
                  stroke={isSelected ? "#FFFFFF" : "none"}
                  strokeWidth="2"
                  className="cursor-pointer hover:scale-150 transition-transform"
                  onClick={() => setSelectedPoint(p)}
                />
              );
            })}
          </svg>
        )}

        {/* Selected Checkpoint Overlay Details */}
        {selectedPoint && (
          <div className="absolute top-4 left-4 bg-black/80 backdrop-blur p-3 rounded-lg border border-white/10 text-xs font-mono space-y-1">
            <div className="font-bold text-[var(--text)]">Epoch {selectedPoint.epoch}</div>
            <div className="text-[var(--text-muted)]">Phase: {selectedPoint.phase.toUpperCase()}</div>
            <div className="text-[var(--accent-a)]">Loss: {selectedPoint.loss.toExponential(3)}</div>
            <div className="text-[10px] text-[var(--text-dim)]">
              PCA: ({selectedPoint.x.toFixed(2)}, {selectedPoint.y.toFixed(2)})
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center text-xs font-mono text-[var(--text-dim)] mt-3">
        <span>PC 1 ({(variance[0] * 100).toFixed(1)}% explained var)</span>
        <span>PC 2 ({(variance[1] * 100).toFixed(1)}% explained var)</span>
      </div>
    </div>
  );
};
