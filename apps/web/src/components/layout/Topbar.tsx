import React, { useState } from "react";
import { Waves, PlusCircle, LayoutDashboard, GitCompare, Shield, Moon, Sun, User, LogIn, LogOut, X, Sparkles } from "lucide-react";

interface TopbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  quota?: { gpu_minutes_used: number; gpu_minutes_limit: number; active_jobs: number; max_active_jobs: number } | null;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  userEmail?: string | null;
  userRole?: string | null;
  onLogin: (email: string, pass: string) => Promise<void>;
  onLogout: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  currentView,
  onNavigate,
  quota,
  theme,
  onToggleTheme,
  userEmail = null,
  userRole = null,
  onLogin,
  onLogout,
}) => {
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [emailInput, setEmailInput] = useState<string>("");
  const [passInput, setPassInput] = useState<string>("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await onLogin(emailInput, passInput);
      setShowLoginModal(false);
      setEmailInput("");
      setPassInput("");
    } catch (err: any) {
      setLoginError(err.message || "Invalid email or password");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleQuickSwitch = async (email: string, pass: string) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      await onLogin(email, pass);
      setShowLoginModal(false);
    } catch (err: any) {
      setLoginError(err.message || "Quick switch failed");
    } finally {
      setIsLoggingIn(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--bg)]/90 backdrop-blur-xl border-b border-[var(--border)] px-4 lg:px-8 py-2.5 transition-colors shadow-sm text-[var(--text)]">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Brand Logo & Wordmark */}
        <div
          onClick={() => onNavigate("landing")}
          className="flex items-center gap-3 cursor-pointer select-none group"
        >
          <div className="relative flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-tr from-[var(--accent-a)] to-[var(--accent-b)] text-white shadow-md group-hover:scale-105 transition-all">
            <Waves size={20} className="group-hover:rotate-6 transition-transform" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-extrabold font-heading tracking-tight text-[var(--text)] group-hover:text-[var(--accent-a)] transition-colors">
                BurgersFlow
              </span>
              <span className="text-[9px] font-mono tracking-wider uppercase text-[var(--accent-a)] font-semibold px-2 py-0.5 rounded-full bg-[var(--accent-a)]/10 border border-[var(--accent-a)]/25">
                PINN Studio
              </span>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)] -mt-0.5 hidden sm:inline">
              Scientific Viscous PDE Solver
            </span>
          </div>
        </div>

        {/* Center Floating Navigation Pill */}
        <nav className="hidden md:flex items-center gap-1 bg-[var(--surface)] backdrop-blur-xl p-1.5 rounded-full border border-[var(--border)] shadow-inner">
          <button
            onClick={() => onNavigate("landing")}
            className={`px-3.5 py-1.5 text-xs rounded-full transition-all flex items-center gap-1.5 ${
              currentView === "landing"
                ? "bg-[var(--accent-a)]/15 border border-[var(--accent-a)]/40 text-[var(--accent-a)] font-bold shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            <Sparkles size={13} />
            <span>Overview</span>
          </button>

          <button
            onClick={() => onNavigate("dashboard")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full transition-all ${
              currentView === "dashboard"
                ? "bg-[var(--accent-a)]/15 border border-[var(--accent-a)]/40 text-[var(--accent-a)] font-bold shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            <LayoutDashboard size={13} />
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => onNavigate("wizard")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full transition-all ${
              currentView === "wizard"
                ? "bg-gradient-to-r from-[var(--accent-a)] to-[var(--accent-b)] text-white font-bold shadow-md"
                : "text-[var(--accent-a)] hover:bg-[var(--accent-a)]/10 font-semibold"
            }`}
          >
            <PlusCircle size={13} />
            <span>New Run</span>
          </button>

          <button
            onClick={() => onNavigate("compare")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full transition-all ${
              currentView === "compare"
                ? "bg-[var(--accent-a)]/15 border border-[var(--accent-a)]/40 text-[var(--accent-a)] font-bold shadow-sm"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            }`}
          >
            <GitCompare size={13} />
            <span>Compare</span>
          </button>

          <button
            onClick={() => onNavigate("admin")}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full transition-all ${
              currentView === "admin"
                ? "bg-[var(--shock)]/15 border border-[var(--shock)]/40 text-[var(--shock)] font-bold shadow-sm"
                : userRole === "admin"
                ? "text-[var(--shock)] hover:bg-[var(--shock)]/10 font-semibold"
                : "text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)]"
            }`}
            title={userRole === "admin" ? "Admin Console" : "Admin Portal"}
          >
            <Shield size={13} />
            <span>Admin Portal</span>
            {userRole === "admin" && (
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--shock)] animate-pulse" />
            )}
          </button>
        </nav>

        {/* Right Section: Telemetry & User Capsule */}
        <div className="flex items-center gap-2.5">
          
          {/* Telemetry Indicator */}
          {quota && (
            <div className="hidden xl:flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-xs font-mono shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent-a)] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent-a)]"></span>
              </span>
              <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <span>GPU:</span>
                <span className="font-bold text-[var(--accent-a)]">
                  {quota.gpu_minutes_used.toFixed(0)}/{quota.gpu_minutes_limit}m
                </span>
              </div>
              <span className="text-[var(--border-strong)]">|</span>
              <div className="flex items-center gap-1.5 text-[var(--text-muted)]">
                <span>Jobs:</span>
                <span className={quota.active_jobs > 0 ? "text-[var(--shock)] font-bold" : "text-[var(--text)] font-semibold"}>
                  {quota.active_jobs}/{quota.max_active_jobs}
                </span>
              </div>
            </div>
          )}

          {/* Theme Toggle Button */}
          <button
            onClick={onToggleTheme}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text)] transition-all shadow-sm"
            title="Toggle Light/Dark Theme"
          >
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          {/* User Account Capsule */}
          {userEmail ? (
            <div className="flex items-center bg-[var(--surface)] p-1 pr-1.5 rounded-full border border-[var(--border)] shadow-sm gap-1.5">
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex items-center gap-2 px-2.5 py-1 rounded-full hover:bg-[var(--surface-hover)] transition-all text-xs"
                title="Switch User Account"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] text-white shadow-sm ${
                  userRole === "admin" 
                    ? "bg-gradient-to-tr from-[var(--shock)] to-amber-500" 
                    : "bg-gradient-to-tr from-[var(--accent-a)] to-[var(--accent-b)]"
                }`}>
                  <User size={12} />
                </div>
                <div className="flex flex-col items-start text-left leading-none">
                  <span className="hidden sm:inline font-mono text-[var(--text)] font-semibold text-[11px]">
                    {userEmail.split("@")[0]}
                  </span>
                  <span className={`text-[8px] font-mono uppercase tracking-wider font-bold mt-0.5 ${
                    userRole === "admin" ? "text-[var(--shock)]" : "text-[var(--accent-a)]"
                  }`}>
                    {userRole === "admin" ? "Admin" : "Researcher"}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--text-dim)] font-mono ml-0.5">▾</span>
              </button>

              <button
                onClick={onLogout}
                className="w-7 h-7 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                title="Sign Out"
              >
                <LogOut size={13} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowLoginModal(true)}
              className="btn-primary text-xs flex items-center gap-1.5 shadow-md"
            >
              <LogIn size={13} />
              <span>Sign In</span>
            </button>
          )}

        </div>
      </div>

      {/* LOGIN / SWITCH ACCOUNT MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="glass-panel w-full max-w-md p-6 bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl relative text-[var(--text)]">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-2">
                <LogIn className="text-[var(--accent-a)]" size={20} />
                <h2 className="text-lg font-bold font-heading text-[var(--text)]">Sign In / Switch Account</h2>
              </div>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text)] transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {userEmail && (
              <div className="p-3 mb-4 rounded-xl bg-[var(--surface)] border border-[var(--border)] flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase">Currently Active</div>
                  <div className="text-xs font-mono text-[var(--text)] font-bold">{userEmail}</div>
                  <div className={`text-[10px] font-mono uppercase font-bold ${
                    userRole === "admin" ? "text-[var(--shock)]" : "text-[var(--accent-a)]"
                  }`}>
                    Role: {userRole}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    setShowLoginModal(false);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[var(--danger)]/10 text-[var(--danger)] border border-[var(--danger)]/30 hover:bg-[var(--danger)]/20 text-xs font-mono flex items-center gap-1.5 transition-all"
                >
                  <LogOut size={13} />
                  <span>Sign Out</span>
                </button>
              </div>
            )}

            {loginError && (
              <div className="p-3 mb-4 rounded-xl bg-[var(--danger)]/10 border border-[var(--danger)] text-[var(--danger)] text-xs font-mono">
                {loginError}
              </div>
            )}

            {/* Quick Switch Accounts */}
            <div className="mb-4">
              <div className="text-[11px] font-mono text-[var(--text-muted)] mb-2 uppercase">Quick Switch Accounts:</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickSwitch("researcher@burgersflow.org", "researcher123")}
                  className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent-a)] text-left transition-all group"
                >
                  <div className="text-xs font-bold text-[var(--text)] group-hover:text-[var(--accent-a)]">Researcher</div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">researcher@burgersflow.org</div>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickSwitch("admin@burgersflow.org", "admin123")}
                  className="p-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--shock)] text-left transition-all group"
                >
                  <div className="text-xs font-bold text-[var(--shock)] group-hover:text-[var(--shock)]">Admin</div>
                  <div className="text-[10px] font-mono text-[var(--text-muted)] truncate">admin@burgersflow.org</div>
                </button>
              </div>
            </div>

            <div className="relative my-4 text-center">
              <div className="border-t border-[var(--border)]" />
              <span className="relative -top-2.5 px-3 bg-[var(--bg)] text-[10px] font-mono text-[var(--text-muted)] uppercase">
                Or Sign In With Credentials
              </span>
            </div>

            <form onSubmit={handleLoginSubmit} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-[var(--text-muted)] mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="your.email@burgersflow.org"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent-a)] transition-colors"
                />
              </div>

              <div>
                <label className="block text-[var(--text-muted)] mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={passInput}
                  onChange={(e) => setPassInput(e.target.value)}
                  className="w-full bg-[var(--surface-hover)] border border-[var(--border)] rounded-xl px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent-a)] transition-colors"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className="btn-primary text-xs shadow-md transition-all disabled:opacity-50"
                >
                  {isLoggingIn ? "Logging in..." : "Log In"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
