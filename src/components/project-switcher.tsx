"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type Project = {
  id: string;
  name: string;
  slug: string;
};

export function ProjectSwitcher({
  projects,
  currentSlug,
}: {
  projects: Project[];
  currentSlug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = projects.find((p) => p.slug === currentSlug);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (projects.length <= 1) {
    return (
      <div className="h-10 px-3.5 border border-line rounded-full bg-surface flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-accent" />
        <span className="font-semibold text-sm text-text">
          {current?.name ?? "Projekt"}
        </span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="h-10 px-3.5 border border-line rounded-full bg-surface flex items-center gap-2 hover:border-input-border transition-colors"
      >
        <span className="w-2 h-2 rounded-full bg-accent" />
        <span className="font-semibold text-sm text-text">
          {current?.name ?? "Projekt"}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          className={`text-muted transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 bg-surface border border-line rounded-lg shadow-sm py-1 min-w-[180px] z-50">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                router.push(`/${p.slug}`);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-bg transition-colors ${
                p.slug === currentSlug
                  ? "text-accent font-medium"
                  : "text-text"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${p.slug === currentSlug ? "bg-accent" : "bg-input-border"}`}
              />
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
