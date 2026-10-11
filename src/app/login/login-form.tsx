"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MfaForm } from "./mfa-form";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";
  const verified = searchParams.get("verified");
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(errorParam ?? "");
  const [loading, setLoading] = useState(false);
  const [showMfa, setShowMfa] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setLoading(false);
      if (signInError.message.includes("Invalid login")) {
        setError("Nesprávný e-mail nebo heslo.");
      } else if (signInError.message.includes("Email not confirmed")) {
        setError("E-mail není ověřen. Zkontrolujte svou schránku.");
      } else {
        setError(signInError.message);
      }
      return;
    }

    // Check if MFA is required
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const hasTOTP = factors?.totp?.some((f) => f.status === "verified");

    if (hasTOTP) {
      setLoading(false);
      setShowMfa(true);
      return;
    }

    router.push(next);
    router.refresh();
  }

  if (showMfa) {
    return <MfaForm next={next} />;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {verified && (
        <p className="text-sm text-accent bg-accent-soft border border-accent rounded-sm px-3 py-2">
          E-mail ověřen. Nyní se přihlaste.
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">E-mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="border border-input-border rounded-md px-3 h-11 font-sans text-text text-[15px] bg-surface outline-none focus:border-accent transition-colors"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-[13px] font-medium text-muted">
            Heslo
          </label>
          <button
            type="button"
            tabIndex={-1}
            className="text-[13px] text-accent hover:text-accent/80 transition-colors"
          >
            Zapomenuté heslo?
          </button>
        </div>
        <div className="relative">
          <input
            id="password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full border border-input-border rounded-md px-3 pr-10 h-11 font-sans text-text text-[15px] bg-surface outline-none focus:border-accent transition-colors"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-text transition-colors"
            aria-label={showPassword ? "Skrýt heslo" : "Zobrazit heslo"}
          >
            {showPassword ? (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M3 3l14 14M8.36 8.36a2.5 2.5 0 003.28 3.28M4.5 7.5C3.3 8.7 2.5 10 2.5 10s2.5 5 7.5 5c1.08 0 2.07-.27 2.95-.7M10 5c5 0 7.5 5 7.5 5s-.75 1.92-2.5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path
                  d="M10 5c5 0 7.5 5 7.5 5s-2.5 5-7.5 5-7.5-5-7.5-5 2.5-5 7.5-5z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle
                  cx="10"
                  cy="10"
                  r="2.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          defaultChecked
          className="rounded border-input-border text-accent w-4 h-4"
        />
        <span className="text-[13px] text-muted">
          Zůstat přihlášen na tomto zařízení
        </span>
      </label>

      {error && <p className="text-urgent text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-accent text-white rounded-md h-12 font-semibold text-[15px] hover:bg-accent/90 transition-colors disabled:opacity-50 mt-1"
      >
        {loading ? "Přihlašování..." : "Přihlásit se"}
      </button>

      <p className="text-center text-sm text-muted mt-4">
        Nemáte účet?{" "}
        <Link href="/register" className="text-accent hover:underline font-medium">
          Zaregistrujte se
        </Link>
      </p>
    </form>
  );
}
