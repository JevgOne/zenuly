# Task #25 — Kompletní Browser Test: Weblyx CRM

**Datum:** 2026-10-08  
**Tester:** TEST-CHROME  
**URL:** http://localhost:3098  
**Screenshots:** /tmp/crm-test-screenshots/

---

## Celkový výsledek: PARTIAL PASS

Velká část funkcionality funguje správně. Hlavní blocker: testovací účet `testchrome@hairland.cz` není v Supabase projektu Zenuly (jiná DB než Hairland). Sekce za přihlášením (navigace, admin, nastavení) nebylo možné otestovat.

---

## 1. Login Flow

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Redirect / → /login | **PASS** | `localhost:3098/login?next=%2F` |
| Czech texty na login stránce | **PASS** | "Přihlášení", "E-mail", "Heslo", "Přihlásit se" |
| Brand barva pozadí (#F6F5F1) | **PASS** | `rgb(246, 245, 241)` — přesně |
| Email input | **PASS** | `<input type="email">` |
| Password input | **PASS** | `<input type="password">` |
| Zobrazit heslo tlačítko | **PASS** | Tlačítko se SVG ikonou nalezeno |
| Chybová hláška při špatném hesle | **PASS** | "Nesprávný e-mail nebo heslo." (červeně) |
| Zapomenuté heslo odkaz | **FAIL** | Na stránce žádný odkaz není — chybí "Zapomenuté heslo?" |
| Přihlášení testchrome@hairland.cz | **FAIL** | Supabase vrací `invalid_credentials` — účet neexistuje v tomto projektu |

### Diagnóza login failure:
- Supabase URL: `lftzebeptmmyoljyifbe.supabase.co` (Zenuly projekt)
- Error: `{"code":"invalid_credentials","message":"Invalid login credentials"}`
- Účet `testchrome@hairland.cz` je v Hairland Supabase, ne v Zenuly CRM Supabase

---

## 2. Route Ochrana (bez přihlášení)

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Nepřihlášený → redirect na /login | **PASS** | `?next=%2F` správně |
| /admin/users → redirect na /login | **PASS** | `?next=%2Fadmin%2Fusers` |
| /settings → redirect na /login | **PASS** | `?next=%2Fsettings` |

Všechny chráněné routy správně přesměrovávají na /login.

---

## 3. Favicon a Title

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Title stránky | **PASS** | "Zenuly" |
| favicon.ico | **PASS** | `/favicon.ico` existuje |
| icon.svg | **PASS** | `/icon.svg` existuje |
| apple-touch-icon | **PASS** | `/apple-icon.png` existuje |
| Web manifest | **FAIL** | `<link rel="manifest">` chybí v HTML |

---

## 4. Responzivita

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Desktop (1280px) — login stránka | **PASS** | Centrovaná karta, správný design |
| Mobil (390px) — login stránka | **PASS** | Karta přizpůsobena, formulář čitelný |
| Bottom nav na mobilu | **NETESTOVÁNO** | Vyžaduje přihlášení |

---

## 5. Design (Login stránka)

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Písmo IBM Plex Sans | **PASS** | Ověřeno z předchozího testu i HTML class |
| Pozadí #F6F5F1 | **PASS** | `rgb(246, 245, 241)` |
| Karta #FDFDFB | **PASS** | `rgb(253, 253, 251)` |
| Text #16181D | **PASS** | `rgb(22, 24, 29)` |
| Accent barva #2449C9 | **PASS** | Tlačítko "Přihlásit se" modré — vizuálně odpovídá |
| Border radius ~15px | **PASS** | 15px na kartě |

---

## 6. Console Errory

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Console errory na login stránce | **FAIL** | 2× HTTP 400 z Supabase auth (při testu špatného hesla — očekávané) |

Poznámka: Tyto 400 errory jsou způsobeny záměrným testem špatného hesla — jsou očekávané a správné. Na čisté stránce bez pokusu o přihlášení nejsou žádné console errory.

---

## 7. Netestované sekce (vyžadují přihlášení)

Následující sekce nebylo možné otestovat bez platného účtu v Zenuly Supabase:
- Navigace po přihlášení (header, logo, project switcher, user menu)
- Admin sekce (/admin/users)
- Nastavení/profil (/settings)
- MFA setup
- Project switcher
- Bottom nav (mobil po přihlášení)

---

## Blocker: Chybí testovací účet

**Problém:** `testchrome@hairland.cz / Test123!` není v Supabase projektu Zenuly CRM.

**Řešení:** Potřeba vytvořit testovací účet v Zenuly Supabase (`lftzebeptmmyoljyifbe.supabase.co`) přes Supabase dashboard nebo přes pozvánku.

---

## Souhrn nalezených bugů / chybějících věcí

| # | Závažnost | Problém |
|---|-----------|---------|
| B1 | MEDIUM | Chybí odkaz "Zapomenuté heslo?" na login stránce |
| B2 | LOW | Chybí `<link rel="manifest">` (PWA manifest) |
| B3 | BLOCKER | Chybí testovací účet v Zenuly Supabase pro browser testy |
