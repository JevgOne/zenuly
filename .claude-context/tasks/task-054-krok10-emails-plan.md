# TASK-K10: E-maily přes Resend — Kompletní implementační plán

> Planner v2, 2026-10-10 — přepracovaný plán s kompletním kódem

## Cíl
Napojit odesílání e-mailů (Resend) se šablonami A (nabídka) a B (prezentace), předvyplněním proměnných a odesláním jedním tlačítkem z úkolu. Odeslání uzavře úkol, zapíše se do historie a posune fázi podle pravidel. Přidej automatický e-mail po vyčerpání pokusů.

**Hotovo, když**: testovací nabídka i prezentace dorazí a úkol se uzavře.

---

## Existující stav (analýza codebase)

### Co už funguje
- **DB tabulky**: `email_templates` (seed.sql: šablony `offer` a `deck` s variables), `tasks` (typy `send_offer`, `send_deck`, `send_report`, `check_contact`)
- **`record_call_outcome`** (004): vytváří tasky automaticky — outcome `offer` → task `send_offer` (+24h), `deck` → task `send_deck` (ihned), `report` → task `send_report` (ihned, admin)
- **Výsledek `no_answer`** po 4. pokusu: vrací `{ auto_email: true, max_attempts_reached: true }` v JSONB
- **Outcome-panel** (`outcome-panel.tsx`): sbírá `email` od operátora u `offer`, `deck`, `report`
- **Navigace**: "Úkoly" tab v bottom-nav a app-header (href `ukoly`), ale stránka `/ukoly/` neexistuje
- **Task types enum** (001): `send_offer`, `send_deck`, `send_report`, `check_contact`, `custom`
- **Šablony v seedu**: `offer` (subject: "Rozbor webu {{web}} a nabídka od Weblyxu", variables: contact_person, web, finding_1, finding_2, project_type, price, delivery_date, next_contact_date, booking_link), `deck` (subject: "Ukázky webů pro {{sector}}", variables: contact_person, sector, reference_1, reference_2, next_contact_date)

### Co chybí
1. Resend SDK (`package.json` nemá `resend`)
2. Email sending utility
3. Server actions pro práci s úkoly
4. Stránka `/[projectSlug]/ukoly/` — seznam úkolů
5. Formulář s předvyplněnou šablonou pro odeslání emailu
6. Automatický email po vyčerpání pokusů (implementace v `calls.ts`)
7. Tracking odeslaných emailů (DB tabulka)
8. Stage posun po odeslání (offer → `offer_sent`)
9. Zobrazení odeslaných emailů v historii leadu

---

## Pořadí implementace (8 kroků)

### KROK 1: Instalace Resend SDK

```bash
npm install resend
```

**Env proměnné** (`.env.local` + Vercel):
```
RESEND_API_KEY=re_xxxxxxxxxxxx
RESEND_FROM_EMAIL=Weblyx CRM <crm@zenuly.cz>
```

---

### KROK 2: Email sending utility

**Nový soubor**: `src/lib/email/send.ts`

```typescript
import "server-only";
import { Resend } from "resend";
import { createAdminClient } from "@/lib/supabase/admin";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL ?? "Weblyx CRM <noreply@zenuly.cz>";

/**
 * Interpolate {{variable}} placeholders in a string.
 */
function interpolate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => variables[key] ?? ""
  );
}

/**
 * Send an email using a template from email_templates table.
 * Resolves template by project_id + key, interpolates variables.
 */
export async function sendTemplateEmail(params: {
  to: string;
  templateKey: string;
  projectId: string;
  variables: Record<string, string>;
}): Promise<{ id: string; subject: string }> {
  const supabase = createAdminClient();

  const { data: template, error: tplErr } = await supabase
    .from("email_templates")
    .select("subject, body_html")
    .eq("project_id", params.projectId)
    .eq("key", params.templateKey)
    .single();

  if (tplErr || !template) {
    throw new Error(`Email template '${params.templateKey}' not found`);
  }

  const subject = interpolate(template.subject as string, params.variables);
  const html = interpolate(template.body_html as string, params.variables);

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [params.to],
    subject,
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  return { id: data!.id, subject };
}

/**
 * Send automatic "we tried to reach you" email after max attempts.
 * Not based on a template — hardcoded content per spec.
 */
export async function sendUnreachableEmail(params: {
  to: string;
  contactPerson: string | null;
  company: string;
  projectId: string;
}): Promise<{ id: string }> {
  const greeting = params.contactPerson
    ? `Dobrý den, ${params.contactPerson},`
    : "Dobrý den,";

  const html = `<p>${greeting}</p>
<p>několikrát jsme se vás pokoušeli zastihnout telefonicky ohledně možností, jak vylepšit webovou prezentaci firmy ${params.company}.</p>
<p>Pokud byste měli zájem o nezávaznou konzultaci, stačí odpovědět na tento e-mail nebo zavolat.</p>
<p>Přeji hezký den,<br>Weblyx</p>`;

  const { data, error } = await resend.emails.send({
    from: FROM,
    to: [params.to],
    subject: "Weblyx — zkoušeli jsme vás zastihnout",
    html,
  });

  if (error) {
    throw new Error(`Resend error: ${error.message}`);
  }

  // Audit log
  const supabase = createAdminClient();
  await supabase.from("audit_log").insert({
    project_id: params.projectId,
    action: "auto_email_sent",
    details: {
      type: "unreachable",
      to: params.to,
      company: params.company,
      resend_id: data!.id,
    },
  });

  return { id: data!.id };
}
```

---

### KROK 3: DB migrace — tracking + RPCs

**Nový soubor**: `supabase/migrations/012_email_sending.sql`

```sql
-- =============================================
-- 012: Email sending — tracking, task RPCs
-- =============================================

-- 1. Tracking table for sent emails
CREATE TABLE sent_emails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id),
  lead_id      uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  task_id      uuid REFERENCES tasks(id),
  template_key text,
  to_email     text NOT NULL,
  subject      text NOT NULL,
  resend_id    text,
  sent_by      uuid NOT NULL REFERENCES profiles(id),
  sent_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sent_emails_lead ON sent_emails(lead_id, sent_at DESC);
CREATE INDEX idx_sent_emails_project ON sent_emails(project_id, sent_at DESC);

ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY se_read_admin ON sent_emails FOR SELECT
  USING (auth_user_role() = 'admin');

CREATE POLICY se_read_own ON sent_emails FOR SELECT
  USING (sent_by = auth.uid());

CREATE POLICY se_insert ON sent_emails FOR INSERT
  WITH CHECK (true);

-- =============================================
-- 2. RPC: complete a task + optionally move stage + record email
-- =============================================
CREATE OR REPLACE FUNCTION complete_task_and_move_stage(
  p_task_id uuid,
  p_email_record jsonb DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_new_stage_id uuid;
  v_result jsonb := '{"success": true}'::jsonb;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task IS NULL THEN
    RAISE EXCEPTION 'Task % not found', p_task_id;
  END IF;

  IF v_task.status != 'pending' THEN
    RAISE EXCEPTION 'Task % is not pending (status: %)', p_task_id, v_task.status;
  END IF;

  -- Complete the task
  UPDATE tasks
  SET status = 'completed', completed_at = now()
  WHERE id = p_task_id;

  -- Move stage for send_offer → offer_sent
  IF v_task.task_type = 'send_offer' THEN
    SELECT id INTO v_new_stage_id
    FROM stages
    WHERE project_id = v_task.project_id AND key = 'offer_sent';

    IF v_new_stage_id IS NOT NULL THEN
      UPDATE leads
      SET stage_id = v_new_stage_id, updated_at = now()
      WHERE id = v_task.lead_id;

      v_result := v_result || jsonb_build_object('stage_moved', 'offer_sent');
    END IF;
  END IF;

  -- Record sent email if provided
  IF p_email_record IS NOT NULL THEN
    INSERT INTO sent_emails (
      project_id, lead_id, task_id, template_key,
      to_email, subject, resend_id, sent_by
    ) VALUES (
      v_task.project_id,
      v_task.lead_id,
      v_task.id,
      p_email_record->>'template_key',
      p_email_record->>'to_email',
      p_email_record->>'subject',
      p_email_record->>'resend_id',
      auth.uid()
    );
  END IF;

  -- Audit log
  INSERT INTO audit_log (project_id, lead_id, user_id, action, details)
  VALUES (
    v_task.project_id,
    v_task.lead_id,
    auth.uid(),
    'task_completed',
    jsonb_build_object(
      'task_id', p_task_id,
      'task_type', v_task.task_type::text,
      'email_sent', p_email_record IS NOT NULL
    )
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- 3. RPC: get pending tasks for operator/admin
-- =============================================
CREATE OR REPLACE FUNCTION get_task_list(
  p_project_id uuid
) RETURNS TABLE (
  id uuid,
  lead_id uuid,
  company_name text,
  contact_person text,
  lead_email text,
  lead_website text,
  task_type task_type,
  status task_status,
  due_at timestamptz,
  is_overdue boolean,
  note text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.lead_id,
    l.company AS company_name,
    l.contact_person,
    l.email AS lead_email,
    l.website AS lead_website,
    t.task_type,
    t.status,
    t.due_at,
    (t.due_at < now() AND t.status = 'pending') AS is_overdue,
    t.note,
    t.created_at
  FROM tasks t
  JOIN leads l ON l.id = t.lead_id
  WHERE t.project_id = p_project_id
    AND (
      t.assigned_to = auth.uid()
      OR auth_user_role() = 'admin'
    )
    AND t.status = 'pending'
  ORDER BY
    CASE WHEN t.due_at < now() THEN 0 ELSE 1 END,
    t.due_at ASC;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================
-- 4. RPC: get single task detail with template + lead data
-- =============================================
CREATE OR REPLACE FUNCTION get_task_detail(
  p_task_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_lead leads%ROWTYPE;
  v_template jsonb;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id;
  IF v_task IS NULL THEN
    RETURN jsonb_build_object('error', 'Task not found');
  END IF;

  -- Access check
  IF v_task.assigned_to != auth.uid() AND auth_user_role() != 'admin' THEN
    RETURN jsonb_build_object('error', 'Access denied');
  END IF;

  SELECT * INTO v_lead FROM leads WHERE id = v_task.lead_id;

  -- Map task_type to email template key
  SELECT jsonb_build_object(
    'key', et.key,
    'name', et.name,
    'subject', et.subject,
    'body_html', et.body_html,
    'variables', et.variables
  ) INTO v_template
  FROM email_templates et
  WHERE et.project_id = v_task.project_id
    AND et.key = CASE v_task.task_type
      WHEN 'send_offer' THEN 'offer'
      WHEN 'send_deck' THEN 'deck'
      ELSE NULL
    END;

  RETURN jsonb_build_object(
    'task', jsonb_build_object(
      'id', v_task.id,
      'task_type', v_task.task_type::text,
      'status', v_task.status::text,
      'due_at', v_task.due_at,
      'note', v_task.note,
      'created_at', v_task.created_at
    ),
    'lead', jsonb_build_object(
      'id', v_lead.id,
      'company', v_lead.company,
      'contact_person', v_lead.contact_person,
      'phone', v_lead.phone,
      'email', v_lead.email,
      'website', v_lead.website,
      'city', v_lead.city,
      'custom_data', COALESCE(v_lead.custom_data, '{}'::jsonb)
    ),
    'template', v_template
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- =============================================
-- 5. Update get_lead_card to include sent_emails
-- =============================================
CREATE OR REPLACE FUNCTION get_lead_card(p_lead_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_lead jsonb;
  v_calls jsonb;
  v_custom_fields jsonb;
  v_emails jsonb;
BEGIN
  -- Lead data
  SELECT jsonb_build_object(
    'id', l.id,
    'company_name', l.company,
    'contact_person', l.contact_person,
    'phone', l.phone,
    'email', l.email,
    'website', l.website,
    'city', l.city,
    'ico', l.ico,
    'lead_source', l.lead_source,
    'phone_source', l.phone_source::text,
    'findings', l.findings,
    'hook_text', l.hook_text,
    'hook_source', l.hook_source,
    'stage_key', s.key,
    'stage_name', s.name,
    'priority', l.priority,
    'attempt_count', l.attempt_count,
    'max_attempts', p.max_attempts,
    'next_action_at', l.next_action_at,
    'next_action_type', l.next_action_type::text,
    'postponed_until', l.postponed_until,
    'postpone_reason', l.postpone_reason,
    'custom_data', l.custom_data,
    'created_at', l.created_at,
    'updated_at', l.updated_at,
    'owner_id', l.owner_id
  ) INTO v_lead
  FROM leads l
  JOIN stages s ON s.id = l.stage_id
  JOIN projects p ON p.id = l.project_id
  WHERE l.id = p_lead_id;

  IF v_lead IS NULL THEN
    RETURN jsonb_build_object('error', 'Lead not found');
  END IF;

  -- Call history (last 10)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'outcome_name', o.name,
      'outcome_key', o.key,
      'outcome_group', o.group_name,
      'operator_name', pr.full_name,
      'note', c.note,
      'created_at', c.created_at
    ) ORDER BY c.created_at DESC
  ), '[]'::jsonb) INTO v_calls
  FROM (
    SELECT * FROM calls WHERE lead_id = p_lead_id ORDER BY created_at DESC LIMIT 10
  ) c
  JOIN outcomes o ON o.id = c.outcome_id
  JOIN profiles pr ON pr.id = c.operator_id;

  -- Custom fields
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'key', cf.key,
      'name', cf.name,
      'field_type', cf.field_type::text,
      'options', cf.options
    ) ORDER BY cf.position
  ), '[]'::jsonb) INTO v_custom_fields
  FROM custom_fields cf
  WHERE cf.project_id = (
    SELECT l2.project_id FROM leads l2 WHERE l2.id = p_lead_id
  );

  -- Sent emails
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', se.id,
      'template_key', se.template_key,
      'to_email', se.to_email,
      'subject', se.subject,
      'sent_by_name', pr.full_name,
      'sent_at', se.sent_at
    ) ORDER BY se.sent_at DESC
  ), '[]'::jsonb) INTO v_emails
  FROM sent_emails se
  JOIN profiles pr ON pr.id = se.sent_by
  WHERE se.lead_id = p_lead_id;

  RETURN v_lead || jsonb_build_object(
    'calls', v_calls,
    'custom_fields', v_custom_fields,
    'sent_emails', v_emails
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

---

### KROK 4: Server actions pro úkoly a emaily

**Nový soubor**: `src/app/actions/tasks.ts`

```typescript
"use server";

import { createClient } from "@/lib/supabase/server";
import { sendTemplateEmail } from "@/lib/email/send";

export type TaskListItem = {
  id: string;
  lead_id: string;
  company_name: string;
  contact_person: string | null;
  lead_email: string | null;
  lead_website: string | null;
  task_type: string;
  status: string;
  due_at: string;
  is_overdue: boolean;
  note: string | null;
  created_at: string;
};

export type TaskDetail = {
  task: {
    id: string;
    task_type: string;
    status: string;
    due_at: string;
    note: string | null;
    created_at: string;
  };
  lead: {
    id: string;
    company: string;
    contact_person: string | null;
    phone: string;
    email: string | null;
    website: string | null;
    city: string | null;
    custom_data: Record<string, unknown>;
  };
  template: {
    key: string;
    name: string;
    subject: string;
    body_html: string;
    variables: string[];
  } | null;
};

export async function getTaskList(
  projectId: string
): Promise<TaskListItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_task_list", {
    p_project_id: projectId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as TaskListItem[];
}

export async function getTaskDetail(
  taskId: string
): Promise<TaskDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_task_detail", {
    p_task_id: taskId,
  });
  if (error) throw new Error(error.message);
  if (!data || data.error) return null;
  return data as TaskDetail;
}

export async function sendTaskEmail(params: {
  taskId: string;
  to: string;
  variables: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  const detail = await getTaskDetail(params.taskId);
  if (!detail) return { success: false, error: "Task not found" };

  if (detail.task.status !== "pending") {
    return { success: false, error: "Task is already completed" };
  }

  if (!detail.template) {
    const { error } = await supabase.rpc("complete_task_and_move_stage", {
      p_task_id: params.taskId,
      p_email_record: null,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  const { data: taskRow } = await supabase
    .from("tasks")
    .select("project_id")
    .eq("id", params.taskId)
    .single();

  if (!taskRow) return { success: false, error: "Task not found" };

  let resendId: string;
  let subject: string;
  try {
    const result = await sendTemplateEmail({
      to: params.to,
      templateKey: detail.template.key,
      projectId: taskRow.project_id as string,
      variables: params.variables,
    });
    resendId = result.id;
    subject = result.subject;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Email sending failed",
    };
  }

  const { error: rpcError } = await supabase.rpc(
    "complete_task_and_move_stage",
    {
      p_task_id: params.taskId,
      p_email_record: {
        template_key: detail.template.key,
        to_email: params.to,
        subject,
        resend_id: resendId,
      },
    }
  );

  if (rpcError) {
    return { success: false, error: rpcError.message };
  }

  return { success: true };
}

export async function completeTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_task_and_move_stage", {
    p_task_id: taskId,
    p_email_record: null,
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}
```

---

### KROK 5: Úprava `calls.ts` — automatický email po max attempts

**Soubor k úpravě**: `src/app/actions/calls.ts`

**Přidat import** na řádku 4 (za stávající importy):
```typescript
import { sendUnreachableEmail } from "@/lib/email/send";
```

**Přidat blok ZA calendar event blok** (za řádek 79, před `return result`):

```typescript
  // Auto email after max attempts (no_answer 4x)
  if (result.auto_email && result.max_attempts_reached) {
    try {
      const admin = createAdminClient();
      const { data: leadData } = await admin
        .from("leads")
        .select("project_id, company, contact_person, email")
        .eq("id", params.leadId)
        .single();

      const emailAddr = params.email ?? leadData?.email;
      if (emailAddr && leadData) {
        await sendUnreachableEmail({
          to: emailAddr as string,
          contactPerson: leadData.contact_person as string | null,
          company: leadData.company as string,
          projectId: leadData.project_id as string,
        });
        result.auto_email_sent = true;
      }
    } catch {
      // Auto email failed — don't block outcome save
    }
  }
```

---

### KROK 6: Stránka seznam úkolů

**Nový soubor**: `src/app/(app)/[projectSlug]/ukoly/page.tsx`

```typescript
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { TaskListView } from "./task-list-view";

export const instant = false;

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

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .single();

  if (!project) redirect("/");

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-xl font-semibold text-text mb-6">Úkoly</h1>
      <TaskListView projectId={project.id as string} projectSlug={projectSlug} />
    </div>
  );
}
```

---

### KROK 7: Client components — TaskListView + TaskEmailSheet

**Nový soubor**: `src/app/(app)/[projectSlug]/ukoly/task-list-view.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import { getTaskList, type TaskListItem } from "@/app/actions/tasks";
import { TaskEmailSheet } from "./task-email-sheet";

const TASK_TYPE_LABELS: Record<string, string> = {
  send_offer: "Odeslat nabídku",
  send_deck: "Odeslat prezentaci",
  send_report: "Odeslat rozbor",
  check_contact: "Zkontrolovat kontakt",
  custom: "Vlastní úkol",
};

function formatDue(iso: string): string {
  return new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export function TaskListView({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = await getTaskList(projectId);
      setTasks(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handleTaskCompleted = () => {
    setSelectedTaskId(null);
    load();
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-surface border border-line rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-muted text-[15px]">Zatím žádné úkoly.</p>
        <p className="text-muted text-[13px] mt-1">
          Úkoly se vytváří automaticky po zápisu výsledku hovoru.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {tasks.map((task) => (
          <button
            key={task.id}
            type="button"
            onClick={() => setSelectedTaskId(task.id)}
            className="w-full text-left bg-surface border border-line rounded-xl px-4 py-3.5 hover:border-accent/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[15px] font-medium text-text block truncate">
                  {task.company_name}
                </span>
                <span className="text-[13px] text-muted block mt-0.5">
                  {TASK_TYPE_LABELS[task.task_type] ?? task.task_type}
                </span>
              </div>
              <div className="text-right shrink-0">
                {task.is_overdue ? (
                  <span className="text-[12px] font-medium text-urgent bg-urgent-soft px-2 py-0.5 rounded-md">
                    po termínu {timeAgo(task.due_at)}
                  </span>
                ) : (
                  <span className="text-[12px] font-mono text-muted">
                    {formatDue(task.due_at)}
                  </span>
                )}
              </div>
            </div>
            {task.lead_email && (
              <span className="text-[12px] text-muted mt-1 block truncate">
                {task.lead_email}
              </span>
            )}
          </button>
        ))}
      </div>

      {selectedTaskId && (
        <TaskEmailSheet
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onCompleted={handleTaskCompleted}
        />
      )}
    </>
  );
}
```

**Nový soubor**: `src/app/(app)/[projectSlug]/ukoly/task-email-sheet.tsx`

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import {
  getTaskDetail,
  sendTaskEmail,
  completeTask,
  type TaskDetail,
} from "@/app/actions/tasks";

const TASK_TYPE_LABELS: Record<string, string> = {
  send_offer: "Odeslat nabídku",
  send_deck: "Odeslat prezentaci",
  send_report: "Odeslat rozbor",
  check_contact: "Zkontrolovat kontakt",
};

function prefillVariables(
  variableNames: string[],
  lead: TaskDetail["lead"]
): Record<string, string> {
  const prefill: Record<string, string> = {};
  for (const v of variableNames) {
    switch (v) {
      case "contact_person":
        prefill[v] = lead.contact_person ?? "";
        break;
      case "web":
        prefill[v] = lead.website ?? "";
        break;
      case "sector":
        prefill[v] = (lead.custom_data?.sector as string) ?? "";
        break;
      case "project_type":
        prefill[v] = (lead.custom_data?.project_type as string) ?? "";
        break;
      case "next_contact_date": {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        prefill[v] = d.toLocaleDateString("cs-CZ");
        break;
      }
      default:
        prefill[v] = (lead.custom_data?.[v] as string) ?? "";
    }
  }
  return prefill;
}

const VARIABLE_LABELS: Record<string, string> = {
  contact_person: "Kontaktní osoba",
  web: "Web firmy",
  finding_1: "Zjištění 1",
  finding_2: "Zjištění 2",
  project_type: "Typ projektu",
  price: "Cena (Kč)",
  delivery_date: "Termín dodání",
  next_contact_date: "Datum dalšího kontaktu",
  booking_link: "Odkaz na konzultaci",
  sector: "Obor",
  reference_1: "Reference 1",
  reference_2: "Reference 2",
};

export function TaskEmailSheet({
  taskId,
  onClose,
  onCompleted,
}: {
  taskId: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [toEmail, setToEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    getTaskDetail(taskId).then((d) => {
      setDetail(d);
      setLoading(false);
      if (d) {
        setToEmail(d.lead.email ?? "");
        if (d.template) {
          setVariables(prefillVariables(d.template.variables, d.lead));
        }
      }
    });
  }, [taskId]);

  const handleSend = useCallback(async () => {
    if (!detail || sending) return;
    setSending(true);
    setError("");

    if (detail.template) {
      const result = await sendTaskEmail({
        taskId,
        to: toEmail,
        variables,
      });
      if (result.success) {
        setSent(true);
        setTimeout(() => onCompleted(), 1500);
      } else {
        setError(result.error ?? "Odeslání se nepovedlo.");
      }
    } else {
      const result = await completeTask(taskId);
      if (result.success) {
        setSent(true);
        setTimeout(() => onCompleted(), 1000);
      } else {
        setError(result.error ?? "Uzavření se nepovedlo.");
      }
    }

    setSending(false);
  }, [detail, sending, taskId, toEmail, variables, onCompleted]);

  const canSubmit =
    detail && !sending && !sent && (detail.template ? toEmail.includes("@") : true);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        onKeyDown={() => {}}
        role="presentation"
      />
      <div className="relative w-full sm:max-w-lg bg-surface rounded-t-2xl sm:rounded-2xl border border-line max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-surface border-b border-line px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-[16px] font-semibold text-text">
            {detail ? TASK_TYPE_LABELS[detail.task.task_type] ?? "Úkol" : "Načítám…"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted hover:text-text hover:bg-bg transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="p-5 space-y-4">
            <div className="h-6 bg-bg rounded animate-pulse" />
            <div className="h-20 bg-bg rounded animate-pulse" />
          </div>
        ) : !detail ? (
          <div className="p-5">
            <p className="text-urgent text-[14px]">Úkol nenalezen.</p>
          </div>
        ) : sent ? (
          <div className="p-5 text-center py-12">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-green-50 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M5 12l5 5L19 7" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="text-[15px] font-medium text-text">
              {detail.template ? "E-mail odeslán" : "Úkol uzavřen"}
            </p>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="bg-bg rounded-lg px-4 py-3">
              <span className="text-[15px] font-medium text-text block">
                {detail.lead.company}
              </span>
              {detail.lead.contact_person && (
                <span className="text-[13px] text-muted block">
                  {detail.lead.contact_person}
                </span>
              )}
            </div>

            {detail.template ? (
              <>
                <div>
                  <label className="text-[13px] font-medium text-muted block mb-1">
                    Komu
                  </label>
                  <input
                    type="email"
                    value={toEmail}
                    onChange={(e) => setToEmail(e.target.value)}
                    placeholder="firma@email.cz"
                    className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
                  />
                </div>

                {detail.template.variables.map((v) => (
                  <div key={v}>
                    <label className="text-[13px] font-medium text-muted block mb-1">
                      {VARIABLE_LABELS[v] ?? v}
                    </label>
                    <input
                      type="text"
                      value={variables[v] ?? ""}
                      onChange={(e) =>
                        setVariables({ ...variables, [v]: e.target.value })
                      }
                      className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
                    />
                  </div>
                ))}

                <div className="bg-bg rounded-lg px-4 py-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block mb-1">
                    Předmět
                  </span>
                  <span className="text-[14px] text-text">
                    {detail.template.subject.replace(
                      /\{\{(\w+)\}\}/g,
                      (_, key: string) =>
                        variables[key] || `[${VARIABLE_LABELS[key] ?? key}]`
                    )}
                  </span>
                </div>
              </>
            ) : (
              <div className="bg-bg rounded-lg px-4 py-3">
                <p className="text-[14px] text-text">
                  Zkontrolujte kontaktní údaje leadu a potvrďte dokončení.
                </p>
                {detail.task.note && (
                  <p className="text-[13px] text-muted mt-2">
                    Poznámka: {detail.task.note}
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="text-urgent text-[13px] font-medium">{error}</p>
            )}

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSubmit}
              className="w-full h-[52px] bg-accent text-white rounded-lg font-semibold text-[15px] hover:bg-accent/90 transition-colors disabled:opacity-50"
            >
              {sending
                ? "Odesílám…"
                : detail.template
                  ? "Odeslat e-mail"
                  : "Uzavřít úkol"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

---

### KROK 8: Úprava history-list — zobrazit odeslané emaily

**Soubor k úpravě**: `src/app/actions/leads.ts`

Přidat do `LeadCardData` type:
```typescript
sent_emails: {
  id: string;
  template_key: string | null;
  to_email: string;
  subject: string;
  sent_by_name: string;
  sent_at: string;
}[];
```

**Soubor k úpravě**: `src/app/(app)/[projectSlug]/_components/history-list.tsx`

Sloučit `calls` a `sent_emails` do jedné timeline seřazené podle data. Email záznamy zobrazit s ikonou obálky:
- `[datum] Nabídka odeslána na firma@email.cz — operátor`
- Typ šablony: offer → "Nabídka", deck → "Prezentace", null → "E-mail"

---

## Shrnutí všech souborů

| Soubor | Akce | Popis |
|--------|------|-------|
| `package.json` | UPRAVIT | `npm install resend` |
| `src/lib/email/send.ts` | NOVÝ | Resend SDK wrapper, `sendTemplateEmail`, `sendUnreachableEmail` |
| `supabase/migrations/012_email_sending.sql` | NOVÝ | `sent_emails` tabulka, 4 RPC, aktualizovaný `get_lead_card` |
| `src/app/actions/tasks.ts` | NOVÝ | Server actions: `getTaskList`, `getTaskDetail`, `sendTaskEmail`, `completeTask` |
| `src/app/actions/calls.ts` | UPRAVIT | Import `sendUnreachableEmail`, přidat auto email blok |
| `src/app/actions/leads.ts` | UPRAVIT | Přidat `sent_emails` do `LeadCardData` type |
| `src/app/(app)/[projectSlug]/ukoly/page.tsx` | NOVÝ | Server page |
| `src/app/(app)/[projectSlug]/ukoly/task-list-view.tsx` | NOVÝ | Client — seznam úkolů |
| `src/app/(app)/[projectSlug]/ukoly/task-email-sheet.tsx` | NOVÝ | Client — email formulář s předvyplněnými proměnnými |
| `src/app/(app)/[projectSlug]/_components/history-list.tsx` | UPRAVIT | Přidat emaily do timeline |

## Env proměnné (produkce)

| Klíč | Hodnota |
|------|---------|
| `RESEND_API_KEY` | `re_xxxxxxxxxxxx` |
| `RESEND_FROM_EMAIL` | `Weblyx CRM <crm@zenuly.cz>` |

## Kritérium "Hotovo, když"
- [ ] `npm install resend` proběhne
- [ ] Migrace 012 projde na DB
- [ ] Stránka `/weblyx/ukoly` zobrazí pending úkoly
- [ ] Klik na "Odeslat nabídku" → formulář s předvyplněnými proměnnými z leadu
- [ ] Odeslání → email dorazí na adresu příjemce
- [ ] Úkol se uzavře (`tasks.status = 'completed'`)
- [ ] Fáze leadu se posune na `offer_sent` (u nabídky)
- [ ] Zápis do `sent_emails` + `audit_log`
- [ ] Prezentace dorazí analogicky (fáze zůstává `contacted`)
- [ ] Po 4. nepřijatém hovoru se automaticky odešle email "zkoušeli jsme vás zastihnout"
- [ ] Odeslané emaily se zobrazí v historii leadu
- [ ] `npm run build` projde bez chyb
