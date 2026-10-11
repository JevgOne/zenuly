# Krok 5: Import leadu z CSV a Excelu — detailni plan

## Prehled
Admin muze importovat leady z CSV a Excelu. Import zahrnuje mapovani sloupcu, normalizaci telefonu do E.164, kontrolu duplicit, odmitnutí cisel ze seznamu Nevolat, povinny zdroj cisla. Na konci souhrn.

**Jen pro admina** — operator nema pristup k importu.

---

## FLOW IMPORTU (3 kroky)

### Krok 1: Nahrani souboru
- Admin nahraje CSV nebo Excel (.xlsx/.xls) soubor
- Aplikace parsuje soubor a zobrazi nahled prvnich ~5 radku
- Detekce oddelovace (CSV: strednik, carka, tab)
- Detekce kodovani (UTF-8, Windows-1250 pro ceske CSV)

### Krok 2: Mapovani sloupcu
- Zobrazit sloupce ze souboru vlevo, cilove pole vpravo
- Automaticky namapovat podle shody nazvu (firma -> company, telefon -> phone, ...)
- Admin muze manualne zmenit mapovani
- Povinne pole: **firma** (company), **telefon** (phone), **zdroj cisla** (phone_source)
- Volitelne: kontaktni osoba, email, web, mesto, ICO, zdroj leadu, priorita
- Zdroj cisla: dropdown s hodnotami `web_firmy`, `profil_firmy`, `databaze`, `poptavka`
  - Pokud neni ve zdrojovem souboru, admin vybere JEDNU hodnotu pro cely import

### Krok 3: Validace, import a souhrn
- Zpracovat vsechny radky
- Zobrazit vysledek:
  - Importovano: X
  - Duplicity (preskoceno): Y
  - Nevolat (zablokovano): Z
  - Chyby (nevalidni data): W
- Detailni seznam problematickych radku s duvodem

---

## SOUBORY A STRUKTURA

### Route: `src/app/(app)/[projectSlug]/import/page.tsx`
Server Component — jen pro admina. Overit roli, renderovat import wizard.

### Komponenty:

**`src/app/(app)/[projectSlug]/import/import-wizard.tsx`** — Client Component ('use client')
- Stavovy automat: `upload` -> `mapping` -> `processing` -> `result`
- Drzi state: soubor, parsovane radky, mapovani, vysledek

**`src/app/(app)/[projectSlug]/import/file-upload.tsx`** — Client Component
- Drag & drop zona + tlacitko "Vybrat soubor"
- Akceptuje: `.csv`, `.xlsx`, `.xls`
- Max velikost: 5 MB
- Design: `bg-surface border-2 border-dashed border-line rounded-card p-8`
- Prazdny stav: ikona uploadu + "Přetáhněte CSV nebo Excel soubor"

**`src/app/(app)/[projectSlug]/import/column-mapper.tsx`** — Client Component
- Tabulka mapovani: zdrojovy sloupec -> cilove pole
- Nahled dat (prvni 3 radky kazdeho sloupce)
- Povinne pole oznacena hvezdickou
- Zdroj cisla: bud mapovat na sloupec, nebo vybrat jednu hodnotu pro vse

**`src/app/(app)/[projectSlug]/import/import-result.tsx`** — Client Component
- Souhrn s pocty (importovano, duplicity, nevolat, chyby)
- Barvy: importovano = accent, duplicity = muted, nevolat = urgent, chyby = urgent
- Tabulka problematickych radku s duvodem
- Tlacitko "Importovat dalsi" (reset wizard)

### Server Action: `src/app/actions/import-leads.ts`

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

type ImportRow = {
  company: string
  phone: string
  phone_source: string
  contact_person?: string
  email?: string
  website?: string
  city?: string
  ico?: string
  lead_source?: string
  priority?: number
}

type ImportResult = {
  imported: number
  duplicates: number
  blocked_dnc: number
  errors: number
  details: Array<{
    row: number
    reason: 'duplicate_phone' | 'duplicate_email' | 'dnc_blocked' | 'invalid_phone' | 'missing_required' | 'invalid_data'
    company?: string
    phone?: string
    message: string
  }>
}

export async function importLeads(
  projectId: string,
  rows: ImportRow[]
): Promise<ImportResult> {
  // 1. Overit ze volajici je admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // ... overit admin roli

  const admin = createAdminClient()
  
  const result: ImportResult = {
    imported: 0, duplicates: 0, blocked_dnc: 0, errors: 0, details: []
  }

  // 2. Nacist DNC seznam pro projekt (jednou)
  const { data: dncList } = await admin
    .from('do_not_call')
    .select('phone')
    .eq('project_id', projectId)
  const dncPhones = new Set(dncList?.map(d => d.phone) ?? [])

  // 3. Nacist existujici telefony a emaily v projektu (jednou)
  const { data: existingLeads } = await admin
    .from('leads')
    .select('phone, email')
    .eq('project_id', projectId)
  const existingPhones = new Set(existingLeads?.map(l => l.phone) ?? [])
  const existingEmails = new Set(
    existingLeads?.filter(l => l.email).map(l => l.email!) ?? []
  )

  // 4. Nacist fazi 'new' pro projekt
  const { data: newStage } = await admin
    .from('stages')
    .select('id')
    .eq('project_id', projectId)
    .eq('key', 'new')
    .single()

  // 5. Zpracovat radky
  const toInsert: any[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 2  // +2 protoze radek 1 = hlavicka

    // 5a. Validace povinnych poli
    if (!row.company?.trim()) {
      result.errors++
      result.details.push({ row: rowNum, reason: 'missing_required', message: 'Chybí firma' })
      continue
    }
    if (!row.phone?.trim()) {
      result.errors++
      result.details.push({ row: rowNum, reason: 'missing_required', company: row.company, message: 'Chybí telefon' })
      continue
    }

    // 5b. Normalizace telefonu do E.164
    const normalizedPhone = normalizePhone(row.phone)
    if (!normalizedPhone) {
      result.errors++
      result.details.push({ row: rowNum, reason: 'invalid_phone', company: row.company, phone: row.phone, message: 'Neplatné telefonní číslo' })
      continue
    }

    // 5c. Kontrola DNC
    if (dncPhones.has(normalizedPhone)) {
      result.blocked_dnc++
      result.details.push({ row: rowNum, reason: 'dnc_blocked', company: row.company, phone: normalizedPhone, message: 'Číslo je na seznamu Nevolat' })
      continue
    }

    // 5d. Kontrola duplicit telefonu
    if (existingPhones.has(normalizedPhone)) {
      result.duplicates++
      result.details.push({ row: rowNum, reason: 'duplicate_phone', company: row.company, phone: normalizedPhone, message: 'Duplicitní telefon v projektu' })
      continue
    }

    // 5e. Kontrola duplicit emailu (pokud je)
    const email = row.email?.trim()?.toLowerCase() || null
    if (email && existingEmails.has(email)) {
      result.duplicates++
      result.details.push({ row: rowNum, reason: 'duplicate_email', company: row.company, phone: normalizedPhone, message: `Duplicitní e-mail: ${email}` })
      continue
    }

    // 5f. Validace phone_source
    const validSources = ['web_firmy', 'profil_firmy', 'databaze', 'poptavka']
    if (!validSources.includes(row.phone_source)) {
      result.errors++
      result.details.push({ row: rowNum, reason: 'invalid_data', company: row.company, message: `Neplatný zdroj čísla: ${row.phone_source}` })
      continue
    }

    // 5g. Pridat k insertu
    toInsert.push({
      project_id: projectId,
      company: row.company.trim(),
      phone: normalizedPhone,
      phone_source: row.phone_source,
      contact_person: row.contact_person?.trim() || null,
      email: email,
      website: row.website?.trim() || null,
      city: row.city?.trim() || null,
      ico: row.ico?.trim() || null,
      lead_source: row.lead_source?.trim() || null,
      priority: row.priority ?? 2,
      stage_id: newStage!.id,
      next_action_at: new Date().toISOString(),  // hned k dispozici
      next_action_type: 'callback',
      imported_at: new Date().toISOString(),
    })

    // Pridat do existujicich pro detekci duplicit UVNITR importu
    existingPhones.add(normalizedPhone)
    if (email) existingEmails.add(email)
  }

  // 6. Bulk insert
  if (toInsert.length > 0) {
    // Vkladat po davkach (max 500 radku najednou)
    const BATCH_SIZE = 500
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE)
      const { error } = await admin.from('leads').insert(batch)
      if (error) {
        // Pokud selze batch, zapocitat jako chyby
        result.errors += batch.length
        // ... detail chyby
        continue
      }
      result.imported += batch.length
    }
  }

  // 7. Audit log
  await admin.from('audit_log').insert({
    project_id: projectId,
    user_id: user!.id,
    action: 'leads_imported',
    details: {
      imported: result.imported,
      duplicates: result.duplicates,
      blocked_dnc: result.blocked_dnc,
      errors: result.errors,
      total_rows: rows.length,
    }
  })

  return result
}
```

---

## NORMALIZACE TELEFONU

### Funkce: `src/lib/utils/phone.ts`

```typescript
/**
 * Normalizuje cesky telefon do E.164 formatu (+420XXXXXXXXX).
 * Akceptuje formaty:
 *   +420 123 456 789
 *   00420123456789
 *   123 456 789
 *   123456789
 *   +420123456789
 * Vraci null pokud neni validni.
 */
export function normalizePhone(input: string): string | null {
  // Odstranit vsechno krome cislic a +
  let digits = input.replace(/[^\d+]/g, '')

  // Pokud zacina 00, nahradit za +
  if (digits.startsWith('00')) {
    digits = '+' + digits.slice(2)
  }

  // Pokud nezacina +, predpokladat cesky (+420)
  if (!digits.startsWith('+')) {
    digits = '+420' + digits
  }

  // Overit format: +420 nasledovano 9 cislic
  // (podporuje i jine predvolby, ale pro Weblyx je CZ default)
  const match = digits.match(/^\+(\d{10,15})$/)
  if (!match) return null

  // Pro ceska cisla: +420 + 9 cislic = 13 znaku
  if (digits.startsWith('+420') && digits.length !== 13) return null

  return digits
}

/**
 * Validuje ze telefon je v E.164 formatu.
 */
export function isValidE164(phone: string): boolean {
  return /^\+\d{10,15}$/.test(phone)
}
```

**Poznamky k normalizaci:**
- Ceska cisla: 9 cislic, predvolba +420
- Mobilni zacinaji 6xx nebo 7xx
- Pevne zacinaji 2xx-5xx
- Funkce NEPOCITA s jinyma zemema (pro Weblyx staci CZ)
- Pokud v budoucnu prida projekt z jine zeme, rozsirit normalizaci

---

## PARSOVANI SOUBORU (klientska strana)

### Knihovny:
```bash
npm install xlsx   # nebo sheetjs — parsuje CSV i Excel
```

Alternativa: `papaparse` pro CSV + `xlsx` pro Excel. Ale `xlsx` (SheetJS) zvladne oboje.

### `src/lib/utils/parse-file.ts`

```typescript
import * as XLSX from 'xlsx'

export type ParsedFile = {
  headers: string[]
  rows: Record<string, string>[]
  totalRows: number
}

export function parseFile(file: File): Promise<ParsedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', codepage: 1250 })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
          header: 1,  // pole poli
          defval: '',
          raw: false,  // vsechno jako string
        }) as string[][]

        if (json.length < 2) {
          reject(new Error('Soubor je prázdný nebo nemá hlavičku'))
          return
        }

        const headers = json[0].map(h => h?.toString().trim() || '')
        const rows = json.slice(1)
          .filter(row => row.some(cell => cell?.toString().trim()))  // odstranit prazdne radky
          .map(row => {
            const obj: Record<string, string> = {}
            headers.forEach((h, i) => { obj[h] = row[i]?.toString().trim() || '' })
            return obj
          })

        resolve({ headers, rows, totalRows: rows.length })
      } catch (err) {
        reject(new Error('Nepodařilo se přečíst soubor'))
      }
    }
    reader.onerror = () => reject(new Error('Chyba při čtení souboru'))
    reader.readAsArrayBuffer(file)
  })
}
```

---

## AUTOMATICKE MAPOVANI SLOUPCU

### `src/lib/utils/auto-map-columns.ts`

```typescript
type FieldMapping = {
  sourceColumn: string
  targetField: string | null
}

const FIELD_ALIASES: Record<string, string[]> = {
  company:        ['firma', 'company', 'nazev', 'název', 'jmeno firmy', 'název firmy', 'obchodní jméno'],
  contact_person: ['kontakt', 'kontaktni osoba', 'kontaktní osoba', 'jmeno', 'jméno', 'contact', 'osoba'],
  phone:          ['telefon', 'tel', 'phone', 'mobil', 'cislo', 'číslo', 'tel.'],
  email:          ['email', 'e-mail', 'mail', 'emailova adresa'],
  website:        ['web', 'website', 'www', 'url', 'stranka', 'stránka', 'webova stranka'],
  city:           ['mesto', 'město', 'city', 'obec', 'adresa'],
  ico:            ['ico', 'ič', 'ičo', 'ic', 'id firmy'],
  lead_source:    ['zdroj', 'source', 'zdroj leadu', 'odkud'],
  phone_source:   ['zdroj cisla', 'zdroj čísla', 'phone source'],
  priority:       ['priorita', 'priority', 'dulezitost', 'důležitost'],
}

export function autoMapColumns(headers: string[]): FieldMapping[] {
  return headers.map(header => {
    const normalized = header.toLowerCase().trim()
    for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
      if (aliases.some(a => normalized === a || normalized.includes(a))) {
        return { sourceColumn: header, targetField: field }
      }
    }
    return { sourceColumn: header, targetField: null }
  })
}
```

---

## DESIGN IMPORTNI STRANKY

### Hlavicka stranky:
```
Import leadů          [? napoveda]
```
- Nadpis 24px/600
- Jen pro admina — operator tuto stranku nevidi

### Krok 1 — Upload:
- Drag & drop zona s ikonou
- "Přetáhněte CSV nebo Excel soubor, nebo klikněte pro výběr"
- Pod zonou: "Podporované formáty: CSV, XLSX. Maximální velikost: 5 MB."
- Po nahrani: nazev souboru + pocet radku + tlacitko "Pokracovat"

### Krok 2 — Mapovani:
- Tabulka:
  | Sloupec v souboru | → | Cílové pole | Náhled dat |
  |---|---|---|---|
  | Firma | → | Firma* | Instalatérství Novák, Autoservis... |
  | Telefon | → | Telefon* | 608123456, +420... |
  | ... | | | |
- Dole: vyber zdroje cisla (pokud neni namapovany)
- Tlacitko "Importovat X leadů"
- Povinne (*) pole cervene pokud nenamapovane

### Krok 3 — Vysledek:
- 4 dlazdice:
  - Importováno: **87** (accent)
  - Duplicity: **8** (muted)
  - Nevolat: **3** (urgent)
  - Chyby: **2** (urgent)
- Pod tim: tabulka problemu (radek, firma, duvod)
- Tlacitko "Importovat další" + "Zpět na leady"

### Breakpointy:
- Mobil: vsechno pod sebou, plna sirka
- Tablet/pocitac: tabulka mapovani v plne sirce, dlazdice v rade

---

## PORADI IMPLEMENTACE

1. **`src/lib/utils/phone.ts`** — normalizePhone, isValidE164
2. **`src/lib/utils/parse-file.ts`** — parsovani CSV/Excel (+ `npm install xlsx`)
3. **`src/lib/utils/auto-map-columns.ts`** — automaticke mapovani
4. **`src/app/actions/import-leads.ts`** — Server Action pro import
5. **`src/app/(app)/[projectSlug]/import/page.tsx`** — route (admin only)
6. **`src/app/(app)/[projectSlug]/import/import-wizard.tsx`** — stavovy automat
7. **`src/app/(app)/[projectSlug]/import/file-upload.tsx`** — drag & drop
8. **`src/app/(app)/[projectSlug]/import/column-mapper.tsx`** — mapovani sloupcu
9. **`src/app/(app)/[projectSlug]/import/import-result.tsx`** — souhrn
10. **Overeni** — import 100 radku, duplicity + DNC se spravne odfiltruji

## KRITERIUM HOTOVO
- Import 100 testovacich radku projde
- Duplicity se spravne odfiltruji (telefon i email v ramci projektu)
- Cisla ze seznamu Nevolat se odmitnou
- Telefony normalizovane do E.164
- Souhrn ukazuje spravne pocty
- `npm run lint` a `npm run build` prochazi

## DULEZITE POZNAMKY PRO IMPLEMENTATORA

1. **Jen admin**: Import je pristupny jen pro admina. Overit roli v Server Action I v page.tsx.
2. **Parsovani na klientovi**: CSV/Excel se parsuje na klientovi (v prohlizeci) pres SheetJS. Na server se posila uz strukturovana data (pole objektu), NE raw soubor. To je efektivnejsi a bezpecnejsi.
3. **Kodovani**: Ceska CSV casto pouzivaji Windows-1250. SheetJS zvladne `codepage: 1250`. Pokud ne, implementator muze pouzit `TextDecoder('windows-1250')` pred parsovanim.
4. **Davkovy insert**: Vkladat po 500 radcich. Supabase ma limit na velikost POST requestu.
5. **Duplicity UVNITR importu**: Pokud import obsahuje 2 radky se stejnym telefonem, druhy se odfiltuje jako duplicita. Implementovano pridanim do `existingPhones` setu po kazdem uspesnem radku.
6. **next_action_at**: Kazdy importovany lead dostane `next_action_at = now()` — je okamzite k dispozici ve fronte. next_action_type = 'callback'.
7. **Faze**: Vsechny importovane leady jdou do faze 'new'.
8. **Round-robin prirazeni**: Import NEPRIRAZUJE leady operatorum — jdou do poolu (owner_id = NULL). Prirazeni resi round-robin v Kroku 7.
9. **Audit log**: Kazdy import zapise jeden audit zaznam s pocty.
10. **Pristupnost**: Drag & drop zona musi byt pristupna i klavesnici (input type=file jako fallback).
