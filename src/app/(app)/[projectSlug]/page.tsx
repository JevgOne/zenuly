import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const instant = false;

export default async function ProjectPage({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role === "admin") {
    redirect(`/${projectSlug}/dashboard`);
  }

  // Check project_members for manager role
  const { data: membership } = await supabase
    .from("project_members")
    .select("role")
    .eq("profile_id", user.id)
    .single();
  if (membership?.role === "manager") {
    redirect(`/${projectSlug}/dashboard`);
  }

  redirect(`/${projectSlug}/fronta`);
}
