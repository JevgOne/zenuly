"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

export function MfaSetup() {
  const [step, setStep] = useState<"idle" | "enrolling" | "verifying" | "done">(
    "idle"
  );
  const [qrUri, setQrUri] = useState("");
  const [factorId, setFactorId] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function startEnroll() {
    setError("");
    const { data, error: err } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "Weblyx CRM",
    });

    if (err || !data) {
      setError(err?.message ?? "Nepodařilo se zapnout 2FA");
      return;
    }

    setQrUri(data.totp.uri);
    setFactorId(data.id);
    setStep("enrolling");
  }

  async function verifyCode() {
    setError("");

    const { data: challenge, error: challengeErr } =
      await supabase.auth.mfa.challenge({ factorId });

    if (challengeErr || !challenge) {
      setError(challengeErr?.message ?? "Chyba při ověření");
      return;
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });

    if (verifyErr) {
      setError(verifyErr.message);
      return;
    }

    setStep("done");
  }

  async function unenroll() {
    setError("");
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.find((f) => f.status === "verified");
    if (!totp) return;

    const { error: err } = await supabase.auth.mfa.unenroll({
      factorId: totp.id,
    });
    if (err) {
      setError(err.message);
      return;
    }
    setStep("idle");
  }

  if (step === "done") {
    return (
      <div className="bg-surface border border-line rounded-lg p-6 max-w-sm">
        <h3 className="text-lg font-semibold text-text mb-2">
          2FA je aktivní
        </h3>
        <p className="text-sm text-muted mb-4">
          Dvoufaktorové ověření je zapnuto.
        </p>
        <button
          type="button"
          onClick={unenroll}
          className="h-10 px-4 border border-urgent text-urgent rounded-md text-sm font-medium hover:bg-urgent-soft transition-colors"
        >
          Vypnout 2FA
        </button>
        {error && <p className="text-sm text-urgent mt-2">{error}</p>}
      </div>
    );
  }

  if (step === "enrolling") {
    return (
      <div className="bg-surface border border-line rounded-lg p-6 max-w-sm">
        <h3 className="text-lg font-semibold text-text mb-2">Nastavení 2FA</h3>
        <p className="text-sm text-muted mb-4">
          Naskenujte QR kód v autentizační aplikaci (Google Authenticator, Authy
          apod.) a zadejte 6místný kód.
        </p>

        {/* QR code rendered as an image via otpauth URI */}
        <div className="bg-white p-4 rounded-lg border border-line mb-4 flex items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
            alt="QR kód pro 2FA"
            width={200}
            height={200}
          />
        </div>

        <div className="mb-4">
          <label
            htmlFor="mfa-code"
            className="block text-sm font-medium text-text mb-1"
          >
            Ověřovací kód
          </label>
          <input
            id="mfa-code"
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-full border border-input-border rounded-md px-3 h-11 text-text bg-surface font-mono text-center text-lg tracking-[0.3em]"
            placeholder="000000"
          />
        </div>

        {error && <p className="text-sm text-urgent mb-2">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setStep("idle")}
            className="flex-1 h-11 border border-line rounded-md text-sm font-medium text-text hover:bg-bg transition-colors"
          >
            Zrušit
          </button>
          <button
            type="button"
            onClick={verifyCode}
            disabled={code.length !== 6}
            className="flex-1 h-11 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            Ověřit
          </button>
        </div>
      </div>
    );
  }

  // idle
  return (
    <div className="bg-surface border border-line rounded-lg p-6 max-w-sm">
      <h3 className="text-lg font-semibold text-text mb-2">
        Dvoufaktorové ověření
      </h3>
      <p className="text-sm text-muted mb-4">
        Zvyšte zabezpečení svého účtu přidáním dvoufaktorového ověření (2FA).
      </p>
      <button
        type="button"
        onClick={startEnroll}
        className="h-10 px-4 bg-accent text-white rounded-md text-sm font-medium hover:bg-accent/90 transition-colors"
      >
        Zapnout 2FA
      </button>
      {error && <p className="text-sm text-urgent mt-2">{error}</p>}
    </div>
  );
}
