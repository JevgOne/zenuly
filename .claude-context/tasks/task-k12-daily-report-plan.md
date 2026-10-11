# TASK-K12: Denní report — Implementační plán

## Cíl
Denní report podle specifikace (body 1–5): stránka pro admina přesně podle předlohy `08-report-majitele.html` a e-mail každý pracovní den v 18:30 Europe/Prague přes plánovanou úlohu.

## Specifikace reportu (5 sekcí)

1. **Hodiny, hovory, hovory/h vs. cíl, dovolatelnost** — po operátorech
2. **Konzultace, odeslané prezentace, odeslané nabídky, Jindy, Nemá zájem, nová Nevolat**
3. **Top 3 důvody ztráty dnes + trend 7 dní**
4. **Trychtýř**: dovoláno → zájem (výsledky 1–3) → konzultace, vs. minulý týden
5. **Nedodělky**: úkoly po termínu, propadlé callbacky

## Design z předlohy 08

### Layout (z HTML analýzy)
- Max-width 1240px, centred
- **Header**: "Denní report · {den} {datum}" + hlavní číslo "Weblyx dnes: {X} konzultací ze {Y} hovorů" + project switcher pills
- **KPI grid**: 6 dlaždic (auto-fit, min 170px)
  - Hovory (mono 30px) + hovory/h vs cíl
  - Dovoláno + % hovorů
  - **Konzultace** (accent-tint border, special styling)
  - Prezentace odeslány + po termínu count (urgent)
  - Nabídky odeslány + callback info
  - Nemá zájem + % dovolaných
- **Flex wrap row**:
  - Vlevo (flex 999): "Proč odmítli" — horizontal bar chart, top důvod v nadpisu, 7-day trend text
  - Vpravo (flex 1): "Doporučení na zítra" — tmavý panel (#16181D), 3 číslované body (fáze 4 — zatím placeholder nebo vynechat)
- **Flex wrap row**:
  - Vlevo (flex 999): Tabulka operátorů — sloupce: Operátor, Hodiny, Hovory, Za hodinu, Dovoláno, Konzultace. Pod cílem → urgent barva
  - Vpravo (flex 1): Trychtýř "Kde hovory padají" — 3 úrovně s horizontal bars + nedodělky text

## Implementační kroky

### Krok 1: DB RPC pro report data
**Soubor**: `supabase/migrations/013_daily_report.sql` (nebo společná s emailem)

```sql
CREATE OR REPLACE FUNCTION get_daily_report(
  p_project_id uuid,
  p_date date DEFAULT CURRENT_DATE
) RETURNS jsonb AS $$
DECLARE
  v_result jsonb;
  v_tz text;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_week_start timestamptz;
BEGIN
  -- Timezone a denní rozsah
  SELECT COALESCE(working_hours->>'timezone', 'Europe/Prague') INTO v_tz
  FROM projects WHERE id = p_project_id;
  
  v_day_start := (p_date::timestamp) AT TIME ZONE v_tz;
  v_day_end := ((p_date + 1)::timestamp) AT TIME ZONE v_tz;
  v_week_start := ((p_date - 7)::timestamp) AT TIME ZONE v_tz;

  SELECT jsonb_build_object(
    -- 1. CELKOVÉ KPI
    'total_calls', (SELECT COUNT(*) FROM calls WHERE project_id = p_project_id AND created_at >= v_day_start AND created_at < v_day_end),
    'total_reached', (SELECT COUNT(*) FROM calls c JOIN outcomes o ON o.id = c.outcome_id WHERE c.project_id = p_project_id AND c.created_at >= v_day_start AND c.created_at < v_day_end AND o.key NOT IN ('no_answer', 'busy')),
    'meetings', (SELECT COUNT(*) FROM calls c JOIN outcomes o ON o.id = c.outcome_id WHERE c.project_id = p_project_id AND c.created_at >= v_day_start AND c.created_at < v_day_end AND o.key = 'meeting'),
    'decks_sent', (SELECT COUNT(*) FROM calls c JOIN outcomes o ON o.id = c.outcome_id WHERE c.project_id = p_project_id AND c.created_at >= v_day_start AND c.created_at < v_day_end AND o.key = 'deck'),
    'offers_sent', (SELECT COUNT(*) FROM calls c JOIN outcomes o ON o.id = c.outcome_id WHERE c.project_id = p_project_id AND c.created_at >= v_day_start AND c.created_at < v_day_end AND o.key = 'offer'),
    'later_count', (SELECT COUNT(*) FROM calls c JOIN outcomes o ON o.id = c.outcome_id WHERE c.project_id = p_project_id AND c.created_at >= v_day_start AND c.created_at < v_day_end AND o.key = 'later'),
    'not_interested', (SELECT COUNT(*) FROM calls c JOIN outcomes o ON o.id = c.outcome_id WHERE c.project_id = p_project_id AND c.created_at >= v_day_start AND c.created_at < v_day_end AND o.key = 'not_interested'),
    'new_dnc', (SELECT COUNT(*) FROM do_not_call WHERE project_id = p_project_id AND created_at >= v_day_start AND created_at < v_day_end),

    -- 2. OPERÁTOŘI
    'operators', (
      SELECT COALESCE(jsonb_agg(op ORDER BY op->>'operator_name'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'operator_id', s.operator_id,
          'operator_name', p.full_name,
          'hours', ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(s.ended_at, now()) - s.started_at)) - s.total_pause_s) / 3600.0, 1),
          'calls', (SELECT COUNT(*) FROM calls c2 WHERE c2.operator_id = s.operator_id AND c2.project_id = p_project_id AND c2.created_at >= v_day_start AND c2.created_at < v_day_end),
          'reached', (SELECT COUNT(*) FROM calls c2 JOIN outcomes o2 ON o2.id = c2.outcome_id WHERE c2.operator_id = s.operator_id AND c2.project_id = p_project_id AND c2.created_at >= v_day_start AND c2.created_at < v_day_end AND o2.key NOT IN ('no_answer', 'busy')),
          'meetings', (SELECT COUNT(*) FROM calls c2 JOIN outcomes o2 ON o2.id = c2.outcome_id WHERE c2.operator_id = s.operator_id AND c2.project_id = p_project_id AND c2.created_at >= v_day_start AND c2.created_at < v_day_end AND o2.key = 'meeting')
        ) AS op
        FROM shifts s
        JOIN profiles p ON p.id = s.operator_id
        WHERE s.project_id = p_project_id
          AND s.started_at >= v_day_start
          AND s.started_at < v_day_end
          AND s.status = 'ended'
        GROUP BY s.operator_id, p.full_name
      ) sub
    ),

    -- 3. DŮVODY ZTRÁTY (dnes)
    'lost_reasons_today', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'reason_name', lr.name,
        'count', cnt
      ) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT l.lost_reason_id, COUNT(*) AS cnt
        FROM leads l
        JOIN stages st ON st.id = l.stage_id
        WHERE l.project_id = p_project_id
          AND st.type = 'lost'
          AND l.updated_at >= v_day_start
          AND l.updated_at < v_day_end
          AND l.lost_reason_id IS NOT NULL
        GROUP BY l.lost_reason_id
      ) sub
      JOIN lost_reasons lr ON lr.id = sub.lost_reason_id
    ),

    -- 3b. DŮVODY ZTRÁTY (7 dní)
    'lost_reasons_week', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'reason_name', lr.name,
        'count', cnt
      ) ORDER BY cnt DESC), '[]'::jsonb)
      FROM (
        SELECT l.lost_reason_id, COUNT(*) AS cnt
        FROM leads l
        JOIN stages st ON st.id = l.stage_id
        WHERE l.project_id = p_project_id
          AND st.type = 'lost'
          AND l.updated_at >= v_week_start
          AND l.updated_at < v_day_end
          AND l.lost_reason_id IS NOT NULL
        GROUP BY l.lost_reason_id
      ) sub
      JOIN lost_reasons lr ON lr.id = sub.lost_reason_id
    ),

    -- 4. TRYCHTÝŘ minulý týden pro porovnání
    'funnel_last_week', jsonb_build_object(
      'reached', (SELECT COUNT(*) FROM calls c JOIN outcomes o ON o.id = c.outcome_id WHERE c.project_id = p_project_id AND c.created_at >= v_week_start AND c.created_at < v_day_start AND o.key NOT IN ('no_answer', 'busy')),
      'interest', (SELECT COUNT(*) FROM calls c JOIN outcomes o ON o.id = c.outcome_id WHERE c.project_id = p_project_id AND c.created_at >= v_week_start AND c.created_at < v_day_start AND o.key IN ('meeting', 'offer', 'deck')),
      'meetings', (SELECT COUNT(*) FROM calls c JOIN outcomes o ON o.id = c.outcome_id WHERE c.project_id = p_project_id AND c.created_at >= v_week_start AND c.created_at < v_day_start AND o.key = 'meeting')
    ),

    -- 5. NEDODĚLKY
    'overdue_tasks', (SELECT COUNT(*) FROM tasks WHERE project_id = p_project_id AND status = 'pending' AND due_at < now()),
    'overdue_callbacks', (SELECT COUNT(*) FROM leads WHERE project_id = p_project_id AND is_active = true AND next_action_at < now() AND next_action_type = 'callback'),

    -- META
    'calls_per_hour_target', (SELECT calls_per_hour FROM projects WHERE id = p_project_id),
    'report_date', p_date
  ) INTO v_result;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

### Krok 2: Server action
**Soubor**: `src/app/actions/report.ts`

```typescript
"use server";

export async function getDailyReport(projectId: string, date?: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_daily_report', {
    p_project_id: projectId,
    p_date: date ?? new Date().toISOString().slice(0, 10),
  });
  if (error) throw new Error(error.message);
  return data;
}
```

### Krok 3: Admin stránka pro report
**Soubor**: `src/app/(app)/[projectSlug]/report/page.tsx`

Server component:
- Ověří role admin
- Zavolá `getDailyReport`
- Renderuje report dle předlohy 08

**Soubor**: `src/app/(app)/[projectSlug]/report/report-view.tsx`

Client component s celým reportem:
- Header s datem a hlavním číslem
- KPI grid (6 dlaždic)
- Důvody ztráty (horizontal bars)
- Doporučení panel (placeholder text nebo statický, AI až ve fázi 4)
- Tabulka operátorů
- Trychtýř

**Soubor**: `src/app/(app)/[projectSlug]/report/date-picker.tsx`

Picker pro historické reporty (výchozí = dnes).

### Krok 4: Navigace pro admina
Přidat odkaz "Report" do admin navigace / header.
- V `app-header.tsx` nebo `bottom-nav.tsx`: pokud role=admin, přidat "Report" link
- Nebo v hlavní navigaci jako podmíněný item

### Krok 5: Email report — denně 18:30

#### 5a. Email šablona
Report jako HTML email — zjednodušená verze stránky (inline styly, bez JS).

**Soubor**: `src/lib/email/report-template.ts`

```typescript
export function renderReportEmail(data: ReportData): string {
  // Generuje HTML s inline styly dle designu
  // Zjednodušená verze report-view (bez interakcí)
  // Barvy z design.md, IBM Plex Sans jako fallback
}
```

#### 5b. API route pro cron
**Soubor**: `src/app/api/cron/daily-report/route.ts`

```typescript
export async function GET(request: Request) {
  // 1. Ověřit CRON_SECRET (Vercel Cron nebo vlastní token)
  // 2. Načíst všechny aktivní projekty
  // 3. Pro každý projekt:
  //    a. Zavolat get_daily_report RPC
  //    b. Renderovat HTML email
  //    c. Najít admina projektu
  //    d. Odeslat email přes Resend
  // 4. Vrátit 200
}
```

#### 5c. Cron konfigurace
**Soubor**: `vercel.json`

```json
{
  "crons": [
    {
      "path": "/api/cron/daily-report",
      "schedule": "30 16 * * 1-5"
    }
  ]
}
```

Pozor: `30 16` = 16:30 UTC = 18:30 CEST (letní) / 17:30 CET (zimní).
Pro přesné 18:30 Europe/Prague by bylo potřeba dynamicky, ale Vercel Cron podporuje jen UTC.

**Alternativa**: Dvě konfigurace, nebo posun na 17:30 UTC (= 18:30 CET zimní, 19:30 CEST letní) a pak edge function kontroluje čas.

**Praktické řešení**: `30 16 * * 1-5` (UTC) — v létě přijde v 18:30, v zimě v 17:30. Nebo Supabase pg_cron který rozumí timezone.

#### 5d. Alternativa: Supabase pg_cron + Edge Function

```sql
-- V Supabase pg_cron (rozumí timezone)
SELECT cron.schedule(
  'daily-report',
  '30 18 * * 1-5',
  $$SELECT net.http_post(
    'https://zenuly.cz/api/cron/daily-report',
    headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.cron_secret')),
    body := '{}'
  )$$
);
```

### Krok 6: Kontrola pracovního dne
V cron API route: zkontrolovat že dnes je pracovní den (Po-Pá). Případné svátky zatím ignorovat.

## Soubory k vytvoření/upravit

| Soubor | Akce |
|--------|------|
| `supabase/migrations/013_daily_report.sql` | NOVÝ — RPC get_daily_report |
| `src/app/actions/report.ts` | NOVÝ — server action |
| `src/app/(app)/[projectSlug]/report/page.tsx` | NOVÝ — server page |
| `src/app/(app)/[projectSlug]/report/report-view.tsx` | NOVÝ — client component |
| `src/app/(app)/[projectSlug]/report/date-picker.tsx` | NOVÝ — výběr data |
| `src/lib/email/report-template.ts` | NOVÝ — HTML email šablona |
| `src/app/api/cron/daily-report/route.ts` | NOVÝ — cron endpoint |
| `vercel.json` | NOVÝ/UPRAVIT — cron schedule |
| `src/components/app-header.tsx` | UPRAVIT — přidat "Report" link pro admina |

## Env proměnné
- `CRON_SECRET` — pro ověření cron requestů
- `RESEND_API_KEY` — sdílený s K10
- `RESEND_FROM_EMAIL` — sdílený s K10

## Závislosti
- **K10** (Resend) musí být hotový předtím — sdílí email infrastrukturu
- **K11** (Shifts) — data o hodinách operátorů pro tabulku v reportu

## Kritérium "Hotovo, když"
- [ ] Report stránka zobrazuje správná data dle předlohy 08
- [ ] Email report dorazí v 18:30 (pracovní den)
- [ ] Čísla v reportu sedí s daty v DB
- [ ] Admin vidí report v navigaci
- [ ] Historické reporty (výběr data) fungují
