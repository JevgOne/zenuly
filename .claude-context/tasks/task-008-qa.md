# QA Report — Krok 2: Databáze a nastavení Weblyxu

**Datum:** 2026-10-08  
**Kontrolor:** kontrolor  
**Soubory:** supabase/migrations/001–003, supabase/seed.sql, supabase/tests/001_rls_test.sql

---

## 1. SIMPLIFY — zbytečná složitost, duplicity, konzistence

### Nalezeno: Redundantní admin SELECT policies (5 tabulek)

Pro tabulky `stages`, `custom_fields`, `outcomes`, `lost_reasons`, `email_templates` existuje vždy dvojice:
- `_select_admin` — `FOR SELECT USING (auth_user_role() = 'admin')`
- `_manage_admin` — `FOR ALL USING (auth_user_role() = 'admin')`

Politika `FOR ALL` zahrnuje SELECT, INSERT, UPDATE, DELETE — tedy `_select_admin` je plně redundantní. 5 zbytečných políček.

**Doporučení (nízká priorita):** Odstranit `stages_select_admin`, `cf_select_admin`, `outcomes_select_admin`, `lr_select_admin`, `et_select_admin`. Funkčnost se nezmění.

### OK: required_from_stage jako text (ne FK)

Záměrné — flexibilita per-projekt konfigurace. Hodnoty v seed odpovídají stage keys.

### OK: is_active přes ALTER TABLE

`leads.is_active` je přidán přes ALTER TABLE (ne inline) — kvůli partial unique indexu. Správný přístup, bez duplikace.

### OK: Pořadí tabulek v migraci 002

`lost_reasons` je definován před `leads` — FK `leads.lost_reason_id → lost_reasons.id` funguje správně.

---

## 2. DEBUG — lint, build, SQL syntax

| Příkaz | Výsledek |
|--------|----------|
| `npm run lint` | ✅ Prošel bez chyb |
| `npm run build` | ✅ Prošel bez chyb |

**SQL syntax review:**
- Enums: 8 typů, konzistentní pojmenování (snake_case)
- FK vazby: všechny správně odkazují na existující tabulky
- Triggery: `update_updated_at()` na 4 tabulkách (profiles, projects, leads, email_templates) — OK
- Trigger `handle_new_user()` vytváří profile automaticky — OK
- `gen_random_uuid()` přes pgcrypto extension — OK
- Indexy: 13 indexů, pokrývají klíčové dotazy (leads queue, calls history, active shifts)

---

## 3. REVERZNÍ KONTROLA

| Požadavek | Stav | Detail |
|-----------|------|--------|
| 14 tabulek | ✅ | profiles, projects, project_members, stages, custom_fields, leads, calls, outcomes, lost_reasons, tasks, do_not_call, shifts, email_templates, audit_log — všechny přítomny |
| RLS na všech tabulkách | ✅ | 14/14 tabulek má `ENABLE ROW LEVEL SECURITY` v 003_rls_policies.sql |
| Operátor vidí jen leady svých projektů (vlastní + pool) | ✅ | `leads_select_operator`: `is_project_member(project_id) AND (owner_id = auth.uid() OR owner_id IS NULL)` |
| Operátor NEVIDÍ telefony cizích leadů | ✅ | Leady s `owner_id != auth.uid() AND owner_id IS NOT NULL` nejsou dostupné přes RLS — celý řádek včetně phone je skryt |
| Admin vidí vše | ✅ | `auth_user_role() = 'admin'` policy na každé tabulce |
| Seed: 8 fází pipeline | ✅ | new, contacted, meeting_booked, meeting_done, offer_sent, negotiation, won, lost |
| Seed: 6 vlastních polí s povinností od fáze | ✅ | sector (contacted), project_type (meeting_booked), budget (meeting_done), decision_maker (meeting_booked), launch_date (meeting_done), offer_value (offer_sent) |
| Seed: 8 výsledků hovoru s pravidly (JSONB) | ✅ | meeting, offer, deck, later, no_answer, busy, not_interested, wrong_number — každý má `rules` JSONB |
| Seed: 9 důvodů ztráty | ✅ | price, has_website, no_time, has_agency, diy, distrust_ai, no_value, unreachable (is_system=true), other |
| Seed: 2 šablony e-mailů | ✅ | offer, deck — obě s variables JSONB |
| Konfigurace per projekt (ne natvrdo v kódu) | ✅ | stages, outcomes, custom_fields, lost_reasons, email_templates vše vázáno na project_id; working_hours, max_attempts, sla_first_call v projects tabulce |
| SQL testy RLS | ✅ | 8 testů v 001_rls_test.sql: operator vidí 2 leady (own+pool), nevidí cizí projekt, pool leady fungují, admin vidí 3 leady, operator nemůže insert project, nemůže delete DNC, vidí správné counts stages/outcomes, operator2 izolace |

---

## Shrnutí

**Celkový stav: PASS**

Všechny reverzní kontrolní body splněny. Jeden SIMPLIFY nález (nízká priorita):

**Redundantní policies (opcionální cleanup):** 5 páru `_select_admin` + `_manage_admin FOR ALL` — SELECT je zbytečný duplicate. Nevyžaduje okamžitou opravu, funkčnost není narušena.

SQL testy pokrývají klíčové RLS scénáře (operator izolace, pool leads, admin přístup, DNC ochrana).
