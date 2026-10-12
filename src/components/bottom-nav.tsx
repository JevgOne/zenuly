"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { label: string; href: string; icon: string };

const OPERATOR_NAV: NavItem[] = [
  { label: "Fronta", href: "fronta", icon: "phone" },
  { label: "Úkoly", href: "ukoly", icon: "check" },
  { label: "Kalendář", href: "kalendar", icon: "calendar" },
  { label: "Výkon", href: "vykon", icon: "chart" },
];

const ADMIN_NAV: NavItem[] = [
  { label: "Dashboard", href: "dashboard", icon: "dashboard" },
  { label: "Kontakty", href: "kontakty", icon: "contacts" },
  { label: "Pipeline", href: "pipeline", icon: "pipeline" },
  { label: "Report", href: "report", icon: "report" },
  { label: "Více", href: "__more__", icon: "more" },
];

const MORE_LINKS: NavItem[] = [
  { label: "Fronta", href: "fronta", icon: "phone" },
  { label: "Úkoly", href: "ukoly", icon: "check" },
  { label: "Import", href: "import", icon: "import" },
  { label: "Export hodin", href: "export-hodin", icon: "export" },
  { label: "Výkon", href: "vykon", icon: "chart" },
  { label: "Kalendář", href: "kalendar", icon: "calendar" },
];

const ICONS: Record<string, React.ReactNode> = {
  phone: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M7.5 3.5H5a1.5 1.5 0 00-1.5 1.5v1a11 11 0 0011 11h1A1.5 1.5 0 0017 15.5v-2.38a1 1 0 00-.68-.95l-2.8-.93a1 1 0 00-1.08.35l-.84 1.05a9 9 0 01-4.24-4.24l1.05-.84a1 1 0 00.35-1.08l-.93-2.8a1 1 0 00-.95-.68H7.5z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  ),
  check: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M5 10l3.5 3.5L15 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  calendar: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect
        x="3.5"
        y="4.5"
        width="13"
        height="12"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3.5 8.5h13" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 3v3M13 3v3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  chart: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 16V9M8 16V6M12 16V10M16 16V4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  ),
  dashboard: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="11" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  ),
  contacts: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 10a3 3 0 100-6 3 3 0 000 6zM4 16.5c0-2.5 2.7-4.5 6-4.5s6 2 6 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  pipeline: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 4h14M5 8h10M7 12h6M9 16h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  report: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="3" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7h6M7 10h4M7 13h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  ),
  more: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="5" r="1.5" fill="currentColor" />
      <circle cx="10" cy="10" r="1.5" fill="currentColor" />
      <circle cx="10" cy="15" r="1.5" fill="currentColor" />
    </svg>
  ),
  import: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 3v10M10 13l-3-3M10 13l3-3M4 15v1.5a1 1 0 001 1h10a1 1 0 001-1V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  export: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 13V3M10 3l-3 3M10 3l3 3M4 15v1.5a1 1 0 001 1h10a1 1 0 001-1V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

export function BottomNav({
  projectSlug,
  role,
}: {
  projectSlug: string;
  role: string;
}) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isAdmin = role === "admin" || role === "manager";
  const navItems = isAdmin ? ADMIN_NAV : OPERATOR_NAV;

  return (
    <>
      {/* More sheet overlay */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-[78px] left-0 right-0 bg-surface border-t border-line rounded-t-xl p-4 z-50">
            <div className="grid grid-cols-3 gap-3">
              {MORE_LINKS.map((item) => {
                const href = `/${projectSlug}/${item.href}`;
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={item.href}
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl min-h-[44px] transition-colors ${
                      active
                        ? "bg-accent-soft text-accent"
                        : "text-muted hover:bg-bg"
                    }`}
                  >
                    {ICONS[item.icon]}
                    <span className="text-[11px] font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 h-[78px] border-t border-line bg-surface flex lg:hidden z-40">
        {navItems.map((item) => {
          if (item.href === "__more__") {
            return (
              <button
                key="more"
                type="button"
                onClick={() => setMoreOpen(!moreOpen)}
                className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] ${
                  moreOpen ? "text-accent" : "text-muted"
                }`}
              >
                {ICONS[item.icon]}
                <span className="text-[11px] font-medium">{item.label}</span>
              </button>
            );
          }

          const href = `/${projectSlug}/${item.href}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={item.href}
              href={href}
              onClick={() => setMoreOpen(false)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[44px] ${
                active ? "text-accent" : "text-muted"
              }`}
            >
              {ICONS[item.icon]}
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
