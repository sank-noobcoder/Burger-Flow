import React, { useState, useEffect } from "react";
import { api } from "../../lib/apiClient";
import { ArrowLeft, Activity, Eye, Compass, Code, Download } from "lucide-react";
import { LiveMonitorView } from "../monitor/LiveMonitorView";
import { FieldViewer1D } from "../viewer1d/FieldViewer1D";
import { FieldViewer2D } from "../viewer2d/FieldViewer2D";
import { PCATrajectoryView } from "../pca/PCATrajectoryView";

interface RunDetailViewProps {
  runId: string;
  onBack: () => void;
  onCancel: (id: string) => void;
}

export const RunDetailView: React.FC<RunDetailViewProps> = ({ runId, onBack, onCancel }) => {
  const [run, setRun] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"results" | "monitor" | "pca" | "config">("results");
  const [predData, setPredData] = useState<any | null>(null);
  const [pcaData, setPcaData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchRunAndArtifacts = async (isInitial = false) => {
    try {
      const r = await api<any>(`/runs/${runId}`);
      setRun(r);

      if (isInitial && (r.status === "running" || r.status === "queued")) {
        setActiveTab("monitor");
      }

      // Fetch artifacts only if the run is completed and the artifact exists
      const artList: string[] = r.artifacts || [];
      const isFinished = r.status === "succeeded" || r.status === "failed";
      const hasPredArt = artList.includes("prediction_final.json") || artList.includes("prediction_2d.json");

      if (isFinished || hasPredArt) {
        const artName = artList.includes("prediction_final.json")
          ? "prediction_final.json"
          : artList.includes("prediction_2d.json")
          ? "prediction_2d.json"
          : null;
        if (artName) {
          try {
            const data = await api<any>(`/runs/${runId}/artifacts/${artName}`).catch(() => null);
            if (data && !data.status) setPredData(data);
          } catch (e) {
            console.warn("Artifact load info", e);
          }
        }

        if (artList.includes("pca.json")) {
          try {
            const data = await api<any>(`/runs/${runId}/artifacts/pca.json`).catch(() => null);
            if (data && !data.status) setPcaData(data);
          } catch (e) {
            console.warn("PCA load info", e);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load run", err);
    } finally {
      if (isInitial) setLoading(false);
    }
  };

  useEffect(() => {
    fetchRunAndArtifacts(true);
  }, [runId]);

  // If run is running or queued, poll status every 3 seconds to detect completion
  useEffect(() => {
    if (!run || (run.status !== "running" && run.status !== "queued")) return;

    const interval = setInterval(() => {
      fetchRunAndArtifacts(false);
    }, 3000);

    return () => clearInterval(interval);
  }, [run?.status, runId]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center font-mono text-xs text-[var(--text-muted)]">
        Loading experiment details...
      </div>
    );
  }

  if (!run) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <div className="text-xl font-bold font-heading mb-4">Run Not Found</div>
        <button onClick={onBack} className="btn-secondary text-xs">
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-[var(--surface)] hover:bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--text-muted)] hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold font-heading">{run.name}</h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--surface-active)] text-[var(--accent-a)] border border-[var(--border)]">
                {run.dimension}D BURGERS
              </span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded uppercase font-bold ${
                  run.status === "succeeded"
                    ? "bg-green-950 text-[var(--ok)]"
                    : run.status === "running"
                    ? "bg-blue-950 text-[var(--accent-a)] animate-pulse"
                    : "bg-red-950 text-[var(--danger)]"
                }`}
              >
                {run.status}
              </span>
            </div>
            <div className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
              ID: {run.id} · Method: {run.model_type.toUpperCase()}-PINN · Seed: {run.seed}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--border)] pb-3">
        <button
          onClick={() => setActiveTab("results")}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === "results" ? "bg-[var(--accent-a)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-white"
          }`}
        >
          <Eye size={14} />
          <span>Solution Field</span>
        </button>
        <button
          onClick={() => setActiveTab("monitor")}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === "monitor" ? "bg-[var(--accent-a)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-white"
          }`}
        >
          <Activity size={14} />
          <span>Live Monitor</span>
        </button>
        <button
          onClick={() => setActiveTab("pca")}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === "pca" ? "bg-[var(--accent-a)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-white"
          }`}
        >
          <Compass size={14} />
          <span>PCA Trajectory</span>
        </button>
        <button
          onClick={() => setActiveTab("config")}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
            activeTab === "config" ? "bg-[var(--accent-a)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-white"
          }`}
        >
          <Code size={14} />
          <span>Config & Artifacts</span>
        </button>
      </div>

      {/* Tab Panels */}
      <div>
        {activeTab === "results" && (
          (run.status === "running" || run.status === "queued") ? (
            <div className="glass-panel p-8 text-center max-w-xl mx-auto my-8 border border-[var(--border)]">
              <div className="w-12 h-12 rounded-xl bg-[var(--surface-active)] flex items-center justify-center text-[var(--accent-a)] mx-auto mb-3 animate-pulse">
                <Activity size={24} />
              </div>
              <h3 className="text-base font-bold font-heading mb-1 text-[var(--text)]">PINN Training In Progress</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto font-mono mb-4">
                The neural network is actively training and resolving Burgers shock dynamics. The complete interactive space-time solution field and Cole-Hopf benchmark will render here immediately once training completes.
              </p>
              <button
                onClick={() => setActiveTab("monitor")}
                className="btn-primary text-xs flex items-center gap-2 mx-auto"
              >
                <Activity size={14} />
                <span>Open Live Monitor Stream</span>
              </button>
            </div>
          ) : run.dimension === 1 ? (
            <FieldViewer1D predictionData={predData} modelType={run.model_type} modelName={run.name} />
          ) : (
            <FieldViewer2D data2D={predData} />
          )
        )}

        {activeTab === "monitor" && (
          <LiveMonitorView runId={runId} runDetails={run} onBack={onBack} onCancel={onCancel} />
        )}

        {activeTab === "pca" && (
          (run.status === "running" || run.status === "queued") ? (
            <div className="glass-panel p-8 text-center max-w-xl mx-auto my-8 border border-[var(--border)]">
              <div className="w-12 h-12 rounded-xl bg-[var(--surface-active)] flex items-center justify-center text-[var(--accent-a)] mx-auto mb-3 animate-pulse">
                <Compass size={24} />
              </div>
              <h3 className="text-base font-bold font-heading mb-1 text-[var(--text)]">PCA Checkpoints Accumulating</h3>
              <p className="text-xs text-[var(--text-muted)] max-w-md mx-auto font-mono mb-4">
                Layer-0 parameter snapshots are recorded periodically during training. The final 2D PCA parameter trajectory map will render here automatically upon run completion.
              </p>
              <button
                onClick={() => setActiveTab("monitor")}
                className="btn-primary text-xs flex items-center gap-2 mx-auto"
              >
                <Activity size={14} />
                <span>Open Live Monitor Stream</span>
              </button>
            </div>
          ) : (
            <PCATrajectoryView pcaData={pcaData} />
          )
        )}

        {activeTab === "config" && (
          <div className="space-y-6">
            <div className="glass-panel p-5">
              <div className="text-xs font-mono font-bold uppercase text-[var(--text)] mb-3">Experiment Config (YAML)</div>
              <pre className="p-4 rounded-xl bg-[rgba(11,15,26,0.9)] border border-[var(--border)] font-mono text-xs text-[var(--accent-a)] overflow-x-auto">
                {JSON.stringify(run.config, null, 2)}
              </pre>
            </div>

            <div className="glass-panel p-5">
              <div className="text-xs font-mono font-bold uppercase text-[var(--text)] mb-3">Artifacts Storage</div>
              {run.artifacts && run.artifacts.length > 0 ? (
                <div className="space-y-2">
                  {run.artifacts.map((artName: string) => (
                    <div key={artName} className="flex justify-between items-center p-3 rounded-lg bg-[var(--surface)] text-xs font-mono">
                      <span className="text-[var(--text)]">{artName}</span>
                      <a
                        href={`/api/v1/runs/${runId}/artifacts/${artName}`}
                        download={artName}
                        className="text-[var(--accent-a)] hover:underline flex items-center gap-1"
                      >
                        <Download size={13} />
                        <span>Download</span>
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-[var(--surface)] text-xs font-mono text-[var(--text-muted)] text-center">
                  {(run.status === "running" || run.status === "queued")
                    ? "Training in progress. Generated artifacts (prediction_final.json, loss_history.json, pca.json, model weights) will be available here when completed."
                    : "No artifacts stored for this run."}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
