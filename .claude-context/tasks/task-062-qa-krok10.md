# QA Report: Krok 10 — E-maily (Resend)

> Kontrolor, 2026-10-10

---

## 1. SIMPLIFY kontrola

### Hodnocení: ČISTÉ — žádné zásadní problémy

**src/lib/resend.ts** — minimální, přímý fetch na Resend API. `from` se sestavuje z ENV proměnných s fallbacky. ✅

**src/lib/template-renderer.ts** — jednoduchá a správná. Neznámé proměnné se ponechají jako-is (`{{missing}}`), neodstraňují se. ✅

**src/app/actions/emails.ts** — dobře strukturované dvě Server Actions:
- `sendTemplateEmail()`: načte šablonu, render, odešle, uloží do `sent_emails`, uzavře task přes `complete_send_task`. ✅
- `sendAutoEmail()`: načte šablonu `unreachable`, render, odešle, audit log. Selhání se loguje ale neblokuje. ✅
- Obě používají `createAdminClient()` pro DB write — správně (bypass RLS pro insert do sent_emails). ✅
- Drobnost: `sendAutoEmail` používá `process.env.RESEND_FROM_PHONE` pro proměnnou `{{phone}}` — tato ENV proměnná není zmíněna v plánu ani v `.env` šabloně. Fallback `"+420 123 456 789"` je hardcoded placeholder. **Nízká závažnost — stačí přidat do ENV.**

**src/app/actions/calls.ts** — auto_email integrace je správná:
- Podmínka `result.auto_email && result.max_attempts_reached` ✅
- Selhání auto emailu neblokuje outcome (try/catch) ✅

**supabase/migrations/012_email_sending.sql** — čistá migrace:
- `sent_emails` tabulka s indexem na `(lead_id, sent_at DESC)` ✅
- RLS: admin ALL + member SELECT/INSERT ✅
- `complete_send_task()` funkce: FOR UPDATE lock, uzavření tasku, posun fáze `send_offer → offer_sent`, audit log ✅
- `get_lead_card()` rozšíření o `emails` sekci ✅
- Šablona `unreachable` seedována do `project_id = 00000000...0001` — OK pro demo projekt.
- **Poznámka:** Šablona v SQL používá háčky a čárky (správně), ale SQL soubor je bez escapování — kompatibilní s Postgres UTF-8. ✅

**ukoly/page.tsx** — správně mapuje `task_type → templateKey` přes `TEMPLATE_MAP`. Předvyplňuje `knownVars` z lead dat (company, contact_person, website, custom_data.sector). ✅

**send-email-form.tsx** — přehledná komponenta:
- Zobrazí se po kliknutí (lazy open) ✅
- Zobrazuje jen chybějící proměnné, předvyplněné skryje ✅
- Live preview subjektu i těla přes `renderTemplate` (client-side) ✅
- `allFilled` guard blokuje odeslání dokud nejsou všechna pole vyplněna ✅
- Po úspěchu volá `router.refresh()` ✅
- **Drobnost:** `dangerouslySetInnerHTML` pro preview těla — šablona pochází ze serveru (DB), ne od uživatele. Přijatelné riziko pro interní CRM. ✅

**history-list.tsx** — e-mailová záložka se zobrazí podmíněně pouze pokud `hasEmails`. ✅

---

## 2. DEBUG kontrola

### Build: ✅ PASSED

```
npm run build → ✓ Compiled successfully
/[projectSlug]/ukoly route přítomna ✅
```

### Lint: ✅ PASSED

```
0 errors, 1 nesouvisející warning (scripts/apply-migration-005.mjs)
```

---

## 3. REVERZNÍ kontrola

### Zadání: "Napoj odesílání e-mailů (Resend) se šablonami A a B ze specifikace, předvyplněním proměnných a odesláním jedním tlačítkem z úkolu. Odeslání uzavře úkol, zapíše se do historie a posune fázi podle pravidel. Přidej automatický e-mail po vyčerpání pokusů."

| # | Požadavek | Stav | Poznámka |
|---|-----------|------|----------|
| 1 | Resend integrace (odesílání e-mailů) | ✅ | `src/lib/resend.ts` + Resend API |
| 2 | Šablona A (nabídka / send_offer) | ✅ | `TEMPLATE_MAP['send_offer'] = 'offer'`, template ze seed dat |
| 3 | Šablona B (prezentace / send_deck) | ✅ | `TEMPLATE_MAP['send_deck'] = 'deck'`, template ze seed dat |
| 4 | Předvyplnění proměnných | ✅ | `knownVars` z lead (company, contact_person, website, sector) |
| 5 | Odeslání jedním tlačítkem z úkolu | ✅ | `SendEmailForm` na stránce `/ukoly` |
| 6 | Odeslání uzavře úkol | ✅ | `complete_send_task()` RPC po odeslání |
| 7 | Zapíše se do historie | ✅ | `sent_emails` insert + `history-list.tsx` email tab |
| 8 | Posun fáze podle pravidel (send_offer → offer_sent) | ✅ | V `complete_send_task()` SQL funkci |
| 9 | Automatický e-mail po vyčerpání pokusů | ✅ | `sendAutoEmail()` + šablona `unreachable` |
| 10 | Auto e-mail neblokuje outcome | ✅ | try/catch v calls.ts |
| 11 | ENV proměnná pro telefon v auto emailu | ⚠️ | `RESEND_FROM_PHONE` není v .env šabloně, fallback je placeholder |

---

## Shrnutí

**Build:** ✅ OK  
**Lint:** ✅ OK  
**Reverzní kontrola:** 10/11 splněno ✅

### Nalezené problémy

| Závažnost | Popis | Soubor |
|-----------|-------|--------|
| ℹ️ NÍZKÁ | `RESEND_FROM_PHONE` ENV není v .env šabloně — fallback je `+420 123 456 789` | `src/app/actions/emails.ts` + `.env.local` |

Krok 10 je implementován správně. Jediný nález je nekritický — stačí přidat `RESEND_FROM_PHONE` do `.env.local` a Vercel ENV.
