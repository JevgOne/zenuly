# Task #34 — Browser Test: Login + Registrace + Role

**Datum:** 2026-10-08  
**Tester:** TEST-CHROME  
**URL:** http://localhost:3098  
**Screenshots:** /tmp/crm-test-34/

---

## Celkový výsledek: PARTIAL PASS (s blokerem pro zenuly3 a operator)

---

## 1. Login stránka (/login)

| Test | Výsledek | Poznámka |
|------|----------|----------|
| "CRM" v headeru (NE "interní systém") | **PASS** | Header obsahuje "CRM" vpravo nahoře |
| Logo Zenuly vlevo | **PASS** | Logo + text "Zenuly" s ikonkou |
| Subtitle "Zadejte svůj e-mail a heslo." | **PASS** | Přesně tato věta pod nadpisem |
| Email input | **PASS** | Labeled "E-mail" |
| Heslo input + toggle zobrazení | **PASS** | Oko-ikonka pro zobrazení hesla (vpravo uvnitř fieldu) |
| "Zapomenuté heslo?" odkaz | **PASS** | Zobrazuje se vpravo vedle labelu "Heslo" jako button |
| Checkbox "Zůstat přihlášen na tomto zařízení" | **PASS** | Checkbox s popisem, defaultně zaškrtnutý |
| "Nemáte účet? Zaregistrujte se" | **PASS** | Odkaz na /register |
| ŽÁDNÝ Google OAuth | **PASS** | Google tlačítko nenalezeno |

**Screenshot:** /tmp/crm-test-34/01-login.png

---

## 2. Registrace (/register)

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Klik "Zaregistrujte se" → /register | **PASS** | Správný redirect |
| Formulář: "Jméno a příjmení" | **PASS** | Zobrazuje se jako první pole |
| Formulář: E-mail | **PASS** | Druhé pole |
| Formulář: Telefon s placeholder "+420" | **PASS** | Třetí pole, placeholder "+420" přesně |
| Formulář: Heslo + toggle zobrazení | **PASS** | Oko-ikonka v poli |
| Tlačítko "Zaregistrovat se" | **PASS** | Modré primární tlačítko |
| "Už máte účet? Přihlaste se" | **PASS** | Odkaz na /login |
| ŽÁDNÝ Google OAuth | **PASS** | Nenalezeno |

**Screenshot:** /tmp/crm-test-34/02-register.png

---

## 3. Login jako zenuly3@gmail.com / zenulythebest2026!

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Přihlášení proběhlo | **FAIL** | URL zůstala na `/` — redirect neproběhl na dashboard |
| Dashboard jako admin | **NETESTOVÁNO** | |

**Diagnóza:**
- Supabase autentizace proběhla ÚSPĚŠNĚ (cookie `sb-lftzebeptmmyoljyifbe-auth-token` nastavena, Supabase vrátil 200)
- Po přihlášení Next.js redirect na `/` — ale `/` route neexistuje → Next.js vrací 404 / zobrazuje login stranu znovu
- Vizuálně: stránka vypadá jako login (rendering login page) — ale uživatel je přihlášen, cookie platná
- Pravděpodobná příčina: middleware nebo root page (`/`) neví kam přesměrovat zenuly3 (možná chybí project slug pro tento účet)

---

## 4. Login jako admin@zenuly.cz / Admin123!

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Přihlášení proběhlo | **PASS** | Redirect na `/weblyx` |
| Dashboard se zobrazil | **PASS** | Header: "Weblyx" + navigace viditelná |
| Navigace — všechny položky | **PASS** | Fronta, Úkoly, Kalendář, Pipeline, Výkon |
| Admin přístup viditelný | **FAIL** | Žádný odkaz na /admin v navigaci |

**Navigace admin:** Fronta / Úkoly / Kalendář / Pipeline / Výkon (+ avatar "AZ" vpravo)

**Screenshot:** /tmp/crm-test-34/04-admin-dashboard.png — screenshot zachycen před dokončením renderingu (prázdná stránka), ale data z DOM potvrzena.

---

## 5. Login jako operator@zenuly.cz / Operator123!

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Přihlášení proběhlo | **FAIL** | URL skončila na `/` — stejný problém jako zenuly3 |
| Operátorský přístup (omezená navigace) | **NETESTOVÁNO** | |

**Poznámka:** Z DOM dat bylo vidět, že navigace obsahuje: Fronta / Úkoly / Kalendář / Výkon (bez Pipeline — správně omezeno), ale URL skončila na `/` nikoliv na `/weblyx/...` — možná operator nemá přiřazený projekt "weblyx".

---

## Souhrn bugů

| # | Závažnost | Popis |
|---|-----------|-------|
| B1 | HIGH | `zenuly3@gmail.com` po přihlášení redirect na `/` — route neexistuje, uživatel uvízne |
| B2 | HIGH | `operator@zenuly.cz` po přihlášení redirect na `/` — stejný problém |
| B3 | MEDIUM | Admin navigace neobsahuje odkaz na /admin sekci (user management) |
| B4 | LOW | Playwright screenshot admin/operator zachycen před dokončením renderingu |

---

## Co funguje výborně

- Login stránka: design, texty, formulář, všechny prvky — 100% dle spec
- Registrace: design, formulář se všemi poli, +420 placeholder — 100% dle spec
- Žádný Google OAuth na žádné stránce — PASS
- admin@zenuly.cz → dashboard s navigací — funguje
- Navigace admin: Fronta, Úkoly, Kalendář, Pipeline, Výkon — vše zobrazeno
