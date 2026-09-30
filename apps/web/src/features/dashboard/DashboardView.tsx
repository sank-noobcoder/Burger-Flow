import React, { useState } from "react";
import { Plus, Play, Eye, Trash2, StopCircle, CheckCircle2, Clock, AlertCircle } from "lucide-react";

interface RunItem {
  id: string;
  name: string;
  dimension: number;
  model_type: string;
  status: string;
  phase: string;
  progress: number;
  best_loss?: number | null;
  final_l2?: number | null;
  created_at: string;
}

interface DashboardViewProps {
  runs: RunItem[];
  onNewRun: () => void;
  onSelectRun: (id: string) => void;
  onCancelRun: (id: string) => void;
  onDeleteRun: (id: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  runs,
  onNewRun,
  onSelectRun,
  onCancelRun,
  onDeleteRun,
}) => {
  const [filterDim, setFilterDim] = useState<string>("all");
  const [filterModel, setFilterModel] = useState<string>("all");

  const filteredRuns = runs.filter((r) => {
    if (filterDim !== "all" && r.dimension !== parseInt(filterDim)) return false;
    if (filterModel !== "all" && r.model_type.toLowerCase() !== filterModel.toLowerCase()) return false;
    return true;
  });

  const bestL2 = runs
    .filter((r) => r.final_l2 != null)
    .reduce((min, r) => Math.min(min, r.final_l2!), Infinity);

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Top Banner & Stats */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold font-heading">Experiments Dashboard</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Track active PINN training runs, explore convergence trajectories, and compare fluid flow solutions.
          </p>
        </div>
        <button onClick={onNewRun} className="btn-primary text-sm shadow-md">
          <Plus size={16} />
          <span>New Experiment</span>
        </button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="glass-panel p-5">
          <div className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">Best Rel. L₂</div>
          <div className="text-2xl font-bold font-mono gradient-text-flow mt-2">
            {bestL2 === Infinity ? "—" : bestL2.toExponential(2)}
          </div>
          <div className="text-xs text-[var(--ok)] mt-1 font-mono">RI-PINN (Headline Shock)</div>
        </div>

        <div className="glass-panel p-5">
          <div className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">Total Runs</div>
          <div className="text-2xl font-bold font-mono text-[var(--text)] mt-2">{runs.length}</div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Across 1D & 2D domains</div>
        </div>

        <div className="glass-panel p-5">
          <div className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">Active Training Jobs</div>
          <div className="text-2xl font-bold font-mono text-[var(--shock)] mt-2">
            {runs.filter((r) => r.status === "running" || r.status === "queued").length}
          </div>
          <div className="text-xs text-[var(--text-muted)] mt-1">Asynchronous workers</div>
        </div>

        <div className="glass-panel p-5">
          <div className="text-xs font-mono text-[var(--text-muted)] uppercase tracking-wider">Completed Baseline Suite</div>
          <div className="text-2xl font-bold font-mono text-[var(--ok)] mt-2">
            {runs.filter((r) => r.status === "succeeded").length}
          </div>
          <div className="text-xs text-[var(--ok)] mt-1 font-mono">Verified Cole-Hopf & 2D RK3</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="glass-panel p-4 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-mono text-[var(--text-muted)]">Filters:</span>
          {/* Dimension filter */}
          <select
            value={filterDim}
            onChange={(e) => setFilterDim(e.target.value)}
            className="text-xs bg-[var(--surface-active)] border border-[var(--border)] rounded px-2.5 py-1.5 font-mono text-[var(--text)] outline-none"
          >
            <option value="all">All Dimensions (1D & 2D)</option>
            <option value="1">1D Burgers</option>
            <option value="2">2D Burgers</option>
          </select>

          {/* Model filter */}
          <select
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value)}
            className="text-xs bg-[var(--surface-active)] border border-[var(--border)] rounded px-2.5 py-1.5 font-mono text-[var(--text)] outline-none"
          >
            <option value="all">All Architectures</option>
            <option value="ri">RI-PINN (Re-Init)</option>
            <option value="ff">FF-PINN (Fourier Features)</option>
            <option value="n">N-PINN (Standard MLP)</option>
          </select>
        </div>

        <div className="text-xs font-mono text-[var(--text-muted)]">
          Showing {filteredRuns.length} of {runs.length} runs
        </div>
      </div>

      {/* Runs Table */}
      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]">
                <th className="py-3 px-4">Run Name</th>
                <th className="py-3 px-4">Dim</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Status & Phase</th>
                <th className="py-3 px-4">Progress</th>
                <th className="py-3 px-4">Best Loss</th>
                <th className="py-3 px-4">Rel. L₂</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {filteredRuns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[var(--text-muted)]">
                    No matching runs found. Click "New Experiment" to launch one!
                  </td>
                </tr>
              ) : (
                filteredRuns.map((r) => {
                  const isRunning = r.status === "running";
                  const isSucceeded = r.status === "succeeded";
                  const isQueued = r.status === "queued";

                  return (
                    <tr key={r.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-[var(--text)]">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isRunning
                                ? "bg-[var(--accent-a)] animate-ping"
                                : isSucceeded
                                ? "bg-[var(--ok)]"
                                : isQueued
                                ? "bg-[var(--warn)]"
                                : "bg-[var(--danger)]"
                            }`}
                          />
                          <span
                            onClick={() => onSelectRun(r.id)}
                            className="cursor-pointer hover:underline text-[var(--text)] font-mono font-bold"
                          >
                            {r.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[10px]">
                          {r.dimension}D
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                            r.model_type.toLowerCase() === "ri"
                              ? "bg-[rgba(249,115,22,0.15)] text-[var(--shock)] border border-[var(--shock)]/30"
                              : r.model_type.toLowerCase() === "ff"
                              ? "bg-[rgba(56,189,248,0.15)] text-[var(--accent-a)] border border-[var(--accent-a)]/30"
                              : "bg-[var(--surface)] text-[var(--text-muted)]"
                          }`}
                        >
                          {r.model_type.toUpperCase()}-PINN
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="capitalize">{r.status}</span>
                          {isRunning && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-b)] text-white">
                              {r.phase}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 w-32">
                        <div className="w-full bg-[var(--surface-active)] h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-[var(--accent-a)] to-[var(--accent-b)] h-full transition-all duration-300"
                            style={{ width: `${r.progress}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-[var(--text-dim)] mt-0.5">{r.progress.toFixed(0)}%</div>
                      </td>
                      <td className="py-3.5 px-4 text-[var(--text-muted)]">
                        {r.best_loss ? r.best_loss.toExponential(2) : "—"}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-[var(--accent-a)]">
                        {r.final_l2 ? r.final_l2.toExponential(2) : "—"}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => onSelectRun(r.id)}
                            className="p-1.5 rounded hover:bg-[var(--surface-active)] text-[var(--text-muted)] hover:text-white transition-colors"
                            title="Open Run Monitor / Results"
                          >
                            <Eye size={15} />
                          </button>
                          {isRunning && (
                            <button
                              onClick={() => onCancelRun(r.id)}
                              className="p-1.5 rounded hover:bg-[rgba(239,68,68,0.2)] text-[var(--danger)] transition-colors"
                              title="Cancel Run"
                            >
                              <StopCircle size={15} />
                            </button>
                          )}
                          {!isRunning && (
                            <button
                              onClick={() => onDeleteRun(r.id)}
                              className="p-1.5 rounded hover:bg-[rgba(239,68,68,0.2)] text-[var(--text-dim)] hover:text-[var(--danger)] transition-colors"
                              title="Delete Run"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
