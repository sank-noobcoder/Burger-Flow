import React, { useState, useEffect } from "react";
import { Topbar } from "./components/layout/Topbar";
import { Footer } from "./components/layout/Footer";
import { SplashScreen } from "./components/common/SplashScreen";
import { LandingView } from "./features/landing/LandingView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { WizardView } from "./features/wizard/WizardView";
import { RunDetailView } from "./features/results/RunDetailView";
import { CompareView } from "./features/compare/CompareView";
import { AdminView } from "./features/admin/AdminView";
import { api, setToken, getToken, getUser, logout } from "./lib/apiClient";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallbackView?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-xl mx-auto my-20 p-8 glass-panel text-center border border-red-500/30">
          <div className="w-12 h-12 rounded-xl bg-red-950/60 border border-red-500/40 text-red-400 flex items-center justify-center mx-auto mb-4 text-xl">
            ⚠️
          </div>
          <h3 className="text-lg font-bold font-heading mb-2 text-white">Application View Notice</h3>
          <p className="text-xs text-[var(--text-muted)] font-mono mb-6 max-w-md mx-auto">
            {this.state.error?.message || "An unexpected rendering event occurred in this view."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false });
              if (this.props.fallbackView) this.props.fallbackView();
              else window.location.reload();
            }}
            className="btn-primary text-xs mx-auto"
          >
            Reload Clean View
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<string>("landing");
  const [showSplash, setShowSplash] = useState<boolean>(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [runs, setRuns] = useState<any[]>([]);
  const [quota, setQuota] = useState<any | null>(null);
  
  const savedUser = getUser();
  const [userEmail, setUserEmail] = useState<string | null>(
    savedUser ? savedUser.email : "admin@burgersflow.org"
  );
  const [userRole, setUserRole] = useState<string | null>(
    savedUser ? savedUser.role : "admin"
  );

  // User Auth Handler
  const handleLogin = async (email: string, pass: string) => {
    sessionStorage.removeItem("burgersflow_logged_out");
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pass }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Login failed" }));
      throw new Error(err.detail || "Authentication failed. Check credentials.");
    }
    const authData = await res.json();
    setToken(authData.access_token, { id: authData.user_id, email: authData.email, role: authData.role });
    setUserEmail(authData.email);
    setUserRole(authData.role || "admin");

    // Refresh quota and runs for this specific user
    try {
      const q = await api<any>("/auth/me/quota");
      setQuota(q);
      const rList = await api<any[]>("/runs");
      setRuns(rList);
    } catch (e) {
      console.warn("Failed to fetch fresh user data after login", e);
    }
  };

  const handleLogout = () => {
    logout();
    sessionStorage.setItem("burgersflow_logged_out", "true");
    setUserEmail(null);
    setUserRole(null);
    setQuota(null);
    setRuns([]);
    setCurrentView("landing");
  };

  // Initial Auth & Data Fetching
  const refreshData = async () => {
    try {
      const token = getToken();
      if (!token) {
        if (sessionStorage.getItem("burgersflow_logged_out") === "true") {
          return;
        }
        await handleLogin("admin@burgersflow.org", "admin123");
        return;
      }
      const q = await api<any>("/auth/me/quota").catch(() => null);
      if (q) setQuota(q);
      const rList = await api<any[]>("/runs").catch(() => []);
      if (rList) setRuns(rList);
    } catch (err) {
      console.warn("API initialization notice", err);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(async () => {
      try {
        if (!getToken()) return;
        const q = await api<any>("/auth/me/quota").catch(() => null);
        if (q) setQuota(q);
        const rList = await api<any[]>("/runs").catch(() => null);
        if (rList) setRuns(rList);
      } catch (e) {}
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  const handleLaunchExperiment = async (configPayload: any) => {
    const res = await api<any>("/runs", {
      method: "POST",
      body: JSON.stringify(configPayload),
    });
    await refreshData();
    if (res?.run_id) {
      setSelectedRunId(res.run_id);
      setCurrentView("detail");
    } else {
      setCurrentView("dashboard");
    }
  };

  const handleCancelRun = async (runId: string) => {
    try {
      await api(`/runs/${runId}/cancel`, { method: "POST" });
      refreshData();
    } catch (err: any) {
      alert(err.message || "Failed to cancel run");
    }
  };

  const handleDeleteRun = async (runId: string) => {
    if (!confirm("Are you sure you want to delete this run and its artifacts?")) return;
    try {
      await api(`/runs/${runId}`, { method: "DELETE" });
      refreshData();
    } catch (err: any) {
      alert(err.message || "Failed to delete run");
    }
  };

  const handleSelectRun = (runId: string) => {
    setSelectedRunId(runId);
    setCurrentView("detail");
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)] transition-colors">
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <Topbar
        currentView={currentView}
        onNavigate={(view) => {
          setCurrentView(view);
          if (view !== "detail") setSelectedRunId(null);
        }}
        quota={quota}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        userEmail={userEmail}
        userRole={userRole}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />

      <main className="pb-12">
        <ErrorBoundary fallbackView={() => setCurrentView("dashboard")}>
          {currentView === "landing" && (
            <LandingView
              onLaunchExperiment={() => setCurrentView("wizard")}
              onExploreBenchmarks={() => setCurrentView("dashboard")}
            />
          )}

          {currentView === "dashboard" && (
            <DashboardView
              runs={runs}
              onNewRun={() => setCurrentView("wizard")}
              onSelectRun={handleSelectRun}
              onCancelRun={handleCancelRun}
              onDeleteRun={handleDeleteRun}
            />
          )}

          {currentView === "wizard" && (
            <WizardView
              onLaunch={handleLaunchExperiment}
              onCancel={() => setCurrentView("dashboard")}
            />
          )}

          {currentView === "detail" && selectedRunId && (
            <RunDetailView
              runId={selectedRunId}
              onBack={() => setCurrentView("dashboard")}
              onCancel={handleCancelRun}
            />
          )}

          {currentView === "compare" && <CompareView runs={runs} />}

          {currentView === "admin" && (
            <AdminView
              userRole={userRole || ""}
              userEmail={userEmail || ""}
              onNavigateDashboard={() => setCurrentView("dashboard")}
              onLoginAdmin={() => handleLogin("admin@burgersflow.org", "admin123")}
            />
          )}
        </ErrorBoundary>
      </main>

      <Footer onNavigate={setCurrentView} />
    </div>
  );
};
export default App;
