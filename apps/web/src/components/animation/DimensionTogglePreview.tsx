import React, { useState, useEffect, useRef } from "react";
import { Layers, Activity } from "lucide-react";

export const DimensionTogglePreview: React.FC = () => {
  const [dim, setDim] = useState<1 | 2>(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let t = 0;

    const render = () => {
      t += 0.025;
      const w = canvas.width;
      const h = canvas.height;

      ctx.fillStyle = "#0B0F1A";
      ctx.fillRect(0, 0, w, h);

      if (dim === 1) {
        // 1D Spacetime Heatmap (t on y-axis, x on x-axis)
        const nx = 80;
        const nt = 50;
        const cellW = w / nx;
        const cellH = h / nt;

        for (let j = 0; j < nt; j++) {
          const tNorm = j / nt;
          for (let i = 0; i < nx; i++) {
            const xNorm = (i / nx) * 2 - 1;
            const steepness = 1.0 + tNorm * 3.5;
            const u = -Math.sin(Math.PI * xNorm) / (0.2 + Math.abs(xNorm) * (1.0 - tNorm * 0.7));
            const val = Math.max(-1, Math.min(1, u * 0.5)); // [-1, 1]

            // Color viridis map simulation
            const r = Math.floor(Math.max(0, val) * 249 + (1 - Math.abs(val)) * 30);
            const g = Math.floor((1 - Math.abs(val)) * 189 + Math.max(0, -val) * 100);
            const b = Math.floor(Math.max(0, -val) * 248 + Math.max(0, val) * 22);

            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(i * cellW, j * cellH, cellW + 1, cellH + 1);
          }
        }

        // Animated current time line
        const curY = (Math.sin(t) * 0.5 + 0.5) * h;
        ctx.strokeStyle = "#F97316";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(0, curY);
        ctx.lineTo(w, curY);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // 2D Gaussian Pulse Fluid Field (x, y) with advection ripples
        const nx = 40;
        const ny = 40;
        const cellW = w / nx;
        const cellH = h / ny;
        const pulseCenter = 0.5 + Math.sin(t * 0.8) * 0.08;

        for (let j = 0; j < ny; j++) {
          const y = j / ny;
          for (let i = 0; i < nx; i++) {
            const x = i / nx;
            const r2 = (x - pulseCenter) ** 2 + (y - pulseCenter) ** 2;
            const speed = Math.exp(-r2 / (2 * 0.08 ** 2)) * Math.sin(Math.PI * x) * Math.sin(Math.PI * y);

            const r = Math.floor(speed * 249 + (1 - speed) * 15);
            const g = Math.floor(speed * 115 + (1 - speed) * 35);
            const b = Math.floor((1 - speed) * 180 + speed * 22);

            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fillRect(i * cellW, j * cellH, cellW + 1, cellH + 1);
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, [dim]);

  return (
    <div className="glass-panel p-6 sm:p-8 max-w-4xl mx-auto my-12 border border-[var(--border)]">
      <div className="flex flex-col sm:flex-row items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold font-heading">Dimension Architecture: 1D & 2D Unified</h2>
          <p className="text-xs text-[var(--text-muted)] mt-1">
            Same clean API, same two-phase trainer, dimension-specialized visualizers.
          </p>
        </div>

        {/* Dimension Pill Toggle */}
        <div className="flex p-1 bg-[var(--surface-active)] rounded-lg border border-[var(--border)]">
          <button
            onClick={() => setDim(1)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              dim === 1
                ? "bg-[var(--accent-a)] text-white shadow-sm"
                : "text-[var(--text-muted)] hover:text-white"
            }`}
          >
            <Activity size={14} />
            <span>1D Burgers (x, t → u)</span>
          </button>
          <button
            onClick={() => setDim(2)}
            className={`flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
              dim === 2
                ? "bg-[var(--accent-b)] text-white shadow-sm"
                : "text-[var(--text-muted)] hover:text-white"
            }`}
          >
            <Layers size={14} />
            <span>2D Burgers (x, y, t → u, v)</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Canvas Display */}
        <div className="relative rounded-xl overflow-hidden border border-[var(--border)] shadow-inner h-[260px] bg-black">
          <canvas ref={canvasRef} width={400} height={260} className="w-full h-full object-cover" />
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] font-mono text-[var(--accent-a)] border border-white/10">
            {dim === 1 ? "Space-Time x-t Heatmap" : "2D Velocity Field Scrubber"}
          </div>
          <div className="absolute bottom-3 right-3 px-2 py-0.5 rounded bg-black/60 backdrop-blur text-[10px] font-mono text-[var(--shock)] border border-white/10">
            Live Field Simulation
          </div>
        </div>

        {/* Feature Specs */}
        <div className="space-y-4">
          {dim === 1 ? (
            <>
              <div className="p-3.5 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="text-xs font-bold text-[var(--accent-a)] font-mono">1D VISCOUS BURGERS</div>
                <div className="text-sm font-semibold mt-1">u_t + u·u_x = ν·u_xx</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  Evaluates against the exact Cole-Hopf log-sum-exp quadrature solver. Features moving shock front marker and slice plots at t = 0.25, 0.50, 0.75, 1.00.
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="text-xs font-bold text-[var(--shock)] font-mono">SHOCK POSITION ERROR</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  Monitors exact sub-grid shock location differences: max |du/dx| at critical times.
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="p-3.5 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="text-xs font-bold text-[var(--accent-b)] font-mono">2D COUPLED BURGERS</div>
                <div className="text-sm font-semibold mt-1">u_t + u·u_x + v·u_y = ν(u_xx + u_yy)</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  Coupled nonlinear momentum equations. High-resolution SSP-RK3 finite difference solver with grid-independence validation.
                </div>
              </div>
              <div className="p-3.5 rounded-lg bg-[var(--surface)] border border-[var(--border)]">
                <div className="text-xs font-bold text-[var(--ok)] font-mono">MAGNITUDE & STREAMLINES</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">
                  Speed magnitude √(u² + v²), velocity vectors, vorticity shader, and interactive time scrubber.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
