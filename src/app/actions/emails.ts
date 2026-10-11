"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderTemplate } from "@/lib/template-renderer";

/** Send a template email from a task (operator/admin clicks "Send") */
export async function sendTemplateEmail(params: {
  taskId: string;
  projectId: string;
  leadId: string;
  templateKey: string;
  toEmail: string;
  variables: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Not authenticated" };

  // Load template
  const { data: template } = await supabase
    .from("email_templates")
    .select("subject, body_html")
    .eq("project_id", params.projectId)
    .eq("key", params.templateKey)
    .single();

  if (!template) return { success: false, error: "Template not found" };

  const subject = renderTemplate(
    template.subject as string,
    params.variables
  );
  const html = renderTemplate(
    template.body_html as string,
    params.variables
  );

  // Send via Resend
  let resendId: string | null = null;
  try {
    const result = await sendEmail({
      to: params.toEmail,
      subject,
      html,
    });
    resendId = result.id;
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Email sending failed",
    };
  }

  // Record in sent_emails
  const admin = createAdminClient();
  await admin.from("sent_emails").insert({
    project_id: params.projectId,
    lead_id: params.leadId,
    task_id: params.taskId,
    template_key: params.templateKey,
    to_email: params.toEmail,
    subject,
    body_html: html,
    resend_id: resendId,
    sent_by: user.id,
  });

  // Complete the task + advance stage
  await supabase.rpc("complete_send_task", {
    p_task_id: params.taskId,
    p_email_sent: true,
  });

  return { success: true };
}

/** Send automatic "unreachable" email after max attempts */
export async function sendAutoEmail(params: {
  projectId: string;
  leadId: string;
  leadEmail: string;
  leadCompany: string;
}): Promise<void> {
  const admin = createAdminClient();

  // Load unreachable template
  const { data: template } = await admin
    .from("email_templates")
    .select("subject, body_html")
    .eq("project_id", params.projectId)
    .eq("key", "unreachable")
    .single();

  if (!template) return;

  const variables: Record<string, string> = {
    company: params.leadCompany,
    phone: process.env.RESEND_FROM_PHONE ?? "+420 123 456 789",
  };

  const subject = renderTemplate(
    template.subject as string,
    variables
  );
  const html = renderTemplate(
    template.body_html as string,
    variables
  );

  let resendId: string | null = null;
  try {
    const result = await sendEmail({
      to: params.leadEmail,
      subject,
      html,
    });
    resendId = result.id;
  } catch {
    // Auto email failed — log but don't block
    await admin.from("audit_log").insert({
      project_id: params.projectId,
      lead_id: params.leadId,
      action: "auto_email_failed",
      details: { template_key: "unreachable" },
    });
    return;
  }

  // Record sent email
  await admin.from("sent_emails").insert({
    project_id: params.projectId,
    lead_id: params.leadId,
    template_key: "unreachable",
    to_email: params.leadEmail,
    subject,
    body_html: html,
    resend_id: resendId,
    sent_by: null,
  });

  // Audit
  await admin.from("audit_log").insert({
    project_id: params.projectId,
    lead_id: params.leadId,
    action: "auto_email_sent",
    details: { template_key: "unreachable", resend_id: resendId },
  });
}
