import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const instant = false;

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Admin only
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || (profile.role !== "admin" && profile.role !== "manager"))
    redirect(`/${projectSlug}/fronta`);

  // Load pipeline stages with lead counts
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .single();
  if (!project) redirect("/");

  const { data: stages } = await supabase
    .from("stages")
    .select("id, name, key, type, position")
    .eq("project_id", project.id)
    .order("position");

  // Count leads per stage
  const stageCounts: { name: string; key: string; type: string; count: number }[] = [];
  for (const stage of stages ?? []) {
    const { count } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("project_id", project.id)
      .eq("stage_id", stage.id);
    stageCounts.push({
      name: stage.name as string,
      key: stage.key as string,
      type: stage.type as string,
      count: count ?? 0,
    });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text mb-6">Pipeline</h1>
      <div className="flex flex-col gap-3">
        {stageCounts.map((stage) => {
          const maxCount = Math.max(...stageCounts.map((s) => s.count), 1);
          const pct = Math.max((stage.count / maxCount) * 100, 2);
          const colorClass =
            stage.type === "won"
              ? "bg-green-500"
              : stage.type === "lost"
                ? "bg-urgent"
                : "bg-accent";
          return (
            <div
              key={stage.key}
              className="bg-surface border border-line rounded-lg p-4"
            >
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium text-text">
                  {stage.name}
                </span>
                <span className="font-mono text-sm text-text">
                  {stage.count}
                </span>
              </div>
              <div className="h-2 bg-bg rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${colorClass}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
