import React from "react";
import { Waves, PlusCircle, LayoutDashboard, GitCompare, Shield, Moon, Sun, User } from "lucide-react";

interface TopbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  quota?: { gpu_minutes_used: number; gpu_minutes_limit: number; active_jobs: number; max_active_jobs: number };
  theme: "dark" | "light";
  onToggleTheme: () => void;
  userEmail?: string;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentView,
  onNavigate,
  quota,
  theme,
  onToggleTheme,
  userEmail = "researcher@burgersflow.org"
}) => {
  return (
    <header className="sticky top-0 z-50 bg-[var(--bg)]/80 backdrop-blur-md border-b border-[var(--border)] px-6 py-3 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div
          onClick={() => onNavigate("landing")}
          className="flex items-center gap-2.5 cursor-pointer select-none group"
        >
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[var(--accent-a)] to-[var(--accent-b)] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
            <Waves size={20} />
          </div>
          <div>
            <div className="font-bold text-base font-heading flex items-center gap-1.5">
              <span>BurgersFlow</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--surface-active)] text-[var(--accent-a)] font-semibold border border-[var(--border)]">
                PINN STUDIO
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-[var(--surface)] p-1 rounded-xl border border-[var(--border)]">
          <button
            onClick={() => onNavigate("landing")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentView === "landing"
                ? "bg-[var(--surface-active)] text-[var(--text)] font-bold shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => onNavigate("dashboard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentView === "dashboard"
                ? "bg-[var(--surface-active)] text-[var(--text)] font-bold shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <LayoutDashboard size={14} />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => onNavigate("wizard")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentView === "wizard"
                ? "bg-[var(--accent-a)] text-white font-bold shadow-sm"
                : "text-[var(--accent-a)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            <PlusCircle size={14} />
            <span>New Run</span>
          </button>
          <button
            onClick={() => onNavigate("compare")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentView === "compare"
                ? "bg-[var(--surface-active)] text-[var(--text)] font-bold shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <GitCompare size={14} />
            <span>Compare</span>
          </button>
          <button
            onClick={() => onNavigate("admin")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              currentView === "admin"
                ? "bg-[var(--surface-active)] text-[var(--text)] font-bold shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            }`}
          >
            <Shield size={14} />
            <span>Admin</span>
          </button>
        </nav>

        {/* Right Section: Quotas, Theme Toggle, User */}
        <div className="flex items-center gap-3">
          {quota && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs font-mono">
              <span className="text-[var(--text-muted)]">GPU-min:</span>
              <span className="font-bold text-[var(--accent-a)]">
                {quota.gpu_minutes_used.toFixed(0)}/{quota.gpu_minutes_limit}
              </span>
              <span className="text-[var(--border-strong)]">|</span>
              <span className="text-[var(--text-muted)]">Active:</span>
              <span className={quota.active_jobs > 0 ? "text-[var(--shock)] font-bold" : "text-[var(--text)]"}>
                {quota.active_jobs}/{quota.max_active_jobs}
              </span>
            </div>
          )}

          {/* Theme Toggle */}
          <button
            onClick={onToggleTheme}
            className="p-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
            title="Toggle Light/Dark Theme"
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          {/* User Avatar */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-xs">
            <div className="w-5 h-5 rounded-full bg-[var(--accent-b)] text-white flex items-center justify-center font-bold text-[10px]">
              <User size={12} />
            </div>
            <span className="hidden sm:inline font-mono text-[var(--text-muted)]">{userEmail.split("@")[0]}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
