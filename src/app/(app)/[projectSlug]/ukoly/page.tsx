import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SendEmailForm } from "../_components/send-email-form";

export const instant = false;

type TaskRow = {
  id: string;
  task_type: string;
  status: string;
  due_at: string;
  note: string | null;
  lead_id: string;
  project_id: string;
  leads: {
    company: string;
    email: string | null;
    contact_person: string | null;
    website: string | null;
    custom_data: Record<string, unknown>;
  };
};

const TASK_LABELS: Record<string, string> = {
  send_offer: "Odeslat nabídku",
  send_deck: "Odeslat prezentaci",
  check_contact: "Zkontrolovat kontakt",
  custom: "Úkol",
};

const TEMPLATE_MAP: Record<string, string> = {
  send_offer: "offer",
  send_deck: "deck",
};

export default async function TasksPage({
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

  // Get project
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .single();

  if (!project) redirect("/");

  // Load pending tasks with lead info
  const { data: tasks } = await supabase
    .from("tasks")
    .select(
      "id, task_type, status, due_at, note, lead_id, project_id, leads(company, email, contact_person, website, custom_data)"
    )
    .eq("project_id", project.id)
    .eq("status", "pending")
    .order("due_at", { ascending: true });

  const taskList = (tasks ?? []) as unknown as TaskRow[];

  // Load email templates for this project
  const { data: templates } = await supabase
    .from("email_templates")
    .select("key, name, subject, body_html, variables")
    .eq("project_id", project.id);

  const templateMap = new Map(
    (templates ?? []).map((t) => [t.key as string, t])
  );

  if (taskList.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-semibold text-text mb-6">Úkoly</h1>
        <div className="bg-surface border border-line rounded-lg p-8 text-center">
          <p className="text-muted text-[15px]">
            Žádné nevyřízené úkoly.
          </p>
          <p className="text-muted text-[13px] mt-1">
            Úkoly se vytvářejí automaticky při zápisu výsledku hovoru.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-text mb-6">Úkoly</h1>
      <div className="space-y-3">
        {taskList.map((task) => {
          const isOverdue = new Date(task.due_at) < new Date();
          const templateKey = TEMPLATE_MAP[task.task_type];
          const template = templateKey
            ? templateMap.get(templateKey)
            : null;

          // Pre-fill known variables from lead
          const lead = task.leads;
          const knownVars: Record<string, string> = {};
          if (lead.contact_person) knownVars.contact_person = lead.contact_person;
          if (lead.company) knownVars.company = lead.company;
          if (lead.website) knownVars.web = lead.website;
          if (lead.custom_data?.sector)
            knownVars.sector = lead.custom_data.sector as string;

          return (
            <div
              key={task.id}
              className="bg-surface border border-line rounded-lg p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[15px] font-medium text-text">
                    {TASK_LABELS[task.task_type] ?? task.task_type}
                  </p>
                  <p className="text-[14px] text-muted mt-0.5">
                    {lead.company}
                  </p>
                </div>
                <span
                  className={`text-[12px] font-mono whitespace-nowrap shrink-0 px-2 py-1 rounded ${
                    isOverdue
                      ? "text-urgent bg-urgent-soft"
                      : "text-muted bg-bg"
                  }`}
                >
                  {new Date(task.due_at).toLocaleString("cs-CZ", {
                    day: "numeric",
                    month: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Europe/Prague",
                  })}
                </span>
              </div>

              {task.note && (
                <p className="text-[13px] text-muted mt-2">{task.note}</p>
              )}

              {/* Email send form for send_offer / send_deck */}
              {template && (
                <SendEmailForm
                  taskId={task.id}
                  projectId={task.project_id}
                  leadId={task.lead_id}
                  templateKey={templateKey!}
                  templateSubject={template.subject as string}
                  templateBody={template.body_html as string}
                  templateVariables={
                    (template.variables as string[]) ?? []
                  }
                  leadEmail={lead.email ?? ""}
                  knownVariables={knownVars}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
