"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";

export function UserMenu({
  fullName,
  role,
}: {
  fullName: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initials = fullName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-10 h-10 rounded-full bg-accent-soft text-accent font-semibold text-sm flex items-center justify-center hover:bg-accent/10 transition-colors"
      >
        {initials}
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-1 bg-surface border border-line rounded-lg shadow-sm py-1 min-w-[180px] z-50">
          <div className="px-3 py-2 border-b border-line">
            <p className="text-sm font-medium text-text">{fullName}</p>
            <p className="text-[13px] text-muted">
              {role === "admin"
                ? "Administrátor"
                : role === "manager"
                  ? "Manažer"
                  : "Operátor"}
            </p>
          </div>

          <Link
            href="/settings"
            className="block px-3 py-2 text-sm text-text hover:bg-bg transition-colors"
          >
            Nastavení
          </Link>

          {(role === "admin" || role === "manager") && (
            <Link
              href="/admin/users"
              className="block px-3 py-2 text-sm text-text hover:bg-bg transition-colors"
            >
              Správa uživatelů
            </Link>
          )}

          <form action={signOut}>
            <button
              type="submit"
              className="w-full text-left px-3 py-2 text-sm text-urgent hover:bg-bg transition-colors"
            >
              Odhlásit se
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
