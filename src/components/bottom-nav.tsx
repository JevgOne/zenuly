"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { label: "Fronta", href: "fronta", icon: "phone" },
  { label: "Úkoly", href: "ukoly", icon: "check" },
  { label: "Kalendář", href: "kalendar", icon: "calendar" },
  { label: "Výkon", href: "vykon", icon: "chart" },
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
};

export function BottomNav({ projectSlug }: { projectSlug: string }) {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[78px] border-t border-line bg-surface flex lg:hidden z-40">
      {NAV_ITEMS.map((item) => {
        const href = `/${projectSlug}/${item.href}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={item.href}
            href={href}
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
  );
}
