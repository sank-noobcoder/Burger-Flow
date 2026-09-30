import React, { useState, useEffect } from "react";
import { Topbar } from "./components/layout/Topbar";
import { LandingView } from "./features/landing/LandingView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { WizardView } from "./features/wizard/WizardView";
import { RunDetailView } from "./features/results/RunDetailView";
import { CompareView } from "./features/compare/CompareView";
import { AdminView } from "./features/admin/AdminView";
import { api, setToken } from "./lib/apiClient";

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<string>("landing");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [runs, setRuns] = useState<any[]>([]);
  const [quota, setQuota] = useState<any | null>(null);
  const [userEmail, setUserEmail] = useState<string>("researcher@burgersflow.org");

  // Initial Auth & Data Fetching
  const refreshData = async () => {
    try {
      // Auto-authenticate as default researcher
      const loginRes = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "researcher@burgersflow.org", password: "researcher123" }),
      });
      if (loginRes.ok) {
        const authData = await loginRes.json();
        setToken(authData.access_token, { id: authData.user_id, email: authData.email, role: authData.role });
        setUserEmail(authData.email);

        // Fetch Quota
        const q = await api<any>("/auth/me/quota");
        setQuota(q);

        // Fetch Runs
        const rList = await api<any[]>("/runs");
        setRuns(rList);
      }
    } catch (err) {
      console.warn("API initialization notice (API server may be starting up)", err);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 5000);
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
      />

      <main className="pb-12">
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

        {currentView === "admin" && <AdminView />}
      </main>
    </div>
  );
};
export default App;
