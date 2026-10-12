# Task #66 — Dashboard 3988 vs 64k leadů

Datum: 2026-10-12
Kontrolor: QA agent

---

## Závěr

**Problém NENÍ v dashboard kódu ani RLS.** `get_dashboard_stats` (migration 018) je správně napsaná — SECURITY DEFINER, bez LIMIT, bez pagination. Příčina musí být v datech.

---

## Co jsem zkontroloval

### 1. Dashboard data loading

`dashboard/page.tsx` → volá `getDashboardStats(projectId)` (Server Action)
`src/app/actions/dashboard.ts:42` → volá Supabase RPC `get_dashboard_stats`
RPC definovaný v `supabase/migrations/018_fix_dashboard_stats.sql`

```sql
-- total_leads query (řádek 24-26):
'total_leads', (
  SELECT COUNT(*) FROM leads WHERE project_id = p_project_id AND is_active = true
)
```

**Žádný LIMIT. Žádný .range(). Žádná pagination.** COUNT(*) vrátí všechny řádky.

### 2. LIMIT / Supabase default pagination

RPC call přes `supabase.rpc("get_dashboard_stats", {...})` — Supabase default limit 1000 se vztahuje na `.from("table").select()`, NE na RPC volání vracející jsonb. RPC vrátí celý objekt najednou. **Toto není problém.**

### 3. RLS pro admin

Funkce je `SECURITY DEFINER` (`018_fix_dashboard_stats.sql:106`) → běží s právy vlastníka funkce, bypass RLS. Admin ani nemusí být → data vidí vždy. **RLS není problém.**

### 4. `is_active` filtr

Dashboard počítá jen `is_active = true`. `record_call_outcome()` (`004_record_call_outcome.sql:161, 188`) nastavuje `is_active = false` když lead přejde do `lost` stage.

**Pokud bylo 60k leadů označeno jako lost → dashboard ukáže jen 3988 aktivních.**

### 5. Import kód — duplikátní detekce má bug

`src/app/actions/import-leads.ts:99-103`:
```typescript
const { data: existingLeads } = await supabase
  .from("leads")
  .select("phone, email")
  .eq("project_id", projectId)
  .eq("is_active", true);   // ← bez .range(), Supabase vrátí max 1000 řádků
```

S 64k aktivních leadů se kontroluje jen prvních 1000 telefonů na duplikáty. To způsobuje že import může vložit duplikáty — ale nesnižuje celkový count.

### 6. Chybějící INSERT policy pro managery

`003_rls_policies.sql` nemá `leads_insert_*` policy pro operátory/managery. Je jen `leads_manage_admin FOR ALL`. Manager který by importoval by měl všechny batche odmítnuty (tiché selhání — `result.errors.push(...)`, import pokračuje).

3988 ÷ 500 (batch size) = ~8 úspěšných batchů → selhání nastalo po ~4000 řádcích.

---

## Hypotézy (seřazeno dle pravděpodobnosti)

### HYPOTÉZA B — Leady mají is_active = false (nejpravděpodobnější)

Dashboard query filtruje `is_active = true`. Pokud většina 64k leadů přešla do lost stage (nebo byla na lost stage importována), jsou z počtu vyloučeny.

**Ověření v Supabase SQL editoru:**
```sql
SELECT is_active, COUNT(*)
FROM leads
WHERE project_id = '<projekt_id>'
GROUP BY is_active;
```

Pokud výsledek: `true → 3988, false → ~60k` → potvrzena příčina B.

### HYPOTÉZA C — Leady jsou v jiném project_id

Pokud byl projekt znovu vytvořen (nové UUID), import proběhl do starého projektu.

**Ověření:**
```sql
SELECT project_id, COUNT(*)
FROM leads
GROUP BY project_id
ORDER BY count DESC;
```

### HYPOTÉZA D — Import selhal pro většinu batchů (manager RLS)

Chybí `leads_insert_manager` policy. Manager → všechny INSERT odmítnuty silentně. 3988 = admin importoval prvních ~8 batchů (4000 řádků), pak přišla chyba.

**Ověření:** Zkontrolovat, zda import stránka zobrazila chybové hlášky při posledním importu.

---

## Problémy nalezené v kódu (i bez ohledu na root cause)

| # | Soubor | Řádek | Popis | Závažnost |
|---|--------|-------|-------|-----------|
| 1 | `import-leads.ts` | 99-103 | Duplicate check omezen na 1000 řádků (Supabase default) | STŘEDNÍ |
| 2 | `003_rls_policies.sql` | — | Chybí `leads_insert_manager` policy | STŘEDNÍ |
| 3 | `018_fix_dashboard_stats.sql` | — | Funkce nemá auth check — kdokoli autentizovaný může zavolat s libovolným project_id | NÍZKÁ |

---

## Doporučení pro implementátora

1. **Okamžitě ověřit v DB** pomocí SQL výše → zjistit příčinu
2. **Opravit duplicate check** — přidat `.range(0, 100000)` nebo použít DB query
3. **Přidat `leads_insert_manager` policy** do migrations
4. **Zvážit KPI "Celkem vč. uzavřených"** na dashboardu pro přehlednost

---

## Kód `get_dashboard_stats` — SPRÁVNÝ ✅

- `SECURITY DEFINER` ✅
- `COUNT(*)` bez LIMIT ✅
- `is_active = true` filtr je záměrný (aktivní leads) ✅
- Žádná pagination ✅
