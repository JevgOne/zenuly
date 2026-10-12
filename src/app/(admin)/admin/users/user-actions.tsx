"use client";

import { useState } from "react";
import {
  assignToProject,
  changeProjectRole,
  removeFromProject,
} from "@/app/actions/users";

type Project = { id: string; name: string; slug: string };
type Membership = { id: string; name: string; slug: string; role: string };

export function UserActions({
  profileId,
  fullName,
  memberships,
  allProjects,
}: {
  profileId: string;
  fullName: string;
  memberships: Membership[];
  allProjects: Project[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [addProjectId, setAddProjectId] = useState("");

  const assignedIds = new Set(memberships.map((m) => m.id));
  const availableProjects = allProjects.filter((p) => !assignedIds.has(p.id));

  async function handleAssign() {
    if (!addProjectId) return;
    setLoading(true);
    setError("");
    try {
      await assignToProject(profileId, addProjectId);
      setAddProjectId("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function handleRoleChange(projectId: string, newRole: "operator" | "manager") {
    setLoading(true);
    setError("");
    try {
      await changeProjectRole(profileId, projectId, newRole);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(projectId: string, projectName: string) {
    if (!confirm(`Odebrat ${fullName} z projektu ${projectName}?`)) return;
    setLoading(true);
    setError("");
    try {
      await removeFromProject(profileId, projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-accent hover:text-accent/80 transition-colors font-medium"
      >
        Upravit
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-line rounded-lg p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold text-text mb-1">{fullName}</h2>
        <p className="text-sm text-muted mb-4">Správa projektů a rolí</p>

        {/* Current memberships */}
        {memberships.length > 0 ? (
          <div className="space-y-2 mb-4">
            <p className="text-sm font-medium text-text">Přiřazené projekty</p>
            {memberships.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-2 bg-bg rounded-lg px-3 py-2"
              >
                <span className="text-sm text-text flex-1">{m.name}</span>
                <select
                  value={m.role}
                  disabled={loading}
                  onChange={(e) =>
                    handleRoleChange(m.id, e.target.value as "operator" | "manager")
                  }
                  className="text-xs border border-input-border rounded px-2 h-7 bg-surface text-text"
                >
                  <option value="operator">Operátor</option>
                  <option value="manager">Manažer</option>
                </select>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleRemove(m.id, m.name)}
                  className="text-xs text-urgent hover:text-urgent/80 transition-colors font-medium disabled:opacity-50"
                >
                  Odebrat
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-bg rounded-lg px-3 py-3 mb-4">
            <p className="text-sm text-muted">
              Uživatel není přiřazen k žádnému projektu.
            </p>
          </div>
        )}

        {/* Add to project */}
        {availableProjects.length > 0 && (
          <div className="mb-4">
            <p className="text-sm font-medium text-text mb-2">
              Přiřadit k projektu
            </p>
            <div className="flex gap-2">
              <select
                value={addProjectId}
                onChange={(e) => setAddProjectId(e.target.value)}
                className="flex-1 text-sm border border-input-border rounded-md px-3 h-9 bg-surface text-text"
              >
                <option value="">Vyberte projekt…</option>
                {availableProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={loading || !addProjectId}
                onClick={handleAssign}
                className="h-9 px-4 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                Přidat
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-sm text-urgent mb-3">{error}</p>}

        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError("");
          }}
          className="w-full h-10 border border-line rounded-md text-sm font-medium text-text hover:bg-bg transition-colors"
        >
          Zavřít
        </button>
      </div>
    </div>
  );
}
