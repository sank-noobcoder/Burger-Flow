import React, { useState, useEffect } from "react";
import { api } from "../../lib/apiClient";
import { Shield, UserPlus, UserX, UserCheck, Trash2, X } from "lucide-react";

interface AdminViewProps {
  userRole?: string;
  userEmail?: string;
  onNavigateDashboard?: () => void;
  onLoginAdmin?: () => Promise<void>;
}

export const AdminView: React.FC<AdminViewProps> = ({
  userRole = "researcher",
  userEmail = "",
  onNavigateDashboard,
  onLoginAdmin,
}) => {
  const [activeTab, setActiveTab] = useState<"users" | "quotas" | "audit">("users");
  const [users, setUsers] = useState<any[]>([]);
  const [quotas, setQuotas] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [message, setMessage] = useState<string | null>(null);

  // Create User Modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newEmail, setNewEmail] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [newRole, setNewRole] = useState<string>("researcher");
  const [newGpuLimit, setNewGpuLimit] = useState<number>(120);
  const [newMaxJobs, setNewMaxJobs] = useState<number>(2);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

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
    if (userRole === "admin") {
      loadData();
    }
  }, [activeTab, userRole]);

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

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!confirm(`Are you sure you want to delete user ${userEmail}?`)) return;
    try {
      await api(`/admin/users/${userId}`, { method: "DELETE" });
      setMessage(`User ${userEmail} deleted successfully`);
      setTimeout(() => setMessage(null), 3000);
      loadData();
    } catch (err: any) {
      alert(err.message || "Failed to delete user");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setCreateError(null);
    try {
      await api("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          role: newRole,
          gpu_min_limit: Number(newGpuLimit),
          max_active_jobs: Number(newMaxJobs),
        }),
      });
      setMessage(`Successfully created user: ${newEmail}`);
      setTimeout(() => setMessage(null), 3000);
      setShowCreateModal(false);
      setNewEmail("");
      setNewPassword("");
      loadData();
    } catch (err: any) {
      setCreateError(err.message || "Failed to create user");
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {userRole !== "admin" && (
        <div className="mb-6 p-3 rounded-lg bg-[rgba(249,115,22,0.12)] border border-[var(--shock)]/30 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">👑</span>
            <span className="text-[var(--text)]">
              <strong>Developer Mode Active:</strong> You are currently testing with <span className="text-[var(--accent-a)] font-bold">{userEmail || "local session"}</span>. Admin management is unlocked for local testing.
            </span>
          </div>
          {onLoginAdmin && (
            <button
              onClick={onLoginAdmin}
              className="px-3 py-1 rounded bg-[var(--shock)] text-white text-xs font-bold hover:opacity-90 transition-opacity"
            >
              Switch to Root Admin
            </button>
          )}
        </div>
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-extrabold font-heading flex items-center gap-2.5">
            <Shield className="text-[var(--accent-a)]" />
            <span>Admin Console</span>
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Create researcher accounts, assign GPU quotas, and review security audit logs.
          </p>
        </div>

        {activeTab === "users" && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn-primary text-xs shadow-md flex items-center gap-1.5"
          >
            <UserPlus size={15} />
            <span>+ Create New Researcher / User</span>
          </button>
        )}
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
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {users.map((u) => {
                  const isBlocked = u.status === "blocked";
                  return (
                    <tr key={u.id} className="hover:bg-[var(--surface-hover)]">
                      <td className="py-3 px-4 text-[var(--text-dim)]">{u.id.substring(0, 8)}...</td>
                      <td className="py-3 px-4 text-[var(--text)] font-semibold">{u.email}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded bg-[var(--surface)] uppercase text-[10px] text-[var(--accent-a)] border border-[var(--border)]">
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] ${isBlocked ? "bg-red-950 text-[var(--danger)]" : "bg-green-950 text-[var(--ok)]"}`}>
                          {u.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => toggleBlockUser(u.id, isBlocked)}
                            className={`text-xs px-2.5 py-1 rounded transition-colors ${
                              isBlocked
                                ? "bg-[rgba(34,197,94,0.15)] text-[var(--ok)] hover:bg-green-900/30"
                                : "bg-[rgba(239,68,68,0.15)] text-[var(--danger)] hover:bg-red-900/30"
                            }`}
                          >
                            {isBlocked ? "Unblock" : "Block"}
                          </button>
                          {u.role !== "admin" && (
                            <button
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              className="p-1 rounded text-[var(--text-dim)] hover:text-[var(--danger)] transition-colors"
                              title="Delete User"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
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

      {/* CREATE USER MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md p-6 bg-[#0B0F1A] border border-[var(--border)] shadow-2xl relative">
            <div className="flex justify-between items-center mb-5">
              <div className="flex items-center gap-2">
                <UserPlus className="text-[var(--accent-a)]" size={20} />
                <h2 className="text-lg font-bold font-heading">Create New User</h2>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-[var(--text-dim)] hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {createError && (
              <div className="p-3 mb-4 rounded bg-red-950/50 border border-[var(--danger)] text-[var(--danger)] text-xs font-mono">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs font-mono">
              <div>
                <label className="block text-[var(--text-muted)] mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="researcher2@burgersflow.org"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-[var(--surface-active)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent-a)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-muted)] mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[var(--surface-active)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none focus:border-[var(--accent-a)]"
                />
              </div>

              <div>
                <label className="block text-[var(--text-muted)] mb-1">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-[var(--surface-active)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none"
                >
                  <option value="researcher" className="bg-slate-900 text-white">Researcher (Can launch & compare runs)</option>
                  <option value="reviewer" className="bg-slate-900 text-white">Reviewer (Read-only access)</option>
                  <option value="admin" className="bg-slate-900 text-white">Admin (Full administrative privileges)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[var(--text-muted)] mb-1">GPU Quota (Minutes)</label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={newGpuLimit}
                    onChange={(e) => setNewGpuLimit(parseInt(e.target.value))}
                    className="w-full bg-[var(--surface-active)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[var(--text-muted)] mb-1">Max Active Jobs</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={newMaxJobs}
                    onChange={(e) => setNewMaxJobs(parseInt(e.target.value))}
                    className="w-full bg-[var(--surface-active)] border border-[var(--border)] rounded px-3 py-2 text-[var(--text)] outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn-secondary text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="btn-primary text-xs"
                >
                  {isSubmitting ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
