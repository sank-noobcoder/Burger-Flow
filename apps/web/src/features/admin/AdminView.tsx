import React, { useState, useEffect } from "react";
import { api } from "../../lib/apiClient";
import { Shield, UserX, UserCheck, Clock, FileText } from "lucide-react";

export const AdminView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"users" | "quotas" | "audit">("users");
  const [users, setUsers] = useState<any[]>([]);
  const [quotas, setQuotas] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === "users") {
        const u = await api<any[]>("/admin/users");
        setUsers(u);
      } else if (activeTab === "quotas") {
        const q = await api<any[]>("/admin/quotas");
        setQuotas(q);
      } else if (activeTab === "audit") {
        const a = await api<any[]>("/admin/audit");
        setAuditLogs(a);
      }
    } catch (err: any) {
      console.error("Admin API fetch error", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const toggleBlockUser = async (userId: string, isBlocked: boolean) => {
    try {
      const endpoint = isBlocked ? `/admin/unblock/${userId}` : `/admin/block/${userId}`;
      await api(endpoint, { method: "POST" });
      setMessage(`User status updated successfully`);
      setTimeout(() => setMessage(null), 3000);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to update user");
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-extrabold font-heading flex items-center gap-2.5">
            <Shield className="text-[var(--accent-a)]" />
            <span>Admin Console</span>
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Manage users, configure cluster GPU quotas, and review security audit logs.
          </p>
        </div>
      </div>

      {message && (
        <div className="p-3 mb-6 rounded-lg bg-[rgba(34,197,94,0.15)] border border-[var(--ok)] text-[var(--ok)] text-xs font-mono">
          {message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-[var(--border)] pb-3">
        <button
          onClick={() => setActiveTab("users")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "users" ? "bg-[var(--accent-a)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-white"
          }`}
        >
          User Accounts
        </button>
        <button
          onClick={() => setActiveTab("quotas")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "quotas" ? "bg-[var(--accent-a)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-white"
          }`}
        >
          Compute Quotas
        </button>
        <button
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition-all ${
            activeTab === "audit" ? "bg-[var(--accent-a)] text-white shadow-sm" : "text-[var(--text-muted)] hover:text-white"
          }`}
        >
          Security Audit Log
        </button>
      </div>

      {/* Content */}
      <div className="glass-panel overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs font-mono text-[var(--text-muted)]">Loading admin records...</div>
        ) : activeTab === "users" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]">
                  <th className="py-3 px-4">User ID</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {users.map((u) => {
                  const isBlocked = u.status === "blocked";
                  return (
                    <tr key={u.id} className="hover:bg-[var(--surface-hover)]">
                      <td className="py-3 px-4 text-[var(--text-dim)]">{u.id.substring(0, 8)}...</td>
                      <td className="py-3 px-4 text-[var(--text)] font-semibold">{u.email}</td>
                      <td className="py-3 px-4 uppercase">{u.role}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${isBlocked ? "bg-red-950 text-[var(--danger)]" : "bg-green-950 text-[var(--ok)]"}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => toggleBlockUser(u.id, isBlocked)}
                          className={`text-xs px-2.5 py-1 rounded transition-colors ${
                            isBlocked
                              ? "bg-[rgba(34,197,94,0.15)] text-[var(--ok)] hover:bg-green-900/30"
                              : "bg-[rgba(239,68,68,0.15)] text-[var(--danger)] hover:bg-red-900/30"
                          }`}
                        >
                          {isBlocked ? "Unblock" : "Block User"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : activeTab === "quotas" ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]">
                  <th className="py-3 px-4">User ID</th>
                  <th className="py-3 px-4">GPU Minutes Used</th>
                  <th className="py-3 px-4">GPU Minutes Limit</th>
                  <th className="py-3 px-4">Max Active Jobs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {quotas.map((q) => (
                  <tr key={q.user_id} className="hover:bg-[var(--surface-hover)]">
                    <td className="py-3 px-4 text-[var(--text-dim)]">{q.user_id.substring(0, 8)}...</td>
                    <td className="py-3 px-4 text-[var(--shock)] font-bold">{q.gpu_min_used?.toFixed(1) || "0.0"}</td>
                    <td className="py-3 px-4">{q.gpu_min_limit} min</td>
                    <td className="py-3 px-4">{q.max_active_jobs}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)] bg-[var(--surface)]">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">User ID</th>
                  <th className="py-3 px-4">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--surface-hover)]">
                    <td className="py-3 px-4 text-[var(--text-dim)]">{new Date(log.created_at).toLocaleString()}</td>
                    <td className="py-3 px-4 text-[var(--accent-a)] font-bold">{log.action}</td>
                    <td className="py-3 px-4 text-[var(--text-dim)]">{log.user_id ? log.user_id.substring(0, 8) + "..." : "—"}</td>
                    <td className="py-3 px-4 text-[var(--text-muted)]">{log.detail || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
