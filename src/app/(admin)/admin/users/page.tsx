import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { PageHelpButton } from "@/components/page-help-button";
import { InviteForm } from "./invite-form";
import { UserActions } from "./user-actions";

export default async function UsersPage() {
  const admin = createAdminClient();

  // Load all profiles with their project memberships
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, full_name, role, created_at")
    .order("created_at", { ascending: true });

  // Load all project memberships with project-level role
  const { data: memberships } = await admin
    .from("project_members")
    .select("profile_id, role, projects(id, name, slug)");

  // Load all projects for the invite form
  const { data: projects } = await admin
    .from("projects")
    .select("id, name, slug");

  // Get emails from auth (profiles don't store email)
  const {
    data: { users: authUsers },
  } = await admin.auth.admin.listUsers();

  const emailMap = new Map(
    (authUsers ?? []).map((u) => [u.id, u.email ?? ""])
  );

  // Group memberships by profile
  const membershipMap = new Map<
    string,
    { id: string; name: string; slug: string; role: string }[]
  >();
  for (const m of memberships ?? []) {
    const proj = m.projects as unknown as {
      id: string;
      name: string;
      slug: string;
    };
    if (!proj) continue;
    const list = membershipMap.get(m.profile_id) ?? [];
    list.push({ ...proj, role: m.role as string });
    membershipMap.set(m.profile_id, list);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <PageHelpButton text="Správa uživatelů — pozvánky, přiřazení k projektům, role a odebrání přístupu." />
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-text transition-colors mb-4"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Zpět
      </Link>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-text">Správa uživatelů</h1>
        <InviteForm projects={projects ?? []} />
      </div>

      <div className="bg-surface border border-line rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-bg">
              <th className="text-left px-4 py-3 font-medium text-muted">
                Jméno
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted">
                E-mail
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted">
                Role
              </th>
              <th className="text-left px-4 py-3 font-medium text-muted">
                Projekty
              </th>
              <th className="text-right px-4 py-3 font-medium text-muted">
                Akce
              </th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <tr key={p.id} className="border-b border-line last:border-b-0">
                <td className="px-4 py-3 font-medium text-text">
                  {p.full_name}
                </td>
                <td className="px-4 py-3 text-muted">
                  {emailMap.get(p.id) ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-sm text-xs font-medium ${
                      p.role === "admin"
                        ? "bg-accent-soft text-accent"
                        : "bg-bg text-muted"
                    }`}
                  >
                    {p.role === "admin" ? "Admin" : "Uživatel"}
                  </span>
                </td>
                <td className="px-4 py-3 text-muted">
                  {(membershipMap.get(p.id) ?? [])
                    .map((proj) => `${proj.name} (${p.role === "admin" ? "admin" : proj.role === "manager" ? "manažer" : "operátor"})`)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <UserActions
                    profileId={p.id}
                    fullName={p.full_name}
                    memberships={membershipMap.get(p.id) ?? []}
                    allProjects={projects ?? []}
                    globalRole={p.role}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  );
}
