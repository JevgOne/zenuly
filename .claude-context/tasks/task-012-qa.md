# QA Report — Krok 3: record_call_outcome

**Datum:** 2026-10-08  
**Kontrolor:** kontrolor  
**Soubory:** supabase/migrations/005_record_call_outcome.sql, supabase/tests/002_record_call_outcome_test.sql

---

## REVERZNÍ KONTROLA

| Požadavek | Stav | Detail |
|-----------|------|--------|
| 4 funkce (next_working_day_at, find_project_admin, record_call_outcome, postpone_lead) | ✅ | Všechny 4 přítomny |
| SECURITY DEFINER, jedna transakce | ✅ | record_call_outcome a postpone_lead mají SECURITY DEFINER; jedna plpgsql funkce = jedna transakce, žádný vnitřní COMMIT/SAVEPOINT |
| Pravidla z outcomes.rules JSONB (nic natvrdo) | ✅ | Veškerá logika čte z `v_rules := v_outcome.rules`; žádná natvrdo zakódovaná pravidla |
| 8 výsledků hovoru pokryto | ✅ | meeting(T1), offer(T2), deck(T3), later(T4+T5), no_answer(T6+T7), busy(T8), not_interested(T9+T10), wrong_number(T11) |
| Callback v pracovní době | ✅ | next_working_day_at() posune timestamp do pracovní doby; test 13 ověřuje pátek 17:30 → pondělí 09:00 |
| Opačná část dne u no_answer | ✅ | p_opposite_part=true; midpoint = start + (end-start)/2; test 14a (10:00→13:30) + 14b (15:00→09:00) |
| Max 4 pokusy → lost + unreachable + auto_email | ✅ | Krok 3+4: increment_attempt → check max_attempts → lost stage, unreachable reason, auto_email=true; test 7 pokrývá |
| busy nepočítá se jako pokus | ✅ | busy rules: increment_attempt=false → attempt_count nezměněn; test 8 ověřuje |
| Validace: otevřený lead MUSÍ mít next_action_at | ✅ | Krok 12: EXISTS(stage type='open') AND next_action_at IS NULL → RAISE EXCEPTION; test 12 pokrývá |
| 14 SQL testů | ✅ | Testy 1–14 přítomny, pokrývají všechny výsledky + edge cases |
| Audit log | ✅ | record_call_outcome (krok 14) i postpone_lead zapisují do audit_log s action, details JSONB |

---

## NALEZENÝ BUG — KRITICKÝ

### wrong_number nastavuje next_action_at na lost leadu (krok 8 vs. krok 7e)

**Soubor:** `supabase/migrations/005_record_call_outcome.sql` řádky 276–282

**Popis:** Outcome `wrong_number` má `set_stage=lost` a `create_task=check_contact`. Flow:

1. Krok 7e: `set_stage='lost'` → `next_action_at := NULL`
2. Krok 8: `create_task IS NOT NULL` → task se vytvoří, pak podmínka:
   ```sql
   IF v_lead.next_action_type IS NULL AND v_lead.next_action_at IS NULL THEN
     v_lead.next_action_at := v_now + 24 hours;  -- BUG: nastavuje next_action_at na lost leadu!
     v_lead.next_action_type := 'task';
   END IF;
   ```

**Důsledek:** Test 11 selže (`IF v_lead.next_action_at IS NOT NULL THEN RAISE EXCEPTION`), protože kód nastaví `next_action_at` na lost leadu.

**Oprava:** Podmínku doplnit o kontrolu, že lead NENÍ lost:
```sql
IF v_lead.next_action_type IS NULL 
   AND v_lead.next_action_at IS NULL 
   AND v_lead.is_active IS TRUE THEN
  v_lead.next_action_at := ...;
  v_lead.next_action_type := 'task';
END IF;
```

---

## SIMPLIFY

### Poznámka: chybějící migration 004

Číslovací sekvence skočila z `003` na `005`. Migration `004` neexistuje. Je-li to záměr (rezervace pro budoucí krok), doporučuji přejmenovat na `004_record_call_outcome.sql` dokud není migrace 004 vytvořena — Supabase CLI aplikuje migrace v abecedním pořadí a mezera může způsobit nejasnosti.

### find_project_admin nemá SECURITY DEFINER

`find_project_admin` je `LANGUAGE sql STABLE` bez SECURITY DEFINER — volí se z `project_members JOIN profiles`. Pokud RLS na project_members zabrání vidět admina pro operátora, funkce vrátí NULL. Měla by mít SECURITY DEFINER stejně jako `auth_user_role()` a `is_project_member()` z migrace 002.

---

## Shrnutí

**Celkový stav: FAIL — 1 kritický bug**

**Bug (musí být opraveno před pokračováním):**
- `wrong_number` flow nastavuje `next_action_at` na lost leadu → test 11 selže

**Doporučení (nízká priorita):**
- Přejmenovat 005 na 004 (nebo vysvětlit záměr)
- Přidat SECURITY DEFINER na `find_project_admin`
