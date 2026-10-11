# QA Report — Krok 4: Přihlášení a role

**Datum:** 2026-10-08  
**Kontrolor:** kontrolor

---

## POZNÁMKA (vyřešeno během QA)

### docs/predloha-volani/ způsoboval lint/build chyby → opraveno Task #20

Task #20 zkopíroval TypeScript soubory do `docs/predloha-volani/`. Během QA bylo opraveno: `eslint.config.mjs` dostal `docs/**` do ignores a `tsconfig.json` dostal `"docs"` do exclude. **Po opravě lint i build prochází.**

---

## REVERZNÍ KONTROLA (Krok 4)

### 1. Kód a struktura

| Kontrola | Stav | Detail |
|----------|------|--------|
| proxy.ts: `export function proxy` (ne default, ne middleware.ts) | ✅ | `src/proxy.ts`, `export async function proxy(request: NextRequest)` |
| Admin layout — role guard | ✅ | Načítá profil, `profile?.role !== 'admin'` → redirect "/" |
| App layout — membership check | ✅ | Načítá project_members, porovnává slug, non-member → notFound() |
| Server actions — admin client kde je potřeba | ✅ | `users.ts`: inviteOperator, assignToProject, removeFromProject používají createAdminClient; admin/users/page.tsx také |
| requireAdmin() guard v server actions | ✅ | `requireAdmin()` volán na začátku každé admin akce |

### 2. Auth flow

| Kontrola | Stav | Detail |
|----------|------|--------|
| Login → callback → redirect | ✅ | `/auth/callback`: exchangeCodeForSession → redirect na `next` param |
| MFA setup (QR enroll) | ✅ | `mfa-setup.tsx`: enroll → QR z api.qrserver.com → verify |
| MFA login flow | ✅ | `login-form.tsx`: po signIn listFactors → hasTOTP → MfaForm; `mfa-form.tsx`: challenge → verify |
| Proxy redirect nepřihlášení → /login | ✅ | `proxy.ts`: !user → redirect /login?next=... |
| Proxy MFA check (AAL) | ✅ | aalData.currentLevel=aal1 + nextLevel=aal2 → redirect /login/mfa |
| Odhlášení | ✅ | `actions/auth.ts`: signOut() → supabase.auth.signOut() → redirect /login |

### 3. User management

| Kontrola | Stav | Detail |
|----------|------|--------|
| Admin invite operátora | ✅ | createUser + email_confirm:true + user_metadata + project_members insert |
| Seznam uživatelů | ✅ | Profiles + auth.admin.listUsers() pro emaily + membershipMap |

### 4. Route structure

| Kontrola | Stav | Detail |
|----------|------|--------|
| `(app)/[projectSlug]/` s membership check | ✅ | layout.tsx ověřuje členství, admin má fallback |
| `(admin)/admin/` s admin role guard | ✅ | layout.tsx kontroluje role=admin |
| `/settings` profil + MFA setup | ✅ | Zobrazuje profil, MfaSetup pouze pro admina |
| Root page redirect logika | ✅ | Redirectuje na první projekt; prázdný stav s hláškou |

### 5. Build a lint

| Kontrola | Stav | Detail |
|----------|------|--------|
| `npm run lint` | ✅ | Prošel (po opravě eslint.config.mjs — docs/** ignorováno) |
| `npm run build` | ✅ | Prošel (po opravě tsconfig.json exclude docs) |

### 6. Brand compliance

| Kontrola | Stav | Detail |
|----------|------|--------|
| Design tokeny | ✅ | bg-bg, bg-surface, border-line, text-ink, text-muted, bg-accent, rounded-btn, rounded-card — vše konzistentní |
| České texty | ✅ | Přihlášení, Odhlásit se, Správa uživatelů, Nastavení, Pozvat operátora atd. |

---

## SIMPLIFY nálezy

### Redundantní větve v root page.tsx (řádky 41–42)

```ts
if (allSlugs.length === 1) redirect(`/${allSlugs[0]}`);
if (allSlugs.length > 1) redirect(`/${allSlugs[0]}`);  // identické chování
```
Obě větve dělají totéž. Lze sloučit: `if (allSlugs.length > 0) redirect(...)`.

### /login/mfa ignoruje `?next` parametr

`mfa/page.tsx` renderuje `<MfaForm next="/" />` natvrdo. Pokud proxy přesměroval na /login/mfa s `?next=/weblyx/fronta`, po MFA ověření vždy půjde na "/", ne na původní cíl. Nízká priorita (MFA redirect z proxy nastane po přihlášení → user je na "/" kde ho root page přesměruje dál).

---

## Shrnutí

**Celkový stav Kroku 4: PASS**

lint + build prochází (docs/ excluded z tsconfig i eslint).

**Drobnosti (opcionální):**
- Sloučit redundantní větve v `src/app/page.tsx` řádky 41–42
- `/login/mfa/page.tsx` — předat `next` z URL params místo hardcoded "/"
