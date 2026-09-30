import React, { useState } from "react";
import { Sparkles, Scan, RotateCcw } from "lucide-react";

export const HowItWorks: React.FC = () => {
  const [activeStep, setActiveStep] = useState<number>(1);

  const steps = [
    {
      num: 1,
      title: "Collocation & Standard Training",
      icon: Sparkles,
      desc: "LHS samples space-time points across the domain. The network minimizes the physics PDE residual L_PDE alongside Dirichlet boundary and initial condition losses.",
      formula: "L = L_PDE + λ_BC·L_BC + L_IC",
    },
    {
      num: 2,
      title: "Detect Low-Gradient Regions (A%)",
      icon: Scan,
      desc: "Every 2,000 epochs, the region detector evaluates spatial and temporal gradient magnitudes Σ|∂V_j/∂X_i|. The lowest 30% low-gradient points are isolated.",
      formula: "X_dr = argmin_{30%} ( Σ |∂V_j / ∂X_i| )",
    },
    {
      num: 3,
      title: "Re-Initialization Loss Active",
      icon: RotateCcw,
      desc: "For 500 epochs, random targets R ~ U[-1,1] are assigned to X_dr. This breaks optimizer stagnation and forces the network parameters to escape trivial local minima.",
      formula: "L_RI = (1/N_dr) · Σ |R(x_dr) - NN(x_dr)|²",
    },
  ];

  return (
    <div className="max-w-5xl mx-auto px-6 my-16">
      <div className="text-center mb-12">
        <div className="inline-block px-3 py-1 rounded bg-[var(--surface-active)] text-xs font-mono text-[var(--accent-a)] mb-3">
          SCIENTIFIC MECHANISM · LEE ET AL. (2025)
        </div>
        <h2 className="text-3xl sm:text-4xl font-bold font-heading">
          How Re-Initialization (RI-PINN) Works
        </h2>
        <p className="text-[var(--text-muted)] max-w-xl mx-auto text-sm mt-3">
          A systematic two-phase optimization protocol engineered to conquer stiff fluid flow dynamics without cherry-picking.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {steps.map((s) => {
          const Icon = s.icon;
          const isSelected = activeStep === s.num;
          return (
            <div
              key={s.num}
              onClick={() => setActiveStep(s.num)}
              className={`glass-panel p-6 cursor-pointer transition-all relative overflow-hidden ${
                isSelected
                  ? "border-[var(--accent-a)] shadow-[0_0_25px_var(--glow-cyan)] transform -translate-y-1"
                  : "hover:border-[var(--border-strong)]"
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm ${
                    isSelected
                      ? "bg-gradient-to-br from-[var(--accent-a)] to-[var(--accent-b)] text-white shadow-md"
                      : "bg-[var(--surface)] text-[var(--text-muted)]"
                  }`}
                >
                  0{s.num}
                </div>
                <Icon size={20} className={isSelected ? "text-[var(--accent-a)]" : "text-[var(--text-dim)]"} />
              </div>

              <h3 className="text-lg font-bold mb-2 font-heading">{s.title}</h3>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed mb-4">{s.desc}</p>

              <div className="bg-[rgba(11,15,26,0.9)] p-2.5 rounded font-mono text-[11px] text-[var(--accent-a)] border border-[var(--border)] overflow-x-auto">
                {s.formula}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
