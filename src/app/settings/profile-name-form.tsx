"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateOwnName } from "@/app/actions/users";

export function ProfileNameForm({ currentName }: { currentName: string }) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const changed = name.trim() !== currentName;

  async function handleSave() {
    setLoading(true);
    setError("");
    setSaved(false);
    try {
      await updateOwnName(name);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chyba");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <label className="text-sm font-medium text-text block mb-1">Jméno</label>
      <div className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => { setName(e.target.value); setSaved(false); }}
          className="flex-1 text-sm border border-input-border rounded-md px-3 h-9 bg-surface text-text"
        />
        {changed && (
          <button
            type="button"
            disabled={loading || !name.trim()}
            onClick={handleSave}
            className="h-9 px-4 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {loading ? "Ukládám…" : "Uložit"}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-urgent mt-1">{error}</p>}
      {saved && <p className="text-sm text-success mt-1">Uloženo</p>}
    </div>
  );
}
