# QA Report — Task #60: Redesign kontakt detail

Datum: 2026-10-12
Kontrolor: QA agent

---

## KRITICKÝ NÁLEZ: contact-detail-view.tsx existuje ale není zapojen

**`contact-detail-view.tsx` je vytvořen ale `page.tsx` ho NEIMPORTUJE.**

Aktuální stav souborů:
- `kontakty/[leadId]/page.tsx` — **stará verze** (232 řádků, žádný import contact-detail-view, žádné operators/stages props)
- `kontakty/[leadId]/contact-detail-view.tsx` — **existuje** (555 řádků, client component)

`page.tsx` stále používá inline rendering bez trust score, completeness baru, action baru ani timeline. `contact-detail-view.tsx` je mrtvý kód — nikdy se nezavolá.

Build prošel pouze proto, že `page.tsx` `contact-detail-view.tsx` vůbec neimportuje.

---

## 1. Importy — ověření

### page.tsx imports (řádky 1-4):
```
import { createClient } from "@/lib/supabase/server";       ✅ existuje
import { redirect, notFound } from "next/navigation";        ✅ Next.js
import Link from "next/link";                                ✅ Next.js
import { getContactDetail } from "@/app/actions/contacts";  ✅ existuje
```
Žádný import `contact-detail-view` — **komponent je dead code.**

### contact-detail-view.tsx imports (řádky 1-11):
```
import { useState, useTransition } from "react";                    ✅
import Link from "next/link";                                        ✅
import { useRouter } from "next/navigation";                         ✅
import { type ContactDetail, assignLeadOwner, changeLeadStage }
  from "@/app/actions/contacts";                                     ✅ (viz sekce 3)
import { reasonsFor } from "@/lib/callscript";                      ✅ existuje
```
Všechny importy v `contact-detail-view.tsx` jsou validní.

---

## 2. Typy — kontrola

### contact-detail-view.tsx:
- `contact: ContactDetail` — správný import z `@/app/actions/contacts` ✅
- `operators: Operator[]` kde `Operator = { id: string; name: string }` — jednoduché lokální typy ✅
- `stages: Stage[]` kde `Stage = { id: string; name: string; key: string; type: string }` ✅
- `useTransition` správně — `isPending: boolean`, `startTransition: (fn: () => void) => void` ✅
- Žádné `any` typy ✅
- `TrustScoreRing` props: `{ score: number; size?: number }` ✅

### Potenciální typový problém (střední závažnost):
`contact-detail-view.tsx:116` — `strokeDasharray={`${circumference}`}` — předává `number` jako template string, výsledek je string. SVG `strokeDasharray` očekává string nebo number — funkčně OK, ale nekonzistentní s `strokeDashoffset` na řádku 113 (`${offset}` — number). Není chyba, jen styl.

---

## 3. Autorizace server actions

### assignLeadOwner (contacts.ts:208-223):
```typescript
const { data: { user } } = await supabase.auth.getUser();
if (!user) throw new Error("Not authenticated");
```
**⚠️ CHYBÍ ROLE CHECK — BEZPEČNOSTNÍ DÍRA (vysoká závažnost)**

Kdokoliv přihlášený (i operátor) může zavolat tuto funkci a přeřadit owner_id libovolného leadu. Chybí check na `admin` nebo `manager` roli, stejný pattern jako v ostatních actions.

RLS na tabulce `leads` může to zachránit (operátor nevidí cizí leady), ale:
1. Operátor může přeřadit svůj vlastní lead jinému operátorovi — pravděpodobně nechtěné
2. Závisí to na RLS politice, ne na explicitním role checku v action

### changeLeadStage (contacts.ts:225-240):
**⚠️ STEJNÁ CHYBA — CHYBÍ ROLE CHECK (vysoká závažnost)**

Kdokoliv přihlášený může změnit fázi libovolného leadu (v rámci RLS).

### Srovnání s page.tsx guard (řádky 53-62):
`page.tsx` správně checkuje `admin` nebo `manager` před zobrazením stránky. Ale server actions jsou volatelné přímo (přes fetch/curl) bez procházení page.tsx.

**Požadovaný fix:**
```typescript
export async function assignLeadOwner(leadId: string, operatorId: string | null) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // ADD: role check
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  const { data: membership } = await supabase
    .from("project_members").select("role").eq("profile_id", user.id).single();
  if (profile?.role !== "admin" && membership?.role !== "manager") {
    throw new Error("Forbidden");
  }
  // ... rest
}
```

---

## 4. RLS kompatibilita

### assignLeadOwner — update `leads` set `owner_id`:
- RLS na `leads` pro operátory: typicky READ na vlastní leady + pool, WRITE přes `record_call_outcome()` (SECURITY DEFINER)
- Přímý UPDATE `owner_id` přes RLS závisí na politice — není zřejmé bez přečtení migration SQL
- Bez explicitního role checku v action je to riziko

### changeLeadStage — update `leads` set `stage_id`:
- Stejný problém — přímý UPDATE stage mimo `record_call_outcome()` může obcházet byznys pravidla (stage transitions, next_action_at, atd.)
- **Potenciálně závažné**: `record_call_outcome()` je designed jako jediný vstupní bod pro stage transitions. Přímý UPDATE stage_id obchází trigger logiku.

---

## 5. Responzivní layout

### contact-detail-view.tsx:
- Hlavní grid: `grid-cols-1 lg:grid-cols-3` — mobile stack, desktop sidebar ✅
- Header: `flex-col sm:flex-row` — správný responsive stack ✅
- Action bar: `flex flex-wrap gap-2` — wrapping na malých obrazovkách ✅
- Dotykové cíle: `h-10 px-4` = 40px výška — **MÍRNĚ POD 44px min** (nízká závažnost)
- Call button: `h-10` = 40px — pod 44px limitem

---

## 6. page.tsx vs contact-detail-view.tsx — propojení chybí

`page.tsx` nenačítá `operators` ani `stages` ze Supabase — což jsou props které `ContactDetailView` vyžaduje. Aby bylo propojení funkční, page.tsx musí:
1. Importovat `ContactDetailView` z `./contact-detail-view`
2. Načíst `operators` (project members s rolí operator)
3. Načíst `stages` pro daný projekt
4. Předat vše jako props

**Aktuálně page.tsx toto nedělá** — redesign není aktivní.

---

## Souhrn

| Oblast | Výsledek | Závažnost |
|--------|----------|-----------|
| Importy v page.tsx | ✅ OK | — |
| Importy v contact-detail-view.tsx | ✅ OK | — |
| contact-detail-view.tsx je zapojeno | ❌ FAIL — dead code | KRITICKÁ |
| Typy, žádné any | ✅ OK | — |
| assignLeadOwner — role check | ❌ FAIL — chybí | VYSOKÁ |
| changeLeadStage — role check | ❌ FAIL — chybí | VYSOKÁ |
| changeLeadStage — bypass record_call_outcome | ⚠️ RIZIKO | STŘEDNÍ |
| Responzivní layout | ✅ OK (drobnost: h-10 < 44px) | NÍZKÁ |
| Build | ✅ PASS | — |

**Celkový verdikt: ❌ NESCHVÁLENO — 3 problémy k opravě**

### Opravy nutné před schválením:
1. **page.tsx musí importovat ContactDetailView a načíst operators+stages** — jinak redesign není aktivní
2. **assignLeadOwner** musí mít role check (admin nebo manager)
3. **changeLeadStage** musí mít role check (admin nebo manager) + zvážit zda přímý UPDATE stage_id obchází byznys logiku
