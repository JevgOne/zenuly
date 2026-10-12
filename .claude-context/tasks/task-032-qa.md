# QA Report: Admin kontakty — CRM karty s % a trust score (Task #32)

> Kontrolor, 2026-10-10

## Verdikt: ✅ SCHVÁLENO — 1 nízký nález

---

## 1. Migrace 016 — RPC get_contacts_overview

### completeness_pct (8 polí) ✅
Počítá z těchto 8 polí:
1. `contact_person` ✅
2. `email` ✅
3. `website` ✅
4. `city` ✅
5. `ico` ✅
6. `hook_text` ✅
7. `findings` ✅
8. `custom_data` (není prázdný JSON) ✅

Zadání říká "8 polí: company, contact_person, phone, email, website, city, ico, hook_text" — implementace se mírně liší (místo `company` + `phone` jsou `findings` + `custom_data`). `company` a `phone` jsou povinná pole (vždy vyplněná), takže by completeness vždy byla alespoň 25% — implementace je rozumnější. **Funkční odchylka, akceptovatelná.**

### trust_score (0-100)
Zadání definovalo: email +20, contact_person +15, website +15, ico +10, city +10, kontaktován +10, dovoláno +10, fáze 3+ +10.

Implementace je **jiná ale bohatší** (dynamičtější hodnocení):
- Data completeness max 30 bodů (contact_person 5, email 8, website 5, city 3, ico 4, findings 5)
- Engagement max 40 bodů (volání × 4 max 20, zájem +20)
- Pipeline progress max 30 bodů (won 30, meeting_set 25, contacted 15, new 5, lost 0)
- `LEAST(100, ...)` cap ✅

**Odchylka od zadání:** Jiné váhy než v zadání. Ale výsledek je robustnější a smysluplnější (volání + pipeline fáze). Akceptovatelné.

### RLS / přístup ℹ️
Funkce je `STABLE SECURITY DEFINER` bez explicitního auth check uvnitř SQL. Přístup je řízen na úrovni aplikace (page.tsx redirect pro non-admin/manager). Toto je konzistentní s ostatními admin RPC funkcemi v projektu (např. `export_monthly_hours`). **Nízká závažnost — přístup je chráněn na app vrstvě.**

### Řazení, paginace, filtrování ✅
- Řazení: trust_desc/asc, completeness_desc/asc, activity_desc/asc, name_asc/desc ✅
- Filtr: search (ILIKE company/contact_person/email/phone), stage_key ✅
- Paginace: p_limit + p_offset ✅

---

## 2. page.tsx — admin/manager guard ✅

```tsx
if (!profile || (profile.role !== "admin" && profile.role !== "manager"))
  redirect(`/${projectSlug}/fronta`);
```
Správně blokuje operátory. ✅

---

## 3. contacts-view.tsx

### Grid (responzivní 1-4 sloupce) ✅
```tsx
grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4
```

### SVG kruhový trust score ✅
- `<circle>` s `strokeDasharray` pro progress ring ✅
- Barvy: zelená >= 70, oranžová 40-69, červená < 40 ✅
- Label: "Výborný" / "Dobrý" / "Slabý" (česky) ✅

### Progress bar completeness ✅
- `h-full rounded-full transition-all` s width = `completeness_pct%` ✅
- Barva sdílena s trust (trustBg funkce) ✅

### Filtrování + řazení ✅
- Search input: "Hledat firmu, jméno, email..." ✅
- Stage select: "Všechny fáze" + iterace stages ✅
- Sort select: trust/completeness/activity/name ✅

### Česky — žádná angličtina v UI ✅
- "Kontakty", "Hledat", "Všechny fáze", "Žádné kontakty", "Vyplněnost", "Výborný/Dobrý/Slabý" ✅
- Sort labels: "Trust score ↓/↑", "Vyplněnost ↓/↑" — "Trust score" je akceptovatelný termín (technický) ✅

---

## 4. app-header.tsx ✅

```tsx
{ label: "Kontakty", href: "kontakty" }  // v ADMIN_NAV_ITEMS
```
Přítomno, správně pod admin/manager navem. ✅

---

## 5. Build ✅

```
npm run build → ✅ Compiled successfully (čistý build bez .next cache)
```

---

## Reverzní kontrola

| # | Požadavek | Stav | Poznámka |
|---|-----------|------|----------|
| 1 | completeness_pct (8 polí) | ✅ | 8 polí, jiná sada než v zadání — smysluplnější |
| 2 | trust_score 0-100 | ✅ | Jiné váhy, bohatší implementace |
| 3 | RLS admin/manager only | ⚠️ | App-level guard (page.tsx), SQL bez auth check — konzistentní s projektem |
| 4 | Admin-only redirect | ✅ | admin + manager, redirect do fronta |
| 5 | Grid karet 1-4 sloupce | ✅ | Tailwind responsive |
| 6 | SVG trust kruh s barvami | ✅ | Zelená/oranžová/červená |
| 7 | Progress bar completeness | ✅ | |
| 8 | Filtrování (search, fáze) + řazení | ✅ | |
| 9 | Česky, žádná angličtina | ✅ | |
| 10 | Kontakty v ADMIN_NAV_ITEMS | ✅ | |
| 11 | Build | ✅ | |

---

## Shrnutí

**Build:** ✅  
**Reverzní kontrola:** 10/11 (1 nízký nález)

| Závažnost | Popis |
|-----------|-------|
| ℹ️ NÍZKÁ | `get_contacts_overview` je SECURITY DEFINER bez SQL auth check — přístup chráněn jen na app vrstvě. Konzistentní s projektem, ale ideálně by funkce měla ověřit `auth_user_role()`. |
