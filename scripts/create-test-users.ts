import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  // 1. Create admin
  console.log("Creating admin...");
  const { data: admin, error: adminErr } =
    await supabase.auth.admin.createUser({
      email: "admin@zenuly.cz",
      password: "Admin123!",
      email_confirm: true,
      user_metadata: { full_name: "Admin Zenuly", role: "admin" },
    });
  if (adminErr) {
    console.error("Admin error:", adminErr.message);
  } else {
    console.log("Admin created:", admin.user.id);
    // Ensure profile role is admin
    await supabase
      .from("profiles")
      .update({ role: "admin", full_name: "Admin Zenuly" })
      .eq("id", admin.user.id);
  }

  // 2. Create operator
  console.log("Creating operator...");
  const { data: operator, error: opErr } =
    await supabase.auth.admin.createUser({
      email: "operator@zenuly.cz",
      password: "Operator123!",
      email_confirm: true,
      user_metadata: { full_name: "Operátor Test", role: "operator" },
    });
  if (opErr) {
    console.error("Operator error:", opErr.message);
  } else {
    console.log("Operator created:", operator.user.id);
  }

  // 3. Find Weblyx project
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", "weblyx")
    .single();

  if (project) {
    // Assign both users to Weblyx
    for (const user of [admin?.user, operator?.user].filter(Boolean)) {
      const { error } = await supabase.from("project_members").insert({
        project_id: project.id,
        profile_id: user!.id,
      });
      console.log(`${user!.email} → Weblyx:`, error?.message ?? "OK");
    }
  }

  // Verify
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role");
  console.log("\nProfiles:", JSON.stringify(profiles, null, 2));
}

main().catch(console.error);
