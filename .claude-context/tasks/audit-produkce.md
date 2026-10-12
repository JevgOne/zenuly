# Audit produkce zenuly.cz

**Datum:** 2026-10-12  
**Auditor:** Evžen (kontrolor)  
**Metoda:** Čtení zdrojového kódu, žádné živé testování

---

## 1. Fronta — proč se nenačítá?

**Verdikt: KÓD JE V POŘÁDKU — problém je pravděpodobně datový nebo síťový**

### Průchod kódem:
- `fronta/page.tsx` → server component, načte `project` + `lostReasons`, předá do `CallingLayout`
- `CallingLayout` → renderuje `QueueList` s `projectId`
- `queue-list.tsx` → `useEffect` volá `getQueue(projectId)` ihned + každých 30s
- `queue.ts` → server action volá `supabase.rpc("get_queue", { p_project_id, p_operator_id })`
- Timeout ochrana: 15s `Promise.race` (řádek 48-50)
- Error stav: zobrazí "Frontu se nepodařilo načíst" + tlačítko "Zkusit znovu" (řádky 87-110)
- Empty stav: "Všechno máš hotové" (řádky 112-123)
- Cancelled flag pattern správně implementován

### Možné příčiny problému:
1. **RPC timeout** — `get_queue` nad 64k leady může být pomalá (záleží na indexech)
2. **Operátor nemá přiřazené leady** — get_queue vrací prázdné pole → zobrazí se "Všechno máš hotové" (ne chyba načítání)
3. **Operátor není v project_members** — RPC by nevrátila nic
4. **Síťový timeout** — 15s limit v klientu, ale Vercel má 10s limit na serverless functions (Free tier)

### Doporučení:
- Ověřit, zda `get_queue` RPC má index na `leads.next_action_at` + `leads.project_id` + `leads.owner_id`
- Ověřit Vercel function timeout (Free = 10s, Pro = 60s)
- Task #70 "Fix fronta — spinner, leady se nenačtou" je marked completed — možná už opraveno

---

## 2. Kalendář — settings říká "propojeno", kalendář stránka říká "nepropojeno"

**Verdikt: OPRAVENO v Task #74**

### Analýza:
- `kalendar/page.tsx` nyní volá `getCalendarConnection()` — **stejnou funkci jako settings**
- `getCalendarConnection()` (`calendar.ts:316-337`) používá user client s `supabase.from("calendar_connections").select("provider, is_active").eq("profile_id", user.id).single()`
- RLS policy `cc_own`: `USING (profile_id = auth.uid())` — umožňuje uživateli číst vlastní řádek
- `connectCalendar()` zapisuje přes `createAdminClient` s `upsert` na `onConflict: "profile_id"`
- Obě stránky (settings i kalendar) teď čtou ze stejného zdroje → konzistentní výsledek

### Stav: OK — opraveno

---

## 3. Registrace — funguje end-to-end?

**Verdikt: KÓD JE KOMPLETNÍ, ale závisí na konfiguraci Supabase emailu**

### Průchod flow:
1. **Registrace** (`register-form.tsx`): `supabase.auth.signUp()` s `emailRedirectTo: /auth/confirm` — OK
2. **Email potvrzení** (`auth/confirm/route.ts`): `verifyOtp({ token_hash, type })`, po úspěchu redirect na `/login?verified=true` — OK
3. **Login po ověření** (`login-form.tsx:72-75`): zobrazí "E-mail ověřen. Nyní se přihlaste." — OK
4. **Login error handling**: pro "Email not confirmed" zobrazí "E-mail adresa nebyla ověřena" + tlačítko "Znovu odeslat ověřovací e-mail" — OK
5. **Root redirect** (`page.tsx`): nový uživatel bez membership → zobrazí "Čekáte na přiřazení k projektu" — OK
6. **Proxy** (`proxy.ts:4`): `/auth/confirm` je v PUBLIC_ROUTES — OK

### Potenciální problém:
- **Task #69 "Registrační email z info@zenuly.cz místo Supabase default"** je stále `in_progress` — to znamená, že registrační emaily mohou chodit z výchozí Supabase adresy, což může vést ke spamu/nedoručení
- Supabase free tier má limit na emaily (4/hodinu) — pokud se registruje více uživatelů, nemusí email přijít

### Stav: KÓD OK, ale závisí na #69 (custom SMTP)

---

## 4. Nápovědy — jsou na všech stránkách?

**Verdikt: CHYBÍ NA VĚTŠINĚ STRÁNEK — hlavní nález auditu**

### Zjištění:
`HelpSheet` component se importuje/používá POUZE v:
- `calling-layout.tsx` (fronta/volání)
- `onboarding-wizard.tsx` (jen během onboardingu)
- `help-sheet.tsx` (definice komponenty)

### Stránky BEZ nápovědy ("?"):
| Stránka | Role | Nápověda |
|---------|------|----------|
| `/[slug]/fronta` | operátor | ANO (v CallingLayout) |
| `/[slug]/dashboard` | admin/manager | **NE** |
| `/[slug]/kontakty` | admin/manager | **NE** |
| `/[slug]/kontakty/[id]` | admin/manager | **NE** |
| `/[slug]/pipeline` | admin/manager | **NE** |
| `/[slug]/report` | admin/manager | **NE** |
| `/[slug]/ukoly` | operátor | **NE** |
| `/[slug]/vykon` | operátor | **NE** |
| `/[slug]/kalendar` | operátor | **NE** |
| `/[slug]/import` | admin | **NE** |
| `/[slug]/export-hodin` | admin/manager | **NE** |
| `/settings` | všichni | **NE** |
| `/admin/users` | admin | **NE** |

### Specifikace říká:
> "Každá obrazovka pro operátora má tlačítko ‚?' s krátkou nápovědou" (CLAUDE.md)
> "Novou obrazovku bez nápovědy nepovažuj za hotovou" (CLAUDE.md)

### Stav: **NESPLNĚNO** — nápověda je jen na frontě, na ostatních 12+ stránkách chybí

---

## 5. Prázdné stavy — co vidí operátor když nemá přiřazené leady?

**Verdikt: VĚTŠINA POKRYTA, jeden edge case**

### Prázdné stavy podle stránky:

| Stránka | Prázdný stav | Text | Stav |
|---------|-------------|------|------|
| Fronta (queue-list) | items.length === 0 | "Všechno máš hotové. Nové leady se objeví samy, nebo dej Pauza." | OK |
| Fronta (error) | error === true | "Frontu se nepodařilo načíst." + retry button | OK |
| Úkoly | taskList.length === 0 | "Žádné nevyřízené úkoly. Úkoly se vytvářejí automaticky..." | OK |
| Kalendář | !connection?.isActive | "Kalendář není propojený." + link do nastavení | OK |
| Výkon | !stats | "Statistiky nejsou k dispozici." | OK |
| Kontakty | prázdný výsledek | "Žádné kontakty neodpovídají filtru." / "V projektu zatím nejsou žádné kontakty." | OK |
| Dashboard operátoři | prázdné | "V projektu zatím nejsou operátoři." | OK |
| Report lost reasons | žádné ztráty | "Dnes žádné ztráty." | OK |
| Pipeline | žádné stages | Renderuje prázdný div (žádný text) | **MINOR** |
| Export hodin | žádné záznamy | "Za [měsíc] nejsou žádné záznamy." | OK |
| Kontakt detail hovory | žádné hovory | "Zatím žádné hovory." | OK |
| Root (nepřiřazený user) | žádný projekt | "Čekáte na přiřazení k projektu." | OK |

### Edge case:
- **Nový operátor bez směny**: Fronta vyžaduje aktivní směnu pro načtení leadů. Pokud operátor nemá aktivní směnu, `get_queue` RPC může vracet prázdný výsledek → zobrazí "Všechno máš hotové" místo informativnějšího "Zahajte směnu". Toto ale závisí na RPC logice (nezjistitelné bez přečtení migrace).

### Stav: VĚTŠINOU OK, minor issue s pipeline prázdným stavem

---

## Souhrnné nálezy

### Kritické (blokují push):
1. **Nápověda ("?") chybí na 12+ stránkách** — specifikace explicitně říká "každá obrazovka musí mít ?"

### Střední závažnost:
2. **Unicode escape sekvence** — `contact-detail-view.tsx` (31x) a `callscript-card.tsx` (2x) obsahují `\u00XX` místo UTF-8 znaků — reportováno dříve
3. **Registrační email** — Task #69 stále otevřený, default Supabase sender může vést k nedoručení

### Nízká závažnost:
4. **Pipeline prázdný stav** — chybí text pro případ, že nejsou žádné stages
5. **Fronta timeout** — 15s klient timeout, ale Vercel free tier má 10s serverless limit → race condition

### OK (opraveno / funguje):
- Kalendář disconnect — opraveno (#74)
- Registrace flow — kód kompletní
- Empty states — pokryto na většině stránek
- Fronta kód — strukturálně v pořádku
- Role checks — konzistentní na admin stránkách
