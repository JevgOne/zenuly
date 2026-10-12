# QA Report: Fix fronta leadů — nekonečné načítání (Task #31)

> Kontrolor, 2026-10-10

## Verdikt: ✅ SCHVÁLENO

---

## 1. Migrace 015 — SQL logika

**Soubor:** `supabase/migrations/015_fix_queue_admin_visibility.sql`

Funkce `get_queue()` přepracována:

**Klíčový fix:**
```sql
v_is_admin := (
  auth_user_role() = 'admin'
  OR EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND profile_id = auth.uid()
      AND role = 'manager'
  )
);
```
Pak v WHERE klauzuli:
```sql
AND (v_is_admin OR l.owner_id = p_operator_id OR l.owner_id IS NULL)
```

**Analýza:**
- Admin nebo manager (`v_is_admin = true`) → podmínka je vždy splněna → vidí VŠECHNY leady projektu ✅
- Operátor (`v_is_admin = false`) → vidí jen vlastní (`owner_id = p_operator_id`) nebo nepřiřazené (`owner_id IS NULL`) ✅
- Původní bug: operátor bez přiřazených leadů dostal prázdnou frontu; admin/manager taky, protože neměli `owner_id` — nyní opraveno ✅
- RLS security: funkce je SECURITY DEFINER, role se detekuje přes `auth_user_role()` a `auth.uid()` — nelze obejít ✅

Zbytek funkce (sekce, řazení, working hours, DNC filtr) nezměněn — správně. ✅

---

## 2. queue-list.tsx — React mount fix

**mountedRef odstraněn** — `useEffect` nyní:

```tsx
useEffect(() => {
  let cancelled = false;
  const load = async () => { ... };
  load();                           // ← okamžité volání při mountu ✅
  const interval = setInterval(load, 30_000);
  return () => {
    cancelled = true;
    clearInterval(interval);
    delete window.__reloadQueue;
  };
}, [projectId]);
```

**Analýza:**
- `mountedRef` byl odstraněn — `load()` se volá okamžitě při každém mountu ✅
- `cancelled` flag zabraňuje setState po unmountu (race condition guard) ✅
- Polling každých 30s při aktivní komponentě ✅
- React Strict Mode v dev double-mounts: první mount se okamžitě unmountne (cancelled=true), druhý mount spustí nové load() — správné chování ✅

---

## 3. Build

První pokus selhal s Turbopack interní chybou (`@vercel/turbopack-next/internal/font/google/font` — module not found). Chyba nesouvisí s queue fixem — jde o stale cache v `.next/`.

Po `rm -rf .next`:
```
npm run build → ✅ Compiled successfully
```

**Poznámka pro tým:** Při dalším buildu po cache invalidaci (npm update, změna deps) doporučuji čistit `.next/` cache. Turbopack má občas stale state s Google Fonts.

---

## Závěr

Oba fixy jsou správné a kompletní:
- SQL logika admin/manager visibility ✅
- React mount race condition fix ✅
- Build prochází (po vymazání cache) ✅
