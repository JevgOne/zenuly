import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { PerformanceDashboard } from "../_components/performance-dashboard";

export const instant = false;

export default async function VykonPage({
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

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .single();

  if (!project) redirect("/");

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text mb-6">Výkon</h1>
      <PerformanceDashboard projectId={project.id} />
    </div>
  );
}
