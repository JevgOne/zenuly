import { redirect } from "next/navigation";

export const instant = false;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>;
}) {
  const { projectSlug } = await params;
  redirect(`/${projectSlug}/fronta`);
}
