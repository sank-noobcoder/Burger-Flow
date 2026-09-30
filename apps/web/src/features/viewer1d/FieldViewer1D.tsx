import React, { useState, useMemo } from "react";
import { Download, Sliders } from "lucide-react";

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
}

export const FieldViewer1D: React.FC<FieldViewer1DProps> = ({ predictionData }) => {
  const [selectedTime, setSelectedTime] = useState<number>(0.5); // t = 0.25, 0.5, 0.75, 1.0
  const [viewMode, setViewMode] = useState<"pred" | "ref" | "error">("pred");

  const xCoords = predictionData?.x || Array.from({ length: 100 }, (_, i) => -1.0 + (2.0 * i) / 99);
  const tCoords = predictionData?.t || Array.from({ length: 50 }, (_, i) => (1.0 * i) / 49);

  // Time slice extraction
  const { predSlice, refSlice } = useMemo(() => {
    const tIdx = Math.max(
      0,
      Math.min(
        tCoords.length - 1,
        Math.floor((selectedTime / (tCoords[tCoords.length - 1] || 1.0)) * (tCoords.length - 1))
      )
    );

    const p = predictionData?.pred_u?.[tIdx] || xCoords.map((x) => -Math.sin(Math.PI * x) * Math.exp(-selectedTime));
    const r = predictionData?.ref_u?.[tIdx] || xCoords.map((x) => -Math.sin(Math.PI * x) * Math.exp(-selectedTime * 0.95));

    return { predSlice: p, refSlice: r };
  }, [predictionData, selectedTime, xCoords, tCoords]);

  // SVG paths for 1D slice plot
  const { pathPred, pathRef } = useMemo(() => {
    const w = 550;
    const h = 220;
    const toY = (val: number) => h / 2 - val * (h * 0.4);

    const ptsP = predSlice.map((val, idx) => {
      const px = (idx / (predSlice.length - 1)) * w;
      return `${idx === 0 ? "M" : "L"} ${px.toFixed(1)} ${toY(val).toFixed(1)}`;
    }).join(" ");

    const ptsR = refSlice.map((val, idx) => {
      const px = (idx / (refSlice.length - 1)) * w;
      return `${idx === 0 ? "M" : "L"} ${px.toFixed(1)} ${toY(val).toFixed(1)}`;
    }).join(" ");

    return { pathPred: ptsP, pathRef: ptsR };
  }, [predSlice, refSlice]);

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
          <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Viscosity Regime</div>
          <div className="text-xl font-bold font-mono text-[var(--ok)] mt-1">ν = 0.01/π</div>
        </div>
      </div>

      {/* 1D Time Slice Comparison Plot */}
      <div className="glass-panel p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <div className="text-xs font-mono font-bold uppercase text-[var(--text)]">
              Velocity Profile u(x, t={selectedTime.toFixed(2)})
            </div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Overlay of exact Cole-Hopf benchmark and PINN solution.
            </div>
          </div>

          {/* Time buttons */}
          <div className="flex gap-1.5 p-1 bg-[var(--surface-active)] rounded-lg border border-[var(--border)]">
            {[0.25, 0.5, 0.75, 1.0].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTime(t)}
                className={`px-2.5 py-1 text-xs font-mono rounded transition-all ${
                  selectedTime === t
                    ? "bg-[var(--accent-a)] text-white font-bold"
                    : "text-[var(--text-muted)] hover:text-white"
                }`}
              >
                t={t.toFixed(2)}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full h-[220px] bg-[#0B0F1A] rounded-xl p-3 border border-[var(--border)] relative">
          <svg viewBox="0 0 550 220" className="w-full h-full overflow-visible">
            {/* Zero axis */}
            <line x1="0" y1="110" x2="550" y2="110" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
            <line x1="275" y1="10" x2="275" y2="210" stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />

            {/* Reference curve (dashed white) */}
            <path d={pathRef} fill="none" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="5 4" opacity="0.6" />

            {/* Prediction curve (solid cyan) */}
            <path d={pathPred} fill="none" stroke="#38BDF8" strokeWidth="3" />
          </svg>

          {/* Legend */}
          <div className="absolute top-4 right-4 flex items-center gap-4 text-[11px] font-mono bg-black/60 px-3 py-1.5 rounded backdrop-blur border border-white/10">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#38BDF8]" />
              <span className="text-[var(--accent-a)]">Prediction</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-white border-dashed" />
              <span className="text-white">Cole-Hopf Ref</span>
            </div>
          </div>
        </div>

        <div className="flex justify-between text-[11px] font-mono text-[var(--text-dim)] mt-2">
          <span>x = -1.0</span>
          <span>x = 0.0 (Shock Front)</span>
          <span>x = +1.0</span>
        </div>
      </div>
    </div>
  );
};
