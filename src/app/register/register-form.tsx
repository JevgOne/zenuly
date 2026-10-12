"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function RegisterForm() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    setLoading(false);

    if (signUpError) {
      if (signUpError.message.includes("already registered")) {
        setError("Tento e-mail je již zaregistrován.");
      } else if (signUpError.message.includes("Password")) {
        setError("Heslo musí mít alespoň 6 znaků.");
      } else {
        setError(signUpError.message);
      }
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <div className="flex flex-col gap-4">
        <div className="bg-accent-soft border border-accent rounded-sm px-4 py-3">
          <p className="text-sm text-accent font-medium mb-1">Registrace úspěšná</p>
          <p className="text-sm text-accent mb-2">
            Na váš e-mail jsme odeslali ověřovací odkaz. Klikněte na něj pro dokončení registrace.
          </p>
          <p className="text-sm text-accent font-medium">
            Bez potvrzení e-mailu se nepůjde přihlásit.
          </p>
        </div>
        <p className="text-xs text-muted">
          Nevidíte e-mail? Zkontrolujte složku spam. Odkaz je platný 24 hodin.
        </p>
        <button
          type="button"
          onClick={() => router.push("/login")}
          className="bg-accent text-white rounded-md h-12 font-semibold text-[15px] hover:bg-accent/90 transition-colors"
        >
          Zpět na přihlášení
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Jméno a příjmení</span>
        <input
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
          className="border border-input-border rounded-md px-3 h-11 font-sans text-text text-[15px] bg-surface outline-none focus:border-accent transition-colors"
        />
      </label>

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

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Telefon</span>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          placeholder="+420"
          autoComplete="tel"
          className="border border-input-border rounded-md px-3 h-11 font-sans text-text text-[15px] bg-surface outline-none focus:border-accent transition-colors"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="register-password" className="text-[13px] font-medium text-muted">
          Heslo
        </label>
        <div className="relative">
          <input
            id="register-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete="new-password"
            className="w-full border border-input-border rounded-md px-3 pr-10 h-11 font-sans text-text text-[15px] bg-surface outline-none focus:border-accent transition-colors"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-text transition-colors"
            aria-label={showPassword ? "Skryt heslo" : "Zobrazit heslo"}
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

      {error && <p className="text-urgent text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="bg-accent text-white rounded-md h-12 font-semibold text-[15px] hover:bg-accent/90 transition-colors disabled:opacity-50 mt-1"
      >
        {loading ? "Registrace..." : "Zaregistrovat se"}
      </button>

      <p className="text-center text-sm text-muted mt-4">
        Už máte účet?{" "}
        <Link href="/login" className="text-accent hover:underline font-medium">
          Přihlaste se
        </Link>
      </p>
    </form>
  );
}
