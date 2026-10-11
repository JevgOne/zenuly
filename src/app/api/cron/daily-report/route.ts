import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/resend";
import { renderReportEmail } from "@/lib/report-email-template";
import type { ReportData } from "@/app/actions/report";

export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const pragueWeekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Prague",
    weekday: "short",
  }).format(now);

  if (["Sat", "Sun"].includes(pragueWeekday)) {
    return Response.json({ skipped: "weekend" });
  }

  // Only send at 18:xx Prague time (handles both CEST and CET cron triggers)
  const pragueHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Prague",
      hour: "numeric",
      hour12: false,
    }).format(now)
  );
  if (pragueHour !== 18) {
    return Response.json({ skipped: "not 18:30 Prague" });
  }

  const pragueDate = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Prague",
  }).format(now);

  const admin = createAdminClient();

  const { data: projects } = await admin
    .from("projects")
    .select("id, name, slug")
    .eq("is_active", true);

  if (!projects || projects.length === 0) {
    return Response.json({ skipped: "no_active_projects" });
  }

  const results: { project: string; sent: boolean; error?: string }[] = [];

  for (const project of projects) {
    try {
      const { data: reportData, error: rpcError } = await admin.rpc(
        "get_daily_report",
        {
          p_project_id: project.id,
          p_date: pragueDate,
        }
      );

      if (rpcError) {
        results.push({
          project: project.name as string,
          sent: false,
          error: rpcError.message,
        });
        continue;
      }

      const report = reportData as ReportData;
      const { subject, html } = renderReportEmail(report);

      const { data: adminId } = await admin.rpc("find_project_admin", {
        p_project_id: project.id,
      });

      if (!adminId) {
        results.push({
          project: project.name as string,
          sent: false,
          error: "No admin found",
        });
        continue;
      }

      const {
        data: { user: adminUser },
      } = await admin.auth.admin.getUserById(adminId as string);

      if (!adminUser?.email) {
        results.push({
          project: project.name as string,
          sent: false,
          error: "Admin has no email",
        });
        continue;
      }

      await sendEmail({
        to: adminUser.email,
        subject,
        html,
      });

      await admin.from("audit_log").insert({
        project_id: project.id,
        action: "daily_report_sent",
        details: {
          date: pragueDate,
          to: adminUser.email,
          total_calls: report.total_calls,
          total_meetings: report.total_meetings,
        },
      });

      results.push({ project: project.name as string, sent: true });
    } catch (err) {
      results.push({
        project: project.name as string,
        sent: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return Response.json({ results, date: pragueDate });
}
