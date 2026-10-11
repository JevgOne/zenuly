# Task #52 — Browser Test: Login + Fronta + Onboarding + Help

**Datum:** 2026-10-08  
**Tester:** TEST-CHROME  
**URL:** http://localhost:3098  
**Prohlížeč:** Google Chrome (viditelný, ne headless)

---

## Celkový výsledek: PASS

---

## 1. Login — 3 účty

| Účet | Role | Výsledek | Redirect | Poznámka |
|------|------|----------|----------|----------|
| zenuly3@gmail.com | admin | **PASS** | /weblyx/fronta | Avatar "ZA" |
| admin@zenuly.cz | admin | **PASS** | /weblyx/fronta | Avatar "AZ" |
| operator@zenuly.cz | operator | **PASS** | /weblyx/fronta | Avatar "OT", přes / (momentální redirect) |

---

## 2. Fronta stránka

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Stránka se načte bez chyb | **PASS** | URL: /weblyx/fronta |
| Žádné error elementy | **PASS** | errorElements: [] |
| Body text obsahuje navigaci | **PASS** | Fronta, Úkoly, Kalendář... |

---

## 3. OnboardingWizard

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Wizard se zobrazí | **PASS** | "KROK 1 ZE 4" viditelný na fronta stránce |
| Text průvodce | **PASS** | "Začni směnu. Ťukni na Začít směnu. Počítá se ti čas a hovory..." |
| Zobrazí se u všech testovaných účtů | **PASS** | Zobrazil se u všech 3 účtů |

---

## 4. "?" Help tlačítko + overlay

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Tlačítko "?" nalezeno | **PASS** | `w-9 h-9 rounded-full border border-line bg-surface` |
| Klik otevře overlay | **PASS** | Zobrazí se tabulka outcomes |
| Overlay název | **PASS** | "Nápověda pro operátorku" |
| Tabulka hlavička | **PASS** | "CO ZVOLIT PO HOVORU" |
| Tabulka sloupce | **PASS** | "Klient řekl / Ťukni / Co uděláš" |
| Počet řádků | **PASS** | 12 řádků (včetně headeru) |
| Obsah řádků (ukázka) | **PASS** | Konzultace, Nabídka, Prezentace, Rozbor, Jindy, Nevzal to... |
| Sekce "NIKDY" přítomna | **PASS** | Heading "NIKDY" (uppercase), 3 pravidla s ×: Nevolej / Nevymýšlej / Neříkej |

---

## 5. Admin navigace (admin účet)

| Test | Výsledek | Poznámka |
|------|----------|----------|
| "Administrace" link viditelný | **PASS** | href: /admin/users |
| Pipeline link viditelný pro admin | **PASS** | href: /weblyx/pipeline |
| Fronta, Úkoly, Kalendář, Výkon | **PASS** | Všechny přítomny |

---

## 6. Operator navigace

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Fronta, Úkoly, Kalendář, Výkon | **PASS** | Všechny přítomny |
| Pipeline CHYBÍ (správně) | **PASS** | Operátor nemá Pipeline |
| Administrace CHYBÍ (správně) | **PASS** | Operátor nemá Administrace |

---

## 7. Console errors

| Test | Výsledek | Poznámka |
|------|----------|----------|
| Žádné zachycené JS errors | **PASS** | capturedErrors: [] |
| Žádné error elementy v DOM | **PASS** | errorElements: [] |

---

## Souhrn

Všechny testované funkce prošly:
- Login 3 účtů funguje, správný redirect na /weblyx/fronta
- Fronta stránka bez chyb
- OnboardingWizard se zobrazuje (KROK 1 ZE 4)
- "?" help button otevírá overlay s tabulkou outcomes (12 řádků) + sekce "NIKDY" (3 pravidla)
- Admin vidí Administrace + Pipeline link
- Operator nevidí Pipeline ani Administrace (správné role-based routing)
- Logout funguje, redirect na /login
- Žádné console errors
