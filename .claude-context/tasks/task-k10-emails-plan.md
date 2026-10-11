# TASK-K10: E-maily přes Resend — Implementační plán

## Cíl
Napojit Resend pro odesílání e-mailů se šablonami A (nabídka) a B (prezentace), předvyplnění proměnných, odesílání jedním tlačítkem z úkolu. Odeslání uzavře úkol, zapíše do historie a posune fázi. Automatický e-mail po vyčerpání pokusů.

## Předpoklady
- Resend účet vytvořen, API klíč v `.env.local` jako `RESEND_API_KEY`
- Odesílací doména ověřena v Resend (např. `crm@zenuly.cz` nebo `noreply@weblyx.cz`)
- `RESEND_FROM_EMAIL` env proměnná

## Existující stav
- Tabulka `email_templates` existuje s šablonami `offer` a `deck` (seed.sql)
- Tabulka `tasks` existuje s typy `send_offer`, `send_deck`, `check_contact`
- `record_call_outcome` už vytváří tasky při outcome `offer` (task `send_offer`, +24h) a `deck` (task `send_deck`, ihned)
- Výsledek `no_answer` po 4. pokusu vrací `auto_email: true` v JSONB
- Tabulka `email_templates` má `variables` pole (JSON array názvů proměnných)
- Outcome-panel sbírá `email` od operátora u `offer` a `deck`

## Implementační kroky

### Krok 1: Instalace Resend SDK
```bash
npm install resend
```

### Krok 2: Email sending utility
**Soubor**: `src/lib/email/send.ts`
```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendTemplateEmail(params: {
  to: string;
  templateKey: string;
  projectId: string;
  variables: Record<string, string>;
}): Promise<{ id: string }> {
  // 1. Načti šablonu z DB (email_templates kde project_id + key)
  // 2. Nahraď {{variable}} v subject i body_html
  // 3. Odešli přes resend.emails.send({
  //      from: process.env.RESEND_FROM_EMAIL,
  //      to: params.to,
  //      subject: interpolated subject,
  //      html: interpolated body
  //    })
  // 4. Vrať email ID
}

export async function sendAutoEmail(params: {
  to: string;
  leadCompany: string;
  contactPerson: string | null;
}): Promise<{ id: string }> {
  // Automatický email po vyčerpání pokusů
  // Hardcoded šablona "Zkoušeli jsme vás zastihnout"
  // Subject: "Weblyx — zkoušeli jsme vás zastihnout"
}
```

**Použít admin client** pro čtení šablony (bypass RLS).

### Krok 3: Server action pro odeslání emailu z úkolu
**Soubor**: `src/app/actions/emails.ts`
```typescript
"use server";

export async function sendTaskEmail(params: {
  taskId: string;
  variables: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
  // 1. Načti task (s lead daty a šablonou)
  // 2. Ověř že task.status === 'pending' a task je přiřazen auth.uid()
  // 3. Zjisti email leadu
  // 4. Zavolej sendTemplateEmail
  // 5. Uzavři task: UPDATE tasks SET status='completed', completed_at=now()
  // 6. Zapiš do audit_log (action: 'email_sent')
  // 7. Posuň fázi podle pravidel:
  //    - send_offer → stage 'offer_sent'
  //    - send_deck → stage zůstává 'contacted' (už je)
  // 8. Vrať výsledek
}

export async function getTaskDetail(taskId: string): Promise<TaskDetail> {
  // Načti task + lead + šablonu + proměnné pro předvyplnění
}

export async function getTasksForProject(projectId: string): Promise<Task[]> {
  // Seznam úkolů pro operátora/admina
}
```

### Krok 4: Úprava `record_call_outcome` výsledku — automatický email
**Soubor**: `src/app/actions/calls.ts`

Po `recordOutcome`, pokud `result.auto_email === true`:
```typescript
// Po record_call_outcome, pokud max_attempts_reached:
if (result.auto_email && result.max_attempts_reached) {
  const admin = createAdminClient();
  const { data: lead } = await admin
    .from('leads')
    .select('email, company, contact_person')
    .eq('id', params.leadId)
    .single();
  
  if (lead?.email) {
    await sendAutoEmail({
      to: lead.email,
      leadCompany: lead.company,
      contactPerson: lead.contact_person,
    });
  }
}
```

### Krok 5: UI stránka pro úkoly
**Soubor**: `src/app/(app)/[projectSlug]/ukoly/page.tsx`

Tato stránka již existuje v navigaci (BottomNav má "Úkoly" s href "ukoly") ale soubor pravděpodobně neexistuje.

Obsah:
- Seznam úkolů seřazený: po termínu (červené) → dnes → budoucí
- Každý úkol: firma, typ (Odeslat nabídku / Odeslat prezentaci / Zkontrolovat kontakt), termín
- Klik → detail s předvyplněnou šablonou

### Krok 6: UI detail úkolu s email editorem
**Soubor**: `src/app/(app)/[projectSlug]/ukoly/[taskId]/page.tsx` nebo modal/sheet

Obsah:
- Hlavička: firma, typ úkolu, termín
- Šablona s předvyplněnými proměnnými z leadu:
  - `contact_person` → lead.contact_person
  - `web` → lead.website
  - `sector` → lead.custom_data.sector
  - `finding_1`, `finding_2` → lead.findings nebo prázdné (operátor vyplní)
  - `project_type`, `price`, `delivery_date` → prázdné (operátor vyplní)
  - `next_contact_date` → vypočítat z callback_delay
  - `booking_link` → generovat z calendar slotů
- Editovatelné pole pro každou proměnnou
- **Jedno tlačítko "Odeslat"** → `sendTaskEmail`
- Po odeslání: snackbar "E-mail odeslán", redirect zpět na frontu/úkoly

### Krok 7: DB migrace pro tracking odeslaných emailů
**Soubor**: `supabase/migrations/012_email_tracking.sql`

```sql
-- Tracking odeslaných emailů
CREATE TABLE sent_emails (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id),
  lead_id     uuid NOT NULL REFERENCES leads(id),
  task_id     uuid REFERENCES tasks(id),
  template_key text,
  to_email    text NOT NULL,
  subject     text NOT NULL,
  resend_id   text,
  sent_by     uuid NOT NULL REFERENCES profiles(id),
  sent_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sent_emails_lead ON sent_emails(lead_id, sent_at DESC);

-- RLS
ALTER TABLE sent_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY se_read ON sent_emails FOR SELECT
  USING (auth_user_role() = 'admin' OR sent_by = auth.uid());
CREATE POLICY se_insert ON sent_emails FOR INSERT
  WITH CHECK (sent_by = auth.uid() OR auth_user_role() = 'admin');
```

### Krok 8: Zobrazit odeslané emaily v historii leadu
- Rozšířit `get_lead_card` RPC aby vracela i emaily z `sent_emails`
- Nebo přidat do `history-list.tsx` separátní query

### Krok 9: Stage posun po odeslání
V `sendTaskEmail`:
- Pokud task_type = `send_offer`:
  ```sql
  UPDATE leads SET stage_id = (SELECT id FROM stages WHERE project_id = $1 AND key = 'offer_sent')
  WHERE id = $leadId AND stage_id != (SELECT id FROM stages WHERE project_id = $1 AND key = 'offer_sent');
  ```
- Pokud task_type = `send_deck`: fáze se nemění (zůstává `contacted`)

## Soubory k vytvoření/upravit

| Soubor | Akce |
|--------|------|
| `src/lib/email/send.ts` | NOVÝ — email utility |
| `src/app/actions/emails.ts` | NOVÝ — server actions |
| `src/app/actions/calls.ts` | UPRAVIT — auto email po max attempts |
| `src/app/(app)/[projectSlug]/ukoly/page.tsx` | NOVÝ — seznam úkolů |
| `src/app/(app)/[projectSlug]/ukoly/task-list.tsx` | NOVÝ — client component |
| `src/app/(app)/[projectSlug]/ukoly/task-email-form.tsx` | NOVÝ — formulář s šablonou |
| `supabase/migrations/012_email_tracking.sql` | NOVÝ — tracking tabulka |
| `package.json` | UPRAVIT — přidat `resend` |

## Env proměnné (produkce)
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL` (např. `Weblyx CRM <crm@zenuly.cz>`)

## Kritérium "Hotovo, když"
- [x] Testovací nabídka dorazí na email
- [x] Testovací prezentace dorazí na email
- [x] Odeslání uzavře úkol v DB
- [x] Fáze se posune na `offer_sent` po odeslání nabídky
- [x] Automatický email po 4. nepřijatém pokusu
- [x] Vše zapsáno v audit_log
