# BRIEFING PRO NOVÝ TERMINÁL

## Co je tento projekt

Weblyx CRM (`/Users/zen/zenuly/`) — interní CRM pro callcentrum. Next.js 16, Supabase, Tailwind v4.
Specifikace: `docs/specifikace-weblyx.md`, postup: `docs/postup-prompty.md`, design: `docs/design.md`

## Co je hotové

- Krok 1–8: Kompletní (projekt, schéma, auth, import, karta leadu, fronta, zápis výsledku)
- Krok 9: Kalendáře (CalendarProvider + Google + Notion) — HOTOVO

## Co zbývá — dělej POSTUPNĚ (10 → 11 → 12)

Po každém kroku: `npm run build && npm run lint` musí projít.
NECOMMITUJ DO GITU.

---

# KROK 10: E-maily (Resend)

Zadání: Napoj odesílání e-mailů (Resend) se šablonami A a B ze specifikace, předvyplněním proměnných a odesláním jedním tlačítkem z úkolu. Odeslání uzavře úkol, zapíše se do historie a posune fázi. Automatický e-mail po vyčerpání pokusů.
Hotovo, když: testovací nabídka i prezentace dorazí a úkol se uzavře.

## Krok 10 — Pořadí implementace (10 kroků)

1. `src/lib/resend.ts` — sendEmail utility (přímý fetch na api.resend.com/emails, žádný npm resend)
2. `src/lib/template-renderer.ts` — renderTemplate (nahrazení {{variable}})
3. `supabase/migrations/012_email_sending.sql` — sent_emails tabulka + RLS, unreachable šablona, complete_send_task RPC
4. `src/app/actions/emails.ts` — sendTemplateEmail + sendAutoEmail
5. Úprava `src/app/actions/calls.ts` — po recordOutcome s auto_email volat sendAutoEmail
6. `src/app/(app)/[projectSlug]/ukoly/page.tsx` — seznam úkolů (Server Component)
7. `src/app/(app)/[projectSlug]/_components/send-email-form.tsx` — formulář odeslání emailu z úkolu
8. Rozšíření get_lead_card (v migraci 012 nebo nové) — sent_emails v kartě leadu
9. Úprava bottom-nav — přidat "Úkoly" s badge
10. `npx supabase db push && npm run lint && npm run build`

## Krok 10 — Detaily

### src/lib/resend.ts
```typescript
type SendEmailParams = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

export async function sendEmail(params: SendEmailParams): Promise<{ id: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${process.env.RESEND_FROM_NAME} <${process.env.RESEND_FROM_EMAIL}>`,
      to: [params.to],
      subject: params.subject,
      html: params.html,
      reply_to: params.replyTo,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Resend error: ${err.message}`);
  }
  return res.json();
}
```

### src/lib/template-renderer.ts
```typescript
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
}
```

### supabase/migrations/012_email_sending.sql
```sql
CREATE TABLE sent_emails (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL REFERENCES projects(id),
  lead_id       uuid NOT NULL REFERENCES leads(id),
  task_id       uuid REFERENCES tasks(id),
  template_key  text NOT NULL,
  to_email      text NOT NULL,
  subject       text NOT NULL,
  body_html     text NOT NULL,
  resend_id     text,
  sent_by       uuid REFERENCES profiles(id),
  sent_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sent_emails_lead ON sent_emails(lead_id, sent_at DESC);

ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY se_admin ON sent_emails FOR ALL
  USING (auth_user_role() = 'admin');
CREATE POLICY se_member_select ON sent_emails FOR SELECT
  USING (is_project_member(project_id));
CREATE POLICY se_member_insert ON sent_emails FOR INSERT
  WITH CHECK (is_project_member(project_id));

INSERT INTO email_templates (project_id, key, name, subject, body_html, variables) VALUES
  ('00000000-0000-0000-0000-000000000001', 'unreachable',
   'Nedosažitelný',
   'Zkoušeli jsme vás zastihnout – {{company}}',
   '<p>Dobrý den,</p><p>v posledních dnech jsme se vám několikrát pokoušeli dovolat ohledně možností pro váš web.</p><p>Pokud máte zájem o nezávaznou konzultaci zdarma, stačí odpovědět na tento e-mail nebo zavolat na {{phone}}.</p><p>Přeji hezký den,<br>Weblyx</p>',
   '["company", "phone"]');

CREATE OR REPLACE FUNCTION complete_send_task(p_task_id uuid, p_email_sent boolean DEFAULT true)
RETURNS jsonb AS $$
DECLARE
  v_task tasks%ROWTYPE;
  v_new_stage_id uuid;
BEGIN
  SELECT * INTO v_task FROM tasks WHERE id = p_task_id FOR UPDATE;
  IF v_task IS NULL THEN RAISE EXCEPTION 'Task not found'; END IF;
  UPDATE tasks SET status = 'completed', completed_at = now() WHERE id = p_task_id;
  IF v_task.task_type = 'send_offer' THEN
    SELECT id INTO v_new_stage_id FROM stages WHERE project_id = v_task.project_id AND key = 'offer_sent';
    IF v_new_stage_id IS NOT NULL THEN
      UPDATE leads SET stage_id = v_new_stage_id, updated_at = now() WHERE id = v_task.lead_id;
    END IF;
  END IF;
  INSERT INTO audit_log (project_id, lead_id, user_id, action, details)
  VALUES (v_task.project_id, v_task.lead_id, auth.uid(), 'task_completed',
    jsonb_build_object('task_type', v_task.task_type::text, 'email_sent', p_email_sent));
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### src/app/actions/emails.ts
Server actions:
- `sendTemplateEmail(taskId, projectId, leadId, templateKey, toEmail, variables)` — načte šablonu, renderuje, odešle Resend, uloží do sent_emails, zavolá complete_send_task
- `sendAutoEmail(projectId, leadId, leadEmail, leadCompany)` — šablona unreachable, odešle, uloží, audit

### calls.ts integrace
Po recordOutcome pokud `auto_email && max_attempts_reached` a lead má email → volat sendAutoEmail.

### Úkoly stránka
`/[projectSlug]/ukoly/` — seznam pending tasks, seřazeno podle due_at. Každý úkol: typ, firma, termín, tlačítko "Otevřít" → send-email-form.

### send-email-form.tsx
Předvyplněný email z leadu, šablona s proměnnými, preview, tlačítko "Odeslat".

### Env proměnné
```
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=info@zenuly.cz
RESEND_FROM_NAME=Weblyx
```

---

# KROK 11: Směny a výkon — dokončení

Zadání: Živé počítadlo hovorů za hodinu vs. cíl, upozornění na podezřele rychlé zápisy, měsíční export odpracovaných hodin pro admina.
Poznámka: Směny (start/pause/resume/end) UŽ FUNGUJÍ. Chybí jen monitoring a export.
Hotovo, když: z exportu spočítáš výplatu za testovací směny.

## Krok 11 — Pořadí implementace (7 kroků)

1. `supabase/migrations/013_performance_alerts.sql` — alerts tabulka + check_rapid_calls trigger + get_operator_stats RPC + export_monthly_hours RPC
2. `src/app/actions/performance.ts` — getOperatorStats, getMonthlyHours, exportMonthlyHoursCSV
3. `src/app/(app)/[projectSlug]/vykon/page.tsx` — stránka Výkon pro operátora (KPI dlaždice)
4. `src/app/(app)/[projectSlug]/export-hodin/page.tsx` — export pro admina (tabulka + CSV download)
5. Úprava shift-bar.tsx — live polling, vizuál "pod cílem"
6. Úprava bottom-nav — přidat "Výkon"
7. `npx supabase db push && npm run lint && npm run build`

## Krok 11 — Detaily

### 013_performance_alerts.sql
```sql
CREATE TABLE alerts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  alert_type  text NOT NULL,
  operator_id uuid REFERENCES profiles(id),
  details     jsonb NOT NULL DEFAULT '{}',
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_alerts_project ON alerts(project_id, created_at DESC);
CREATE INDEX idx_alerts_unread ON alerts(project_id, read) WHERE read = false;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY alerts_admin ON alerts FOR ALL USING (auth_user_role() = 'admin');

CREATE OR REPLACE FUNCTION check_rapid_calls() RETURNS TRIGGER AS $$
DECLARE v_prev_call timestamptz; v_gap_s int;
BEGIN
  SELECT created_at INTO v_prev_call FROM calls
  WHERE operator_id = NEW.operator_id AND project_id = NEW.project_id AND id != NEW.id
  ORDER BY created_at DESC LIMIT 1;
  IF v_prev_call IS NOT NULL THEN
    v_gap_s := EXTRACT(EPOCH FROM (NEW.created_at - v_prev_call))::int;
    IF v_gap_s < 20 THEN
      INSERT INTO alerts (project_id, alert_type, operator_id, details)
      VALUES (NEW.project_id, 'rapid_calls', NEW.operator_id,
        jsonb_build_object('gap_seconds', v_gap_s, 'call_id', NEW.id, 'previous_call_at', v_prev_call));
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_check_rapid_calls AFTER INSERT ON calls
  FOR EACH ROW EXECUTE FUNCTION check_rapid_calls();
```

Plus RPC `get_operator_stats` a `export_monthly_hours` — viz plán v task-055.

### Export CSV
- Středník jako oddělovač (české Excel)
- UTF-8 BOM (`\uFEFF`) pro správné otevření
- Admin only

---

# KROK 12: Denní report

Zadání: Stránka pro admina přesně podle předlohy `docs/design-predloha/08-report-majitele.html` + e-mail každý pracovní den v 18:30 Europe/Prague.
Hotovo, když: report dorazí sám a čísla sedí s daty v databázi.

## Krok 12 — Pořadí implementace (9 kroků)

1. `supabase/migrations/014_daily_report.sql` — get_daily_report RPC (celý report v jedné funkci)
2. `src/app/actions/report.ts` — getDailyReport Server Action
3. `src/app/(app)/[projectSlug]/report/page.tsx` — admin stránka
4. Komponenty v `report/_components/`: kpi-grid, lost-reasons-chart, operators-table, funnel-chart, recommendations-panel
5. `src/lib/report-email-template.ts` — HTML email renderer (inline CSS, tabulky pro Outlook)
6. `src/app/api/cron/daily-report/route.ts` — cron endpoint
7. `vercel.json` — cron schedule (30 16 * * 1-5 UTC = 18:30 Prague)
8. Navigace — přidat "Report" pro admina
9. `npx supabase db push && npm run lint && npm run build`

## Krok 12 — Detaily

### get_daily_report RPC
Vrací jsonb s: operators, outcomes, lost_reasons, lost_trend_7d, funnel, funnel_prev_week, overdue_tasks, overdue_callbacks, KPI.
Kompletní SQL viz plán v task-056.

### Layout podle předlohy 08
- KPI dlaždice (6 sloupců): Hovory, Dovoláno, Konzultace*, Prezentace, Nabídky, Nemá zájem
- "Konzultace" má accent border
- Proč odmítli (horizontální pruhy CSS) + Doporučení (tmavý panel, placeholder)
- Tabulka operátorů + Trychtýř + Nedodělky
- CSS-only grafy (žádné knihovny)

### Cron endpoint
Vercel cron volá `/api/cron/daily-report`. Ověří CRON_SECRET, zkontroluje pracovní den, pro každý projekt: get_daily_report → renderReportEmail → Resend.

### Env proměnné
```
CRON_SECRET=...
```

---

## Globální pravidla

- NECOMMITUJ DO GITU (Vercel auto-deploy stojí peníze)
- UI v češtině, kód anglicky
- Supabase: lftzebeptmmyoljyifbe.supabase.co, migrace v supabase/migrations/ (poslední je 011)
- Dev server: localhost:3098
- Design předlohy: `docs/design-predloha/`
- Specifikace: `docs/specifikace-weblyx.md`
