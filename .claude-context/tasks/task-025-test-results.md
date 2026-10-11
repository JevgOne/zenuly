# Task #25/26 — Test Results (Krok 4: Přihlášení a role)

## Testovací uživatelé
- admin@zenuly.cz / Admin123! (role: admin, přiřazen k Weblyx)
- operator@zenuly.cz / Operator123! (role: operator, přiřazen k Weblyx)

## Test Results

### Autentizace
| Test | Výsledek | Poznámka |
|------|----------|----------|
| Login stránka se renderuje | OK | H1 "Přihlášení", formulář s email+heslo |
| Admin login (email+heslo) | OK | signInWithPassword funguje |
| Operator login (email+heslo) | OK | signInWithPassword funguje |
| Špatné heslo → chyba | OK | "Invalid login credentials" |
| Nepřihlášený → redirect /login | OK | / → 307 → /login?next=%2F |
| /weblyx/ bez auth → redirect | OK | 307 → /login |
| /admin/users bez auth → redirect | OK | 307 → /login |
| /settings bez auth → redirect | OK | 307 → /login |
| /login/mfa přístupný (public) | OK | 200 |

### Route struktura
| Route | Status | Poznámka |
|-------|--------|----------|
| / | Dynamic (ƒ) | Redirect logika po přihlášení |
| /login | Static (○) | Přihlašovací formulář |
| /login/mfa | Dynamic (ƒ) | MFA ověření, čte ?next param |
| /[projectSlug] | Partial Prerender (◐) | Redirect na /fronta |
| /[projectSlug]/fronta | Partial Prerender (◐) | Placeholder stránka |
| /admin/users | Dynamic (ƒ) | Seznam uživatelů |
| /settings | Dynamic (ƒ) | Profil + MFA setup |
| /auth/callback | Dynamic (ƒ) | OAuth/magic link callback |
| /auth/confirm | Dynamic (ƒ) | Email OTP verification |

### Supabase
| Test | Výsledek | Poznámka |
|------|----------|----------|
| handle_new_user trigger | OPRAVENO | Původní COALESCE cast selhával, opraveno na CASE/WHEN |
| profiles auto-vytvoření | OK | Trigger nyní funguje pro nové uživatele |
| project_members přiřazení | OK | Oba uživatelé přiřazeni k Weblyx |
| RLS na profiles | OK | Funguje s SECURITY DEFINER |

### Build & Lint
| Test | Výsledek |
|------|----------|
| npm run lint | 0 errors, 0 warnings |
| npm run build | OK (14 routes) |
| Dev server (port 3098) | Running, responds |

## Opravené bugy během testování
1. **handle_new_user trigger** — `COALESCE((metadata->>'role')::user_role, 'operator')` selhával protože cast proběhne před COALESCE. Opraveno na CASE/WHEN + přidáno `SET search_path = public`.
2. **QA fix: page.tsx** — redundantní if větve zjednodušeny
3. **QA fix: mfa/page.tsx** — hardcoded next="/" → čte searchParams

## Známé limitace (not bugs, future kroky)
- Fronta stránka je placeholder (přijde v Kroku 7)
- Navigační odkazy (Úkoly, Kalendář, Výkon) vedou na 404 (přijdou v pozdějších krocích)
- MFA enrollment nelze plně otestovat bez QR skeneru (ale kód je připravený)
- Pozvání operátora vytvoří uživatele ale neposílá email (inviteUserByEmail alternativa)
