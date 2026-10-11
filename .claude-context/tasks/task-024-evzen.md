# Task 024 — Evžen: kontrola Kroku 4 + Brand integrace

**Datum:** 2026-10-08
**Verdikt: SCHVALENO S VYHRADAMI**

## 1. Krok 4 (prihlaseni a role)

### proxy.ts — OK
- `src/proxy.ts`, `export async function proxy` (spravne, ne default, ne middleware.ts)
- PUBLIC_ROUTES: /login, /auth/callback, /auth/confirm
- Neprihlaseny -> redirect /login?next=pathname
- MFA check: aal1 + aal2 required -> redirect /login/mfa

### Login — OK (s vyhradami k brandu, viz sekce 2)
- Email + heslo pres Supabase Auth
- Ceske texty: "Prihlaseni", "Nespravny e-mail nebo heslo", "Prihlasit se"
- Presmerovani na ?next parameter po prihlaseni

### MFA — OK
- 2FA TOTP pro admina
- Zapnuti: Settings -> MfaSetup (QR enroll + verify)
- Vypnuti: tlacitko "Vypnout 2FA" (unenroll)
- Login flow: po signIn -> listFactors -> hasTOTP -> MfaForm (challenge+verify)
- MFA zobrazeno jen pro admina (profile.role === 'admin')

### Admin sprava uzivatelu — OK
- /admin/users — seznam uzivatelu s jmenem, emailem, roli, projekty
- Pozvat operatora: jmeno, email, vyber projektu (checkboxy)
- Server action inviteOperator s requireAdmin() guard
- Prirazeni k projektu pres project_members

### Route structure — OK
- (app)/[projectSlug]/ — membership check v layoutu
- (admin)/admin/ — admin role guard v layoutu
- /settings — profil + MFA setup
- /login, /login/mfa, /auth/callback, /auth/confirm

### Build + Lint — OK (QA report potvrzuje PASS)

## 2. Brand integrace

### Barvy v globals.css vs tokens.css — OK
Vsechny tokeny z BRAND.md/tokens.css jsou v globals.css:
- bg #F6F5F1, surface #FDFDFB, line #E4E2DC, input-border #C8C5BD
- text #16181D (ne ink!), muted #5E6168
- accent #2449C9, accent-soft #E8ECFA, accent-dark #7F96EA
- urgent #B42318, urgent-soft #FDECEA
Stare tokeny (ink, accent-tint, accent-ink, accent-deep, line-strong, urgent-ink, urgent-tint, track) nikde v kodu — OK

### Radiusy — OK
- sm 4px, md 8px, lg 12px (spravne, ne stare 15/13/8)

### --color-text (ne --color-ink) — OK
- Zadne vyskyty text-ink nebo color-ink v src/

### Favicony — OK
- src/app/favicon.ico, icon.svg (brand symbol na modrem pozadi), apple-icon.png
- public/brand/icon/ obsahuje vsechny varianty z BRAND.md

### manifest.json — OK
- name "Zenuly", theme_color #2449C9, background_color #F6F5F1
- Ikony: icon-192, icon-512, icon-maskable-512 (purpose: maskable)

### IBM Plex Serif pro logo — OK
- layout.tsx: IBM_Plex_Serif weight 500, variable --font-logo

### IBM Plex Mono 400/500 — OK
- layout.tsx: weight ["400", "500"] (drive bylo jen 500)

### Login obrazovka vs BRAND.md — NESEDI

BRAND.md specifikuje:

| Prvek | BRAND.md rika | Implementace | Stav |
|-------|--------------|-------------|------|
| Desktop horni lista s logem | logo.svg, vyska 26px + "Interni system pro callcentrum" | CHYBI | CHYBI |
| Karta max 420px, padding 40 | max 420px, p-10 | max-w-sm (384px), p-8 (32px) | SPATNE |
| Mobil bez karty | Formular pres celou sirku, padding 24 | Stejna karta i na mobilu | SPATNE |
| "Prihlaste se pracovnim e-mailem." | Pod nadpisem | CHYBI | CHYBI |
| "Zapomenute heslo?" | U pole Heslo | CHYBI | CHYBI |
| Zobrazit heslo | Tlacitko u Hesla | CHYBI | CHYBI |
| "Zustat prihlaseny na tomto zarizeni" | Checkbox | CHYBI | CHYBI |
| Paticka zenuly.cz + verze | Plex Mono #5E6168 | CHYBI | CHYBI |

## 3. Materialy zkopirovane

| Adresar | Ocekavane soubory | Stav |
|---------|------------------|------|
| docs/brand/ | BRAND.md, tokens.css | OK |
| public/brand/logo/ | 7 SVG + 1 PNG variant | OK (11 souboru) |
| public/brand/icon/ | favicon.ico, favicon.svg, favicon-16/32, icon-192/512, maskable, apple-touch | OK (10 souboru) |
| public/brand/email/ | logo-email@2x.png, logo-primary-email@2x.png | OK |
| docs/predloha-volani/ | CALLSCRIPT.md + 4 TS soubory | OK (5 souboru) |
| docs/lead-finder/ | SYSTEM.md, ZADANI.md, JAK-TO-FUNGUJE.md | OK |
| docs/lead-finder/reference/ | kvalita.mjs, find-leads.mjs, send-leads.mjs | OK |
| docs/lead-finder/test-data/ | kolin.csv, zkouska-kolin.csv | OK |
| src/lib/lead-finder/ | osm.ts, inspect.ts, categories.ts | OK |

## 4. Drobnosti (neopravovat)

- mfa-setup.tsx radek 23: friendlyName "Weblyx CRM" -> melo by byt "Zenuly" (kosmeticke)
- /login/mfa/page.tsx: next je hardcoded "/" misto z URL params (nizka priorita, QA report to zminuje)

## ZAVER

Krok 4 (prihlaseni, MFA, sprava uzivatelu, routy) je funkcne spravny.
Brand integrace (tokeny, radiusy, favicony, manifest, pisma) je spravna.
**Login obrazovka nesplnuje specifikaci BRAND.md** — chybi 7 prvku (logo, subtitle, zapomenute heslo, zobrazit heslo, checkbox, paticka) a rozmery nesedi (384px misto 420px, padding 32 misto 40).

Doporucuji: opravit login obrazovku podle BRAND.md v dalsim kroku, neblokovat tim Krok 4 (funkcne je vse v poradku).
