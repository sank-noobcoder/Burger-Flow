import React, { useState, useEffect } from "react";
import { api } from "../../lib/apiClient";
import { Download, RefreshCw, CheckCircle2 } from "lucide-react";

interface CompareViewProps {
  runs: any[];
}

export const CompareView: React.FC<CompareViewProps> = ({ runs }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Initialize with up to 3 succeeded runs
  useEffect(() => {
    if (runs.length > 0 && selectedIds.length === 0) {
      const defaultIds = runs.filter((r) => r.status === "succeeded").slice(0, 3).map((r) => r.id);
      setSelectedIds(defaultIds);
    }
  }, [runs]);

  // Fetch comparison data when selected IDs change
  useEffect(() => {
    if (selectedIds.length === 0) {
      setCompareData(null);
      return;
    }

    async function loadCompare() {
      setLoading(true);
      try {
        const res = await api<any>(`/compare?ids=${selectedIds.join(",")}`);
        setCompareData(res);
      } catch (err) {
        console.error("Failed to fetch compare data", err);
      } finally {
        setLoading(false);
      }
    }
    loadCompare();
  }, [selectedIds]);

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      if (selectedIds.length >= 6) return;
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleExportCSV = () => {
    if (!compareData?.summary_table) return;
    const headers = ["ID", "Name", "Dimension", "Model", "Final L2", "MSE", "Shock Pos Error", "Epochs", "Wall Clock (s)"];
    const rows = compareData.summary_table.map((r: any) => [
      r.id,
      r.name,
      r.dimension,
      r.model_type,
      r.final_l2,
      r.mse,
      r.shock_pos_err,
      r.epochs,
      r.wall_clock_s,
    ]);
    const csvContent = [headers.join(","), ...rows.map((row: any) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `burgersflow_benchmark_${Date.now()}.csv`;
    link.click();
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold font-heading">Multi-Run Benchmark Comparison</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Fair side-by-side evaluation of RI-PINN against Fourier and standard PINN baselines.
          </p>
        </div>

        <button
          onClick={handleExportCSV}
          disabled={!compareData}
          className="btn-secondary text-xs flex items-center gap-1.5"
        >
          <Download size={15} />
          <span>Export Metrics CSV</span>
        </button>
      </div>

      {/* Select Runs Checkbox Chips */}
      <div className="glass-panel p-4 mb-8">
        <div className="text-xs font-mono text-[var(--text-muted)] mb-3 uppercase">
          Select Experiments to Compare (Max 6):
        </div>
        <div className="flex flex-wrap gap-2">
          {runs.map((r) => {
            const isChecked = selectedIds.includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => toggleSelect(r.id)}
                className={`text-xs px-3 py-1.5 rounded-lg border font-mono transition-all flex items-center gap-2 ${
                  isChecked
                    ? "bg-[rgba(56,189,248,0.15)] border-[var(--accent-a)] text-[var(--accent-a)] font-bold shadow-sm"
                    : "bg-[var(--surface)] border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-strong)]"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${isChecked ? "bg-[var(--accent-a)]" : "bg-[var(--text-dim)]"}`} />
                <span>{r.name}</span>
                <span className="text-[10px] text-[var(--text-dim)]">({r.dimension}D)</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Comparison Table */}
      {loading ? (
        <div className="glass-panel p-12 text-center text-xs font-mono text-[var(--text-muted)]">
          Aggregating benchmark metrics...
        </div>
      ) : !compareData || compareData.runs?.length === 0 ? (
        <div className="glass-panel p-12 text-center text-xs font-mono text-[var(--text-muted)]">
          Select at least one completed run above to compare.
        </div>
      ) : (
        <div className="space-y-8">
          <div className="glass-panel overflow-hidden">
            <div className="p-4 border-b border-[var(--border)] bg-[var(--surface)] flex justify-between items-center">
              <span className="text-xs font-mono font-bold uppercase text-[var(--text)]">Benchmark Metrics Summary</span>
              <span className="text-[11px] font-mono text-[var(--ok)]">Ground-Truth Reference Validated</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]">
                    <th className="py-3 px-4">Method & Name</th>
                    <th className="py-3 px-4">Dim</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Rel. L₂ Error</th>
                    <th className="py-3 px-4">MSE</th>
                    <th className="py-3 px-4">Shock Pos. Error</th>
                    <th className="py-3 px-4">Epochs</th>
                    <th className="py-3 px-4">Wall Clock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {compareData.summary_table.map((row: any) => {
                    const isRI = row.model_type?.toLowerCase() === "ri";
                    return (
                      <tr
                        key={row.id}
                        className={isRI ? "bg-[rgba(56,189,248,0.06)] font-bold" : "hover:bg-[var(--surface-hover)]"}
                      >
                        <td className="py-3 px-4 text-[var(--text)] flex items-center gap-2">
                          {isRI && <CheckCircle2 size={14} className="text-[var(--ok)]" />}
                          <span>{row.name}</span>
                        </td>
                        <td className="py-3 px-4">{row.dimension}D</td>
                        <td className="py-3 px-4 capitalize">{row.status}</td>
                        <td className="py-3 px-4 text-[var(--accent-a)]">
                          {row.final_l2 ? row.final_l2.toExponential(2) : "—"}
                        </td>
                        <td className="py-3 px-4">{row.mse ? row.mse.toExponential(2) : "—"}</td>
                        <td className="py-3 px-4 text-[var(--shock)]">
                          {row.shock_pos_err ? `${row.shock_pos_err.toFixed(4)} dx` : "—"}
                        </td>
                        <td className="py-3 px-4">{row.epochs?.toLocaleString() || "—"}</td>
                        <td className="py-3 px-4">{row.wall_clock_s ? `${row.wall_clock_s.toFixed(1)}s` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
