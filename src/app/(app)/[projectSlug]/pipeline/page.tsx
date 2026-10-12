import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PageHelpButton } from "@/components/page-help-button";

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
  if (!profile) redirect("/login");
  if (profile.role !== "admin") {
    const { data: membership } = await supabase
      .from("project_members")
      .select("role")
      .eq("profile_id", user.id)
      .single();
    if (!membership || membership.role !== "manager")
      redirect(`/${projectSlug}/fronta`);
  }

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

  // Count leads per stage with a single aggregated query
  const { data: leadCounts } = await supabase
    .rpc("get_lead_counts_by_stage", { p_project_id: project.id })
    .select("stage_id, count");

  // Fallback: if the RPC doesn't exist, use a simpler approach
  const countMap = new Map<string, number>();
  if (leadCounts) {
    for (const row of leadCounts as unknown as { stage_id: string; count: number }[]) {
      countMap.set(row.stage_id, row.count);
    }
  } else {
    // Single query to get all counts at once
    const { data: rawCounts } = await supabase
      .from("leads")
      .select("stage_id")
      .eq("project_id", project.id);
    for (const row of rawCounts ?? []) {
      countMap.set(row.stage_id, (countMap.get(row.stage_id) ?? 0) + 1);
    }
  }

  const stageCounts: { name: string; key: string; type: string; count: number }[] =
    (stages ?? []).map((stage) => ({
      name: stage.name as string,
      key: stage.key as string,
      type: stage.type as string,
      count: countMap.get(stage.id) ?? 0,
    }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <PageHelpButton text="Pipeline zobrazuje leady podle fází prodejního procesu — od nového kontaktu po domluvenou konzultaci." />
      <h1 className="text-2xl font-semibold text-text mb-6">Pipeline</h1>
      <div className="flex flex-col gap-3">
        {stageCounts.length === 0 && (
          <p className="text-muted text-[15px] text-center py-8">
            Pipeline zatím nemá žádné fáze.
          </p>
        )}
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
