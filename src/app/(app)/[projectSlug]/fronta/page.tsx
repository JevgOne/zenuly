import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CallingLayout } from "../_components/calling-layout";

export const instant = false;

export default async function FrontaPage({
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

  // Get profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, onboarding_completed")
    .eq("id", user.id)
    .single();

  // Get project
  const { data: project } = await supabase
    .from("projects")
    .select("id, calls_per_hour")
    .eq("slug", projectSlug)
    .single();

  if (!project) redirect("/");

  // Get lost reasons for outcome panel
  const { data: lostReasons } = await supabase
    .from("lost_reasons")
    .select("id, name")
    .eq("project_id", project.id)
    .order("position");

  return (
    <CallingLayout
      projectId={project.id}
      callerName={profile?.full_name ?? "Operátor"}
      callsPerHour={project.calls_per_hour}
      lostReasons={(lostReasons ?? []).map((r) => ({ id: r.id, name: r.name }))}
      onboardingCompleted={profile?.onboarding_completed ?? false}
    />
  );
}
