"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function MfaForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.find((f) => f.status === "verified");

    if (!totp) {
      setError("Žádný ověřovací faktor nenalezen.");
      setLoading(false);
      return;
    }

    const { data: challenge, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (challengeError) {
      setError(challengeError.message);
      setLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: challenge.id,
      code,
    });

    if (verifyError) {
      setError("Nesprávný kód. Zkuste to znovu.");
      setLoading(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <p className="text-[15px] text-muted">
        Zadejte kód z ověřovací aplikace.
      </p>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">
          Ověřovací kód
        </span>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          required
          autoFocus
          autoComplete="one-time-code"
          className="border border-input-border rounded-md px-3 h-11 font-mono text-text text-[18px] tracking-[0.3em] text-center bg-surface outline-none focus:border-accent"
        />
      </label>

      {error && <p className="text-urgent text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading || code.length !== 6}
        className="bg-accent text-white rounded-md h-12 font-semibold text-[15px] hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {loading ? "Ověřování..." : "Ověřit"}
      </button>
    </form>
  );
}
