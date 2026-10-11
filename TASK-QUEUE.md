# FRONTA ÚKOLŮ (TASK QUEUE)

> Úkoly se zpracovávají shora dolů podle priority.
> Stav: čeká | zpracovává se | hotovo | chyba
> Nové úkoly přidávej na konec — lead je seřadí podle priority.

---

## AKTIVNÍ

### TASK-K05: Krok 5 — Import leadů z CSV
Priorita: 1
Stav: zpracovává se
Přiřazeno: planovac → implementator

### Kompletní zadání:
Udělej import leadů z CSV a Excelu pro admina: mapování sloupců, normalizace telefonu do E.164, kontrola duplicit v projektu, odmítnutí čísel ze seznamu Nevolat, povinný zdroj čísla. Na konci souhrn: kolik importováno, kolik duplicit a kolik zablokováno.
Hotovo, když: import 100 testovacích řádků projde a duplicity i Nevolat se správně odfiltrují.
Plán: `.claude-context/tasks/task-030-import-leads-plan.md`

---

### TASK-K10: Krok 10 — E-maily (Resend)
Priorita: 1
Stav: hotovo
Přiřazeno: ✅

### Kompletní zadání:
Napoj odesílání e-mailů (Resend) se šablonami A a B ze specifikace, předvyplněním proměnných a odesláním jedním tlačítkem z úkolu. Odeslání uzavře úkol, zapíše se do historie a posune fázi podle pravidel. Přidej automatický e-mail po vyčerpání pokusů.
Hotovo, když: testovací nabídka i prezentace dorazí a úkol se uzavře.

---

### TASK-K11: Krok 11 — Směny a výkon
Priorita: 1
Stav: hotovo
Přiřazeno: ✅

### Kompletní zadání:
Udělej směny (Začít, Pauza, Ukončit), živé počítadlo hovorů za hodinu vs. cíl, upozornění na podezřele rychlé zápisy a měsíční export odpracovaných hodin pro admina.
Hotovo, když: z exportu spočítáš výplatu za testovací směny.
Poznámka: Směny (start/pause/resume/end) už fungují. Chybí: živé počítadlo vs cíl, upozornění na rychlé zápisy, měsíční export hodin.

---

### TASK-K12: Krok 12 — Denní report
Priorita: 1
Stav: hotovo
Přiřazeno: ✅

### Kompletní zadání:
Udělej denní report podle specifikace (body 1–5): stránku pro admina přesně podle předlohy 08 a e-mail každý pracovní den v 18:30 Europe/Prague přes plánovanou úlohu.
Hotovo, když: report dorazí sám a čísla sedí s daty v databázi.

---

### TASK-LEADS: Hledání leadů — find-leads.mjs přes celou ČR
Priorita: 3
Stav: zpracovává se
Přiřazeno: implementator

### Kompletní zadání:
Spustit find-leads.mjs postupně pro všech 14 krajů ČR. Výstup CSV do /Users/zen/zenuly/leady/. Kraje jeden po druhém.

---

## ČEKÁ

(prázdné)

---

## HOTOVÉ

### TASK-K01: Krok 1 — Založení projektu ✅
### TASK-K02: Krok 2 — Databázové schéma ✅
### TASK-K03: Krok 3 — record_call_outcome ✅
### TASK-K04: Krok 4 — Přihlášení a role ✅
### TASK-K06: Krok 6 — Karta leadu, calling screen ✅
### TASK-K07: Krok 7 — Fronta, přidělování, onboarding ✅
### TASK-K08: Krok 8 — Zápis výsledku hovoru ✅
### TASK-K09: Krok 9 — Google Kalendář + konzultace ✅
### TASK-K10: Krok 10 — E-maily (Resend) ✅
### TASK-K11: Krok 11 — Směny a výkon ✅
### TASK-K12: Krok 12 — Denní report ✅

---
