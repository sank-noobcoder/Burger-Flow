import React from "react";
import { FlowHero } from "../../components/animation/FlowHero";
import { ShockDemo } from "../../components/animation/ShockDemo";
import { HowItWorks } from "../../components/animation/HowItWorks";
import { DimensionTogglePreview } from "../../components/animation/DimensionTogglePreview";
import { HonestCompareSlider } from "../../components/animation/HonestCompareSlider";
import { ShieldCheck, Cpu, Database, Award } from "lucide-react";

interface LandingViewProps {
  onLaunchExperiment: () => void;
  onExploreBenchmarks: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({
  onLaunchExperiment,
  onExploreBenchmarks,
}) => {
  return (
    <div className="w-full">
      {/* 1. Hero Section */}
      <FlowHero onExploreClick={onExploreBenchmarks} onLaunchClick={onLaunchExperiment} />

      {/* 2. The Shock Problem */}
      <ShockDemo />

      {/* 3. How RI-PINN Works */}
      <HowItWorks />

      {/* 4. 1D & 2D Unified Preview */}
      <DimensionTogglePreview />

      {/* 5. Honest Scientific Comparison */}
      <HonestCompareSlider />

      {/* 6. Built for Shared Research Labs */}
      <div className="max-w-5xl mx-auto px-6 my-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold font-heading">Built for Shared Research Infrastructure</h2>
          <p className="text-[var(--text-muted)] text-sm max-w-lg mx-auto mt-2">
            Rigorous security, multi-user resource quotas, and full experimental reproducibility out of the box.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="glass-panel p-6">
            <div className="w-10 h-10 rounded-lg bg-[rgba(56,189,248,0.1)] flex items-center justify-center text-[var(--accent-a)] mb-4">
              <Cpu size={20} />
            </div>
            <h3 className="text-base font-bold font-heading mb-2">GPU Quotas & Safe Concurrency</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Strict per-user GPU-minute budgets, active job concurrency limits, and request throttling protect shared compute resources.
            </p>
          </div>

          <div className="glass-panel p-6">
            <div className="w-10 h-10 rounded-lg bg-[rgba(139,92,246,0.1)] flex items-center justify-center text-[var(--accent-b)] mb-4">
              <ShieldCheck size={20} />
            </div>
            <h3 className="text-base font-bold font-heading mb-2">Hardened Defense-in-Depth</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Zero SQL injection via parameterized SQLAlchemy repositories, no unsafe deserialization (no pickle), and role-based access control.
            </p>
          </div>

          <div className="glass-panel p-6">
            <div className="w-10 h-10 rounded-lg bg-[rgba(34,197,94,0.1)] flex items-center justify-center text-[var(--ok)] mb-4">
              <Database size={20} />
            </div>
            <h3 className="text-base font-bold font-heading mb-2">Exact Reproducibility</h3>
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Every single run immutably persists random seed, YAML configuration, loss histories, and PCA parameter trajectories.
            </p>
          </div>
        </div>
      </div>

      {/* 7. Call to Action & Paper Citation Footer */}
      <div className="border-t border-[var(--border)] bg-[var(--bg-card)] backdrop-blur-md py-16 px-6 text-center relative overflow-hidden">
        <div className="max-w-3xl mx-auto relative z-10">
          <h2 className="text-3xl font-extrabold font-heading mb-4 text-[var(--text)]">
            Ready to explore physics-informed fluid flow?
          </h2>
          <p className="text-sm text-[var(--text-muted)] mb-8">
            Launch a 1D or 2D Burgers simulation in under two minutes with pre-validated presets.
          </p>

          <button onClick={onLaunchExperiment} className="btn-primary text-sm px-8 py-3.5 shadow-xl">
            Launch Your First Run →
          </button>

        </div>
      </div>
    </div>
  );
};
