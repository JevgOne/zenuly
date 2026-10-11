# TASK-K11: Směny a výkon (doplnění) — Implementační plán

## Cíl
Doplnit chybějící části Kroku 11: živé počítadlo hovorů za hodinu vs. cíl, upozornění na podezřele rychlé zápisy, měsíční export odpracovaných hodin pro admina.

## Existující stav

### Co funguje
- **Směny**: start/pause/resume/end přes RPC (`007_queue_shifts_rpcs.sql`)
- **ShiftBar** (`shift-bar.tsx`): zobrazuje stav směny, progress bar `calls_this_hour / callsPerHour`, tlačítka Pauza/Pokračovat/Ukončit
- **DB tabulka `shifts`**: `id, project_id, operator_id, status, started_at, paused_at, ended_at, total_pause_s`
- **RPC `get_active_shift`**: vrací shift info + `calls_this_hour` (COUNT calls za aktuální hodinu)
- **DB tabulka `calls`**: `created_at` timestamp pro každý zaznamenaný hovor

### Co chybí
1. **Živé počítadlo vs. cíl** — ShiftBar zobrazuje `X / Y` ale neobnovuje se živě (jen při loadu, interval 60s na čas, ne na data)
2. **Upozornění na rychlé zápisy** — žádná detekce ani notifikace
3. **Měsíční export hodin** — žádná stránka ani export

## Implementační kroky

### Krok 1: Živé počítadlo — vylepšení ShiftBar

**Soubor**: `src/app/(app)/[projectSlug]/_components/shift-bar.tsx`

Současný stav: `calls_this_hour` se načte jednou v `useEffect` a neaktualizuje se po zápisu hovoru.

**Řešení**: 
- Po každém `recordOutcome` (v `calling-layout.tsx` nebo parent) vyvolat reload shift dat
- Přidat Supabase Realtime subscription na `calls` tabulku (INSERT) → automaticky přepočítat
- Nebo: jednodušeji — přidat callback `onCallRecorded` z `outcome-panel` → `ShiftBar.reload()`

**Konkrétní implementace**:
```typescript
// V shift-bar.tsx — exportovat reload funkci přes ref nebo context
// Varianta A: Ref-based (jednodušší)
export const ShiftBar = forwardRef<{ reload: () => void }, Props>(...)

// Varianta B: Event-based (čistší)
// Po uložení výsledku outcome-panel.tsx volá:
//   window.dispatchEvent(new Event('call-recorded'));
// ShiftBar naslouchá tomuto eventu a reloadne data

// Varianta C: Supabase Realtime (nejrobustnější, ale overhead)
// Realtime subscription na INSERT do calls → reload
```

**Doporučení**: Varianta B (custom event). Jednoduchá, funguje bez změn v architektuře.

```typescript
// V shift-bar.tsx — přidat listener
useEffect(() => {
  const handler = () => reload();
  window.addEventListener('call-recorded', handler);
  return () => window.removeEventListener('call-recorded', handler);
}, []);

// V outcome-panel.tsx — po úspěšném uložení
window.dispatchEvent(new Event('call-recorded'));
```

Navíc: progress bar pod cílem → červená barva (`urgent`), nad cílem → accent.

### Krok 2: Upozornění na rychlé zápisy (< 20s)

**Specifikace**: "Upozornění pro admina: zápisy výsledků rychleji než 20 s po sobě."

**Řešení A: DB trigger** (doporučeno)

**Soubor**: `supabase/migrations/012_rapid_call_alert.sql` (nebo sloučit s email migrací)

```sql
-- Trigger na calls INSERT: pokud předchozí hovor od stejného operátora
-- ve stejném projektu byl před < 20 sekundami, vloží alert
CREATE OR REPLACE FUNCTION check_rapid_call()
RETURNS TRIGGER AS $$
DECLARE
  v_prev_at timestamptz;
  v_gap_s int;
BEGIN
  SELECT created_at INTO v_prev_at
  FROM calls
  WHERE operator_id = NEW.operator_id
    AND project_id = NEW.project_id
    AND id != NEW.id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_prev_at IS NOT NULL THEN
    v_gap_s := EXTRACT(EPOCH FROM (NEW.created_at - v_prev_at))::int;
    IF v_gap_s < 20 THEN
      INSERT INTO audit_log (project_id, user_id, action, details)
      VALUES (NEW.project_id, NEW.operator_id, 'rapid_call_alert',
        jsonb_build_object(
          'gap_seconds', v_gap_s,
          'call_id', NEW.id,
          'operator_id', NEW.operator_id
        ));
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_rapid_call_check
  AFTER INSERT ON calls
  FOR EACH ROW
  EXECUTE FUNCTION check_rapid_call();
```

**UI pro admina**: V denním reportu (K12) zobrazit počet rapid_call_alert za den. Popřípadě badge v admin navigaci.

### Krok 3: Měsíční export odpracovaných hodin

#### 3a. RPC pro data
**Soubor**: nová migrace nebo rozšíření 007

```sql
CREATE OR REPLACE FUNCTION get_monthly_hours(
  p_project_id uuid,
  p_year int,
  p_month int
) RETURNS TABLE (
  operator_id uuid,
  operator_name text,
  total_shifts int,
  total_hours numeric(6,2),
  total_pause_hours numeric(6,2),
  net_hours numeric(6,2),
  total_calls int,
  total_reached int,
  calls_per_hour numeric(6,1),
  meetings int
) AS $$
BEGIN
  RETURN QUERY
  WITH shift_data AS (
    SELECT
      s.operator_id,
      p.full_name AS operator_name,
      COUNT(*)::int AS total_shifts,
      -- Celkový čas směn v hodinách
      SUM(EXTRACT(EPOCH FROM (
        COALESCE(s.ended_at, now()) - s.started_at
      )) / 3600)::numeric(6,2) AS total_hours,
      -- Celkové pauzy v hodinách
      SUM(s.total_pause_s / 3600.0)::numeric(6,2) AS total_pause_hours
    FROM shifts s
    JOIN profiles p ON p.id = s.operator_id
    WHERE s.project_id = p_project_id
      AND s.status = 'ended'
      AND EXTRACT(YEAR FROM s.started_at) = p_year
      AND EXTRACT(MONTH FROM s.started_at) = p_month
    GROUP BY s.operator_id, p.full_name
  ),
  call_data AS (
    SELECT
      c.operator_id,
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE o.key NOT IN ('no_answer', 'busy'))::int AS total_reached,
      COUNT(*) FILTER (WHERE o.key = 'meeting')::int AS meetings
    FROM calls c
    JOIN outcomes o ON o.id = c.outcome_id
    WHERE c.project_id = p_project_id
      AND EXTRACT(YEAR FROM c.created_at) = p_year
      AND EXTRACT(MONTH FROM c.created_at) = p_month
    GROUP BY c.operator_id
  )
  SELECT
    sd.operator_id,
    sd.operator_name,
    sd.total_shifts,
    sd.total_hours,
    sd.total_pause_hours,
    (sd.total_hours - sd.total_pause_hours)::numeric(6,2) AS net_hours,
    COALESCE(cd.total_calls, 0),
    COALESCE(cd.total_reached, 0),
    CASE WHEN (sd.total_hours - sd.total_pause_hours) > 0
      THEN (COALESCE(cd.total_calls, 0)::numeric / (sd.total_hours - sd.total_pause_hours))::numeric(6,1)
      ELSE 0
    END,
    COALESCE(cd.meetings, 0)
  FROM shift_data sd
  LEFT JOIN call_data cd ON cd.operator_id = sd.operator_id
  ORDER BY sd.operator_name;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

#### 3b. Server action
**Soubor**: `src/app/actions/shifts.ts` — přidat:

```typescript
export async function getMonthlyHours(projectId: string, year: number, month: number) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_monthly_hours', {
    p_project_id: projectId,
    p_year: year,
    p_month: month,
  });
  if (error) throw new Error(error.message);
  return data;
}
```

#### 3c. Admin stránka s exportem
**Soubor**: `src/app/(app)/[projectSlug]/vykon/page.tsx` nebo `src/app/(admin)/admin/[projectSlug]/hours/page.tsx`

Navigace má "Výkon" (bottom-nav: `vykon`), takže umístit sem.

Obsah:
- Výběr měsíce (select/picker, výchozí = aktuální)
- Tabulka operátorů: jméno, směny, hrubé hodiny, pauzy, čisté hodiny, hovory, hovory/h, konzultace
- Součtový řádek
- Tlačítko "Exportovat CSV" → client-side generování CSV z tabulky

```typescript
// CSV export (client-side)
function exportCSV(data: MonthlyRow[], month: string) {
  const header = 'Operátor;Směny;Hrubé h;Pauzy h;Čisté h;Hovory;Hovory/h;Konzultace\n';
  const rows = data.map(r =>
    `${r.operator_name};${r.total_shifts};${r.total_hours};${r.total_pause_hours};${r.net_hours};${r.total_calls};${r.calls_per_hour};${r.meetings}`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  // trigger download
}
```

## Soubory k vytvoření/upravit

| Soubor | Akce |
|--------|------|
| `src/app/(app)/[projectSlug]/_components/shift-bar.tsx` | UPRAVIT — event listener pro live reload |
| `src/app/(app)/[projectSlug]/_components/outcome-panel.tsx` | UPRAVIT — dispatch event po uložení |
| `supabase/migrations/012_rapid_calls_monthly_hours.sql` | NOVÝ — trigger + RPC |
| `src/app/actions/shifts.ts` | UPRAVIT — přidat getMonthlyHours |
| `src/app/(app)/[projectSlug]/vykon/page.tsx` | NOVÝ — stránka výkonu |
| `src/app/(app)/[projectSlug]/vykon/hours-table.tsx` | NOVÝ — tabulka + export |

## Kritérium "Hotovo, když"
- [ ] Počítadlo se aktualizuje ihned po zápisu hovoru
- [ ] Progress bar změní barvu pod/nad cílem
- [ ] Rychlý zápis (< 20s) se zapíše do audit_log
- [ ] Měsíční export CSV obsahuje správné hodiny a hovory
- [ ] Z exportu lze spočítat výplatu za testovací směny
