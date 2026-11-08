import React from "react";
import { GraduationCap, Code2, Award, BookOpen, Layers } from "lucide-react";

interface FooterProps {
  onNavigate?: (view: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="w-full border-t border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur-xl text-[var(--text)] mt-16 transition-colors">
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-10">
          
          {/* Card 1: Academic Guidance */}
          <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent-a)]/40 transition-all shadow-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-500 flex items-center justify-center">
                <GraduationCap size={18} />
              </div>
              <div>
                <span className="text-[10px] font-mono tracking-wider uppercase text-[var(--text-muted)] block">
                  Academic Mentorship
                </span>
                <h4 className="text-sm font-bold text-[var(--text)] font-heading">
                  Guidance & Supervision
                </h4>
              </div>
            </div>

            <div className="space-y-1.5 pl-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-[var(--text)] font-heading">
                  Prof. (Dr.) Debashis Pal
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-500 border border-violet-500/30 font-semibold">
                  Grade 1 Professor
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] font-sans leading-relaxed">
                Department of Aerospace Engineering and Applied Mechanics
              </p>
              <div className="pt-1 flex items-center gap-1.5 text-xs font-mono text-[var(--accent-a)] font-semibold">
                <Award size={13} />
                <span>IIEST Shibpur</span>
                <span className="text-[10px] text-[var(--text-muted)] font-normal">
                  (Indian Institute of Engineering Science and Technology)
                </span>
              </div>
            </div>
          </div>

          {/* Card 2: Development & Implementation Team */}
          <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent-a)]/40 transition-all shadow-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-500 flex items-center justify-center">
                <Code2 size={18} />
              </div>
              <div>
                <span className="text-[10px] font-mono tracking-wider uppercase text-[var(--text-muted)] block">
                  Engineering & Research Team
                </span>
                <h4 className="text-sm font-bold text-[var(--text)] font-heading">
                  Developed & Implemented By
                </h4>
              </div>
            </div>

            <div className="space-y-2 pl-1">
              <div className="flex flex-wrap gap-2 text-xs font-mono">
                <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] font-semibold">
                  Sanket Ghorai
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] font-semibold">
                  Dipanjan Mondal
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text)] font-semibold">
                  Sankalan Chakraborty
                </span>
              </div>
              <div className="pt-1 flex items-center gap-1.5 text-xs font-mono text-[var(--ok)] font-semibold">
                <Layers size={13} />
                <span>RCCIIT</span>
                <span className="text-[10px] text-[var(--text-muted)] font-normal">
                  (RCC Institute of Information Technology, Kolkata)
                </span>
              </div>
            </div>
          </div>

          {/* Card 3: Research Basis & Citation */}
          <div className="p-5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent-a)]/40 transition-all shadow-sm md:col-span-2 lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center">
                <BookOpen size={18} />
              </div>
              <div>
                <span className="text-[10px] font-mono tracking-wider uppercase text-[var(--text-muted)] block">
                  Scientific Basis
                </span>
                <h4 className="text-sm font-bold text-[var(--text)] font-heading">
                  Research Benchmark
                </h4>
              </div>
            </div>

            <p className="text-xs text-[var(--text-muted)] leading-relaxed font-sans pl-1">
              Physics-Informed Neural Networks with Re-Initialization (RI-PINN) for stiff viscous Burgers fluid flows.
            </p>
            <div className="mt-2 pl-1 text-[11px] font-mono text-[var(--text-dim)]">
              Based on Lee et al., <strong className="text-[var(--text)]">Sci. Rep. 15:16740 (2025)</strong>
            </div>
          </div>

        </div>

        {/* Bottom Bar */}
        <div className="pt-6 border-t border-[var(--border)] flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-mono text-[var(--text-muted)]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--ok)] animate-pulse" />
            <span className="text-[var(--text)] font-semibold">BurgersFlow PINN Studio v3.1</span>
            <span className="text-[var(--border-strong)]">|</span>
            <span>Fluid Dynamics & Scientific AI Platform</span>
          </div>

          <div>
            <span>IIEST Shibpur &amp; RCCIIT Collaboration</span>
          </div>
        </div>
      </div>
    </footer>
  );
};
