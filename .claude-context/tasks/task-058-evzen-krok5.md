# Evžen Review: Krok 5 (Import leadů) proti zadání

**Datum:** 2026-10-09
**Status:** SCHVÁLENO S VÝHRADAMI (1 blocker, 4 upozornění)

---

## METODIKA

Kontrolováno: `src/app/(app)/[projectSlug]/import/` (page, import-wizard, file-upload, column-mapper, import-result), `src/app/actions/import-leads.ts`, `src/lib/utils/phone.ts`, `src/lib/utils/parse-file.ts`, `src/lib/utils/auto-map-columns.ts`, `src/components/app-header.tsx` (navigace). Porovnáno se zadáním:

**Zadání Krok 5 z `postup-prompty.md`:**
> Udělej import leadů z CSV a Excelu pro admina: mapování sloupců, normalizace telefonu do E.164, kontrola duplicit v projektu, odmítnutí čísel ze seznamu Nevolat, povinný zdroj čísla. Na konci souhrn: kolik importováno, kolik duplicit a kolik zablokováno.

**Zadání z `CLAUDE.md`:**
> Duplicity kontroluj v rámci projektu podle telefonu a e-mailu.

---

## BLOCKER NALEZKY

### B1: Duplicity se kontrolují POUZE podle telefonu, ne podle e-mailu
**Zadání:** CLAUDE.md říká: "Duplicity kontroluj v rámci projektu podle telefonu **a e-mailu**."
**Stav:** `import-leads.ts` řádky 99-104 načítá jen `existingPhones` (telefon). E-mail se nekontroluje:
```
const { data: existingLeads } = await supabase
  .from("leads")
  .select("phone")  // ← chybí email
  .eq("project_id", projectId)
  .eq("is_active", true);
const existingPhones = new Set((existingLeads ?? []).map((r) => r.phone));
```
Duplicitní lead se stejným e-mailem ale jiným telefonem projde importem.
**Doporučení:** Přidat e-mail do SELECT, vytvořit `existingEmails` Set, a kontrolovat obojí. Lead je duplicita pokud má shodný telefon NEBO shodný e-mail (v rámci projektu).

---

## KONTROLA PODLE ZADÁNÍ

### 1. Import z CSV a Excelu
- **OK.** `file-upload.tsx` přijímá `.csv, .xlsx, .xls`.
- `parse-file.ts` používá knihovnu `xlsx` s `codepage: 1250` (čeština).
- Max velikost 5 MB -- rozumné.
- Prázdné řádky se přeskakují (řádek 33).

### 2. Mapování sloupců
- **OK.** `column-mapper.tsx` zobrazuje povinná a volitelná pole.
- `auto-map-columns.ts` automaticky namapuje české i anglické hlavičky (firma, telefon, e-mail, město, IČO, web, priorita...).
- Aliasy jsou bohaté a pokrývají běžné varianty.
- Povinná pole: Firma, Telefon, Zdroj čísla -- **sedí** se specifikací.
- Preview prvních 3 hodnot u každého mapování -- dobrý UX.

### 3. Normalizace telefonu do E.164
- **OK.** `phone.ts`:
  - Strip spaces, dashes, parentheses.
  - Už E.164 (`+XXXX...`) → ponechá.
  - `00420...` → `+420...`.
  - 9-digit Czech → `+420` prefix.
  - `0602...` → `+420602...`.
  - `09XXXXXXXX` → Slovak `+421`.
  - Nerozpoznaný formát → `null` (odmítnut).
- Validace `isValidE164`: `/^\+\d{10,15}$/` -- **OK**.

### 4. Kontrola duplicit v projektu
- **ČÁSTEČNĚ OK.** Kontroluje duplicity podle:
  - Telefonu vůči existujícím leadům v projektu -- **OK** (řádky 100-104).
  - Telefonu v rámci aktuálního importu -- **OK** (řádky 138-143, `seenPhones`).
  - **CHYBÍ** kontrola podle e-mailu (viz B1).

### 5. Odmítnutí čísel ze seznamu Nevolat
- **OK.** `import-leads.ts` řádky 92-97:
  - Načte všechny DNC telefony pro projekt.
  - Kontroluje každý řádek proti DNC.
  - Odmítnuté se počítají do `result.dnc`.

### 6. Povinný zdroj čísla
- **OK.** Dvě varianty:
  - Sloupec "Zdroj čísla" namapovaný z CSV → hodnota per řádek.
  - Globální fallback select (pokud sloupec není namapovaný) -- default "Databáze".
- Validace: neznámý zdroj → fallback "databaze" (řádky 146-148).
- Enum hodnoty: `web_firmy`, `profil_firmy`, `databaze`, `poptavka`, `lead_finder` -- **sedí** se specifikací + rozšíření.

### 7. Souhrn importu
- **OK.** `import-result.tsx` zobrazuje 4 dlaždice:
  - Importováno (zelená/accent)
  - Duplicity (šedá)
  - Nevolat (červená/urgent)
  - Neplatný telefon (červená/urgent)
- Chybové řádky zobrazeny v seznamu.
- **Sedí** se zadáním: "kolik importováno, kolik duplicit a kolik zablokováno".

### 8. Přístup jen pro admina
- **OK.** `import/page.tsx` řádky 37-49:
  - Admin má přístup vždy.
  - Manager projektu má přístup.
  - Operátor → `notFound()`.
- Zadání říká "pro admina" -- implementace rozšiřuje na managera, což je konzistentní s project-level permissions.

### 9. Navigace k importu
- **OK.** `app-header.tsx` řádek 21: "Import" je v `ADMIN_NAV_ITEMS` (viditelný pro admin a manager, ne pro operátora).
- Na mobilu (bottom-nav) Import **NENÍ** -- toto je korektní, na mobilu admin nevybírá import (desktop only funkce).

---

## UPOZORNĚNÍ (ne-blockery)

| # | Popis | Soubor | Řádek |
|---|-------|--------|-------|
| W1 | Audit log neloguje detaily per řádek (jen souhrn) -- OK pro MVP | `import-leads.ts` | 193 |
| W2 | Batch INSERT 500 rows -- při chybě se ztratí info o konkrétním problémovém řádku | `import-leads.ts` | 180 |
| W3 | E-mail v importu se normalizuje na lowercase ale telefon duplicita v rámci importu nekontroluje e-mail duplicity (souvisí s B1) | `import-leads.ts` | 160 |
| W4 | `next_action_at` se nastaví na `new Date().toISOString()` (UTC now) -- toto znamená že lead okamžitě spadne do fronty jako "Propadlý" pokud je mimo pracovní dobu | `import-leads.ts` | 168 |

---

## VÝSLEDEK

Import leadů je **solidně implementovaný**. Flow (nahrát soubor → automapování → preview → import → souhrn) je přehledný. Normalizace telefonů pokrývá české a slovenské varianty. DNC check funguje. Povinný zdroj čísla je řešen elegantně (per sloupec nebo globálně).

Jediný blocker je **B1: chybí kontrola duplicit podle e-mailu** -- CLAUDE.md výslovně říká "podle telefonu a e-mailu". Oprava je jednoduchá (přidat email do SELECT, vytvořit Set, přidat podmínku).

**Verdikt: PODMÍNĚNĚ SCHVÁLENO -- opravit B1 (e-mail duplicity).**
