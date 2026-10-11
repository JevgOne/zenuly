# QA Report: Krok 5 — Import leadů

**Datum:** 2026-10-09  
**Kontrolor:** kontrolor (agent)  
**Build:** ✅ PASS — `/[projectSlug]/import` route přítomná  
**TS check:** ✅ PASS  
**ESLint:** ✅ PASS

---

## 1. phone.ts — Normalizace do E.164

**Soubor:** `src/lib/utils/phone.ts`

- ✅ CZ 9-místné číslo (602123456) → +420602123456
- ✅ CZ s nulou (0602123456, 10 číslic) → +420602123456
- ✅ SK číslo začínající 09 (0912345678) → +421912345678
- ✅ Mezinárodní 00420... → +420...
- ✅ Již E.164 formát projde beze změny
- ✅ strip() odstraňuje mezery, pomlčky, závorky, tečky
- ✅ Vrací null pro neplatná čísla
- ✅ isValidE164: regex /^\+\d{10,15}$/ — správný rozsah
- ⚠️ DROBNOST: SK čísla začínající 421 přímo (ne 09...) nejsou normalizována — chybí větev `if (/^\d{9}$/.test(phone)) return SK_PREFIX + phone;`. Ale SK čísla s +421 projdou přes "Already E.164" větev, takže problém je pouze u 9-ciferných SK čísel bez prefixu. Nízká závažnost — primární trh je CZ.

---

## 2. parse-file.ts — Parsování CSV/Excel

**Soubor:** `src/lib/utils/parse-file.ts`

- ✅ Používá xlsx knihovnu — podporuje CSV, XLSX, XLS
- ✅ `codepage: 1250` — správné řešení pro české CSV soubory (Windows-1250)
- ✅ Přeskakuje prázdné řádky (row.every(c => !c))
- ✅ Validace: alespoň 1 datový řádek + hlavička
- ✅ Vrací strukturovaný `{ headers, rows }` — čistý output typ
- ✅ Vše česky: chybové hlášky "Soubor je prázdný.", "Soubor musí mít hlavičku..."

---

## 3. auto-map-columns.ts — Auto-mapování sloupců

**Soubor:** `src/lib/utils/auto-map-columns.ts`

- ✅ FIELD_ALIASES pokrývají všechna pole leadů (13 polí)
- ✅ Aliasy zahrnují: CZ i EN varianty, s/bez háčků (např. "ičo"/"ico", "město"/"mesto")
- ✅ `used` Set zabraňuje mapování jednoho sloupce na více polí
- ✅ Case-insensitive matching přes `toLowerCase().trim()`
- ✅ REQUIRED_FIELDS exportuje `["company", "phone", "phone_source"]` — konzistentní s UI validací
- ✅ LEAD_FIELDS export — používán v ColumnMapper pro iteraci
- ⚠️ DROBNOST: Auto-mapping je exact match (ne partial/fuzzy). Sloupec "Tel. číslo" nebude namapován — ale to je záměrné, předchází špatným mapováním. Akceptovatelné.

---

## 4. import-leads.ts — Server action

**Soubor:** `src/app/actions/import-leads.ts`

### Autorizace
- ✅ `requireImportAccess`: ověřuje `auth.getUser()` — nikdy nepoužívá session z klienta
- ✅ Dvě úrovně přístupu: globální `admin` nebo `manager` konkrétního projektu
- ✅ Throws "Unauthorized" / "Forbidden" — správné HTTP sémantiky

### Validace dat
- ✅ Chybějící company name → error do `result.errors` (s číslem řádku)
- ✅ Neplatný telefon → `result.invalidPhone++`
- ✅ DNC check → `result.dnc++`
- ✅ Duplicita v existujících leadech → `result.duplicates++`
- ✅ Duplicita v rámci importu (seenPhones) → `result.duplicates++`

### Bezpečnost
- ✅ DNC se načítá per `project_id` — izolace projektů
- ✅ Existující leady se filtrují přes `project_id + is_active=true` — správná scope
- ✅ phone_source fallback na "databaze" pokud hodnota není v VALID_PHONE_SOURCES
- ✅ priority clampuje na 1–3: `Math.min(3, Math.max(1, Number(...) || 2))`

### Batch insert
- ✅ BATCH_SIZE = 500 — chrání před Supabase request size limity
- ✅ Chyba jednoho batche neukončí celý import — chyba se loguje do `result.errors`
- ✅ `imported` počítá pouze skutečně vložené řádky (ne plánované)

### Audit log
- ✅ Zaznamenává: total, imported, duplicates, invalid_phone, dnc
- ✅ user_id přítomný — správná atribuce

### Drobné nálezy
- ⚠️ `next_action_type: "callback"` je hardcoded — předpokládá existenci tohoto enum hodnoty. Pokud se enum změní, silently vloží špatnou hodnotu. Nízká závažnost.
- ⚠️ `hook_source: row.hook_source || (row.findings ? "import" : null)` — pokud findings existují ale hook_source ne, nastaví "import". Logické, ale stojí za komentář v kódu.

---

## 5. Import Wizard UI — 4-krokový průvodce

### import-wizard.tsx
- ✅ 4 stavy: upload → mapping → processing → result
- ✅ StepBadge vizuálně zvýrazňuje aktuální a dokončené kroky
- ✅ Chyby zobrazeny nad krokem v `bg-urgent-soft`
- ✅ Processing stav: spinner + "Importuji leady..." — UX feedback
- ✅ Při chybě importu se vrátí na mapping krok (ne upload) — správné
- ✅ handleReset resetuje vše do čistého stavu
- ⚠️ DROBNOST: `{step === "upload" && parsed && fileName && ...}` blok na řádku 134–139 se nikdy nezobrazí — jakmile je soubor naparsován, step přepne na "mapping" okamžitě. Dead code, ale neškodný.

### file-upload.tsx
- ✅ Drag & drop + click to browse
- ✅ Limit 5 MB — validace velikosti
- ✅ Akceptuje .csv, .xlsx, .xls — validace přípony
- ✅ Keyboard accessible: Enter/Space otevírají dialog
- ✅ `role="button" tabIndex={0}` — přístupnost
- ✅ aria-label na hidden inputu

### column-mapper.tsx
- ✅ Povinná a volitelná pole oddělena
- ✅ Použité sloupce jsou `disabled` v ostatních select boxech — zabraňuje dvojitému mapování
- ✅ Globální phone_source select pokud sloupec není namapovaný — správné UX fallback
- ✅ Preview 3 hodnot z prvních řádků — uživatel vidí reálná data
- ✅ `canImport` blokuje tlačítko dokud nejsou povinná pole vyplněna
- ✅ Chybějící povinná pole zobrazena pod tlačítkem
- ✅ Importovat tlačítko zobrazuje počet řádků: "Importovat X leadů"
- ✅ PHONE_SOURCE_OPTIONS v UI = VALID_PHONE_SOURCES v action — konzistentní

### import-result.tsx
- ✅ 4 dlaždice: Importováno (accent), Duplicity (muted), Nevolat (urgent), Neplatný telefon (urgent)
- ✅ Chyby zobrazeny jako seznam pokud existují
- ✅ Tlačítko "Importovat další" + link "Zpět na frontu"
- ✅ `href` používá `/${projectSlug}/fronta` — správný slug odkaz (ne hardcoded)

---

## 6. Navigace — app-header.tsx

**Soubor:** `src/components/app-header.tsx`

- ✅ Import link je v `ADMIN_NAV_ITEMS` — zobrazí se pro `role === "admin" || role === "manager"`
- ✅ Operátoři (bez role) Import nevidí — správná RBAC na úrovni nav
- ✅ Import je umístěn logicky: mezi Pipeline a Výkon
- ✅ Page-level autorizace v `import/page.tsx` je redundantní ochrana (double-gate) — správné

---

## 7. import/page.tsx

- ✅ Auth guard: redirect /login pokud není user
- ✅ RBAC: notFound() pro operátory bez manager role — neprozrazuje existenci stránky
- ✅ Projekt načítán přes slug — správná URL-based identifikace
- ⚠️ Stejný problém jako fronta/page.tsx: `export const instant = false` je neplatný Next.js segment config (stejné jako v QA task #2). Funguje, ale ignoruje se.

---

## Souhrn nálezů

| # | Závažnost | Soubor | Popis |
|---|-----------|--------|-------|
| 1 | ℹ️ Info | phone.ts | SK 9-místná čísla bez prefixu nejsou normalizována (primární trh je CZ) |
| 2 | ℹ️ Info | auto-map-columns.ts | Exact match only — fuzzy matching není implementován (záměrné) |
| 3 | ℹ️ Info | import-leads.ts | `next_action_type: "callback"` hardcoded — fragile pokud se enum změní |
| 4 | ℹ️ Info | import-wizard.tsx | Dead code blok na ř. 134–139 (nikdy se nezobrazí) |
| 5 | ⚠️ Nízká | import/page.tsx | `export const instant = false` — neplatný Next.js segment config (stejný problém jako v fronta/page.tsx) |

**Žádný blocker. Celá implementace je funkčně správná, bezpečná (dvojitá auth gate), UX kompletní.**

---

## Výsledek QA

✅ **APPROVED** — Import leadů (Krok 5) je production-ready.  
Lint čistý, build OK, TS strict OK. Bezpečnost: RBAC na nav + page + server action úrovni. 5 drobných informativních poznámek bez nutnosti opravy před nasazením.
