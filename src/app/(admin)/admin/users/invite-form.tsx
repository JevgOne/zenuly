"use client";

import { useState, useRef } from "react";
import { inviteOperator } from "@/app/actions/users";

type Project = {
  id: string;
  name: string;
  slug: string;
};

export function InviteForm({ projects }: { projects: Project[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(formData: FormData) {
    setError("");
    setLoading(true);

    try {
      await inviteOperator(formData);
      setOpen(false);
      formRef.current?.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nepodařilo se pozvat uživatele");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 px-4 bg-accent text-white rounded-md font-medium text-sm hover:bg-accent/90 transition-colors"
      >
        Pozvat uživatele
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-line rounded-lg p-6 max-w-sm w-full">
        <h2 className="text-lg font-semibold text-text mb-4">
          Pozvat uživatele
        </h2>

        <form ref={formRef} action={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="full_name"
              className="block text-sm font-medium text-text mb-1"
            >
              Celé jméno
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              required
              className="w-full border border-input-border rounded-md px-3 h-11 text-text bg-surface"
            />
          </div>

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-text mb-1"
            >
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="w-full border border-input-border rounded-md px-3 h-11 text-text bg-surface"
            />
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-text mb-2">
              Projekty a role
            </legend>
            {projects.map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-1">
                <label className="flex items-center gap-2 text-sm text-text cursor-pointer flex-1">
                  <input
                    type="checkbox"
                    name="project_ids"
                    value={p.id}
                    className="rounded border-input-border text-accent"
                  />
                  {p.name}
                </label>
                <select
                  name={`role_${p.id}`}
                  className="text-xs border border-input-border rounded px-2 h-7 bg-surface text-text"
                >
                  <option value="operator">Operátor</option>
                  <option value="manager">Manažer</option>
                </select>
              </div>
            ))}
          </fieldset>

          {error && <p className="text-sm text-urgent">{error}</p>}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError("");
              }}
              className="flex-1 h-11 border border-line rounded-md text-sm font-medium text-text hover:bg-bg transition-colors"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 h-11 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {loading ? "Odesílám…" : "Pozvat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
