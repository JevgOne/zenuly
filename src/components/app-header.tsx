import Link from "next/link";
import { ProjectSwitcher } from "./project-switcher";
import { UserMenu } from "./user-menu";

type Project = {
  id: string;
  name: string;
  slug: string;
};

const NAV_ITEMS = [
  { label: "Fronta", href: "fronta" },
  { label: "Úkoly", href: "ukoly" },
  { label: "Kalendář", href: "kalendar" },
  { label: "Výkon", href: "vykon" },
];

const ADMIN_NAV_ITEMS = [
  ...NAV_ITEMS.slice(0, 3),
  { label: "Pipeline", href: "pipeline" },
  { label: "Import", href: "import" },
  { label: "Report", href: "report" },
  { label: "Export hodin", href: "export-hodin" },
  NAV_ITEMS[3],
];

export function AppHeader({
  projects,
  currentSlug,
  fullName,
  role,
}: {
  projects: Project[];
  currentSlug: string;
  fullName: string;
  role: string;
}) {
  const navItems = role === "admin" || role === "manager" ? ADMIN_NAV_ITEMS : NAV_ITEMS;

  return (
    <header className="h-14 border-b border-line bg-surface px-4 flex items-center gap-4">
      <ProjectSwitcher projects={projects} currentSlug={currentSlug} />

      {/* Desktop navigation */}
      <nav className="hidden lg:flex items-center gap-1 ml-4">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={`/${currentSlug}/${item.href}`}
            className="px-3 h-9 flex items-center text-sm text-muted hover:text-text transition-colors rounded-md"
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex-1" />

      {role === "admin" && (
        <Link
          href="/admin/users"
          className="hidden lg:flex px-3 h-9 items-center text-sm text-muted hover:text-text transition-colors rounded-md"
        >
          Administrace
        </Link>
      )}

      <UserMenu fullName={fullName} role={role} />
    </header>
  );
}
