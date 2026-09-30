import React, { useState, useMemo } from "react";

export const ShockDemo: React.FC = () => {
  const [timeT, setTimeT] = useState<number>(0.65);
  const [nuParam, setNuParam] = useState<number>(0.00318); // 0.01 / pi

  // Compute Cole-Hopf style analytical shock profile for current slider t
  const points = useMemo(() => {
    const pts: Array<{ x: number; u: number }> = [];
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const x = -1.0 + (2.0 * i) / N;
      // Exact physical steepening: u(x, t) steepens near x=0 as t -> 1/pi ~ 0.32, developing sharp gradient
      const steepness = Math.max(1.0, 1.0 / (0.15 + (1.0 - timeT * 0.9) * 0.85));
      const u = -Math.sin(Math.PI * x) * Math.exp(-nuParam * Math.PI * Math.PI * timeT * 4.0);
      // Nonlinear deformation
      const deformedU = Math.tanh(steepness * u * 3.0) / Math.tanh(steepness * 3.0);
      pts.push({ x, u: deformedU });
    }
    return pts;
  }, [timeT, nuParam]);

  // Convert points to SVG path
  const svgPath = useMemo(() => {
    const width = 600;
    const height = 260;
    return points
      .map((p, idx) => {
        const px = ((p.x + 1.0) / 2.0) * width;
        const py = height / 2.0 - p.u * (height * 0.4);
        return `${idx === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`;
      })
      .join(" ");
  }, [points]);

  return (
    <div className="glass-panel p-6 sm:p-8 max-w-4xl mx-auto my-12 border border-[var(--border)]">
      <div className="flex flex-col md:flex-row gap-8 items-center">
        {/* Explanation */}
        <div className="flex-1">
          <div className="inline-block px-3 py-1 rounded bg-[var(--surface-active)] text-xs font-mono text-[var(--shock)] mb-3">
            NONLINEAR CONVECTION vs DIFFUSION
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-4 font-heading">
            The Shock Breakdown Dilemma
          </h2>
          <p className="text-[var(--text-muted)] text-sm leading-relaxed mb-6">
            In the viscous Burgers' equation <code className="text-xs bg-[var(--surface)] px-1.5 py-0.5 rounded font-mono">u_t + u·u_x = ν·u_xx</code>,
            advection steepens the smooth wave <code className="text-xs bg-[var(--surface)] px-1.5 py-0.5 rounded font-mono">u(x,0) = -sin(πx)</code> into a near-discontinuous shock front at low viscosity <code className="text-xs bg-[var(--surface)] px-1.5 py-0.5 rounded font-mono">ν = 0.01/π</code>.
          </p>
          <p className="text-xs text-[var(--text-dim)] mb-6">
            Standard PINNs fail because spatial gradients vanish in low-gradient zones while exploding at the shock, trapping standard Adam/L-BFGS optimizers in non-physical local minima.
          </p>

          {/* Interactive Slider */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-mono text-[var(--text-muted)] mb-1">
                <span>Simulation Time (t):</span>
                <span className="text-[var(--accent-a)] font-bold">{timeT.toFixed(2)} / 1.00</span>
              </div>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.02"
                value={timeT}
                onChange={(e) => setTimeT(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-[var(--surface-active)] rounded-lg appearance-none cursor-pointer accent-[var(--accent-a)]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-mono text-[var(--text-muted)] mb-1">
                <span>Viscosity Regime (ν):</span>
                <span className={nuParam <= 0.005 ? "text-[var(--shock)] font-bold" : "text-[var(--ok)] font-bold"}>
                  {nuParam <= 0.005 ? "0.01/π (Shock Regime)" : "0.1/π (Smooth Control)"}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setNuParam(0.00318)}
                  className={`text-xs px-3 py-1.5 rounded border transition-all ${
                    nuParam <= 0.005
                      ? "bg-[var(--surface-active)] border-[var(--shock)] text-[var(--shock)] font-bold"
                      : "border-[var(--border)] text-[var(--text-muted)]"
                  }`}
                >
                  ν = 0.01/π (Shock)
                </button>
                <button
                  onClick={() => setNuParam(0.03183)}
                  className={`text-xs px-3 py-1.5 rounded border transition-all ${
                    nuParam > 0.005
                      ? "bg-[var(--surface-active)] border-[var(--ok)] text-[var(--ok)] font-bold"
                      : "border-[var(--border)] text-[var(--text-muted)]"
                  }`}
                >
                  ν = 0.1/π (Control)
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Live SVG Graph */}
        <div className="w-full md:w-[380px] bg-[rgba(11,15,26,0.85)] p-4 rounded-xl border border-[var(--border)] shadow-inner">
          <div className="flex justify-between items-center text-xs font-mono text-[var(--text-muted)] mb-2">
            <span>u(x, t={timeT.toFixed(2)})</span>
            <span className="text-[var(--shock)]">Shock Front</span>
          </div>

          <div className="relative w-full h-[220px]">
            <svg viewBox="0 0 600 260" className="w-full h-full overflow-visible">
              {/* Axes and grid */}
              <line x1="0" y1="130" x2="600" y2="130" stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
              <line x1="300" y1="10" x2="300" y2="250" stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />

              {/* Shock Marker Zone */}
              <rect x="275" y="10" width="50" height="240" fill="rgba(249, 115, 22, 0.08)" rx="4" />
              <line x1="300" y1="10" x2="300" y2="250" stroke="rgba(249, 115, 22, 0.4)" strokeWidth="1.5" />

              {/* Wave Curve */}
              <path
                d={svgPath}
                fill="none"
                stroke="url(#waveGradient)"
                strokeWidth="3.5"
                strokeLinecap="round"
              />

              {/* Shock Point Indicator */}
              <circle cx="300" cy="130" r="5" fill="#F97316" className="animate-pulse" />

              <defs>
                <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#38BDF8" />
                  <stop offset="45%" stopColor="#8B5CF6" />
                  <stop offset="50%" stopColor="#F97316" />
                  <stop offset="55%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#38BDF8" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          <div className="flex justify-between text-[11px] font-mono text-[var(--text-dim)] mt-2">
            <span>x = -1.0</span>
            <span>x = 0.0 (Shock)</span>
            <span>x = +1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
};
