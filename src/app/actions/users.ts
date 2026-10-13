"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("Forbidden");
  return user;
}

export async function inviteOperator(formData: FormData) {
  await requireAdmin();

  const admin = createAdminClient();
  const email = formData.get("email") as string;
  const fullName = formData.get("full_name") as string;
  const projectIds = formData.getAll("project_ids") as string[];

  const { data: newUser, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (error) throw error;

  for (const projectId of projectIds) {
    const role = (formData.get(`role_${projectId}`) as string) || "operator";
    await admin.from("project_members").insert({
      project_id: projectId,
      profile_id: newUser.user.id,
      role,
    });
  }

  revalidatePath("/admin/users");
  return { userId: newUser.user.id };
}

export async function assignToProject(profileId: string, projectId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin.from("project_members").insert({
    project_id: projectId,
    profile_id: profileId,
  });
  revalidatePath("/admin/users");
}

export async function removeFromProject(profileId: string, projectId: string) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin
    .from("project_members")
    .delete()
    .eq("project_id", projectId)
    .eq("profile_id", profileId);
  revalidatePath("/admin/users");
}

export async function changeProjectRole(
  profileId: string,
  projectId: string,
  role: "operator" | "manager"
) {
  await requireAdmin();
  const admin = createAdminClient();
  await admin
    .from("project_members")
    .update({ role })
    .eq("project_id", projectId)
    .eq("profile_id", profileId);
  revalidatePath("/admin/users");
}

export async function updateUserName(profileId: string, newName: string) {
  await requireAdmin();
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Jméno nesmí být prázdné.");

  const admin = createAdminClient();

  const { error: dbError } = await admin
    .from("profiles")
    .update({ full_name: trimmed })
    .eq("id", profileId);
  if (dbError) throw new Error(dbError.message);

  const { error: authError } = await admin.auth.admin.updateUserById(profileId, {
    user_metadata: { full_name: trimmed },
  });
  if (authError) throw new Error(authError.message);

  revalidatePath("/admin/users");
  revalidatePath("/settings");
}

export async function updateOwnName(newName: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");

  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Jméno nesmí být prázdné.");

  const admin = createAdminClient();

  const { error: dbError } = await admin
    .from("profiles")
    .update({ full_name: trimmed })
    .eq("id", user.id);
  if (dbError) throw new Error(dbError.message);

  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: { full_name: trimmed },
  });
  if (authError) throw new Error(authError.message);

  revalidatePath("/settings");
  revalidatePath("/admin/users");
}

export async function deleteUser(profileId: string) {
  const currentUser = await requireAdmin();
  if (currentUser.id === profileId) {
    throw new Error("Nemůžete smazat vlastní účet.");
  }

  const admin = createAdminClient();

  // 1. Remove from all projects
  await admin
    .from("project_members")
    .delete()
    .eq("profile_id", profileId);

  // 2. Delete profile (cascade will handle related records)
  await admin
    .from("profiles")
    .delete()
    .eq("id", profileId);

  // 3. Delete from auth.users
  const { error } = await admin.auth.admin.deleteUser(profileId);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/users");
}
