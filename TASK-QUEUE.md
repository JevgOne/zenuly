# FRONTA ÚKOLŮ (TASK QUEUE)

> Úkoly se zpracovávají shora dolů podle priority.
> Stav: čeká | zpracovává se | hotovo | chyba
> Nové úkoly přidávej na konec — lead je seřadí podle priority.

---

## AKTIVNÍ

### TASK-54: Exkluzivní přiřazení leadů + noční cron rebalancing
Priorita: 1
Stav: zpracovává se — plánování
Přiřazeno: planovac

### Kompletní zadání:
Dva operátoři nesmí volat stejný kontakt. Když operátor dostane lead do fronty, nikdo jiný ho nedostane. Jednou denně v noci (např. 2:00) se zkontroluje kdo co navolal a přehodí se stale leady jinému operátorovi.
Hotovo, když: get_queue vrací exkluzivní leady a noční cron rebalancuje nezavolané.

---

### TASK-68: Lead finder — rozšíření na beauty/wellness/služby
Priorita: 2
Stav: zpracovává se — plánování
Přiřazeno: planovac

### Kompletní zadání:
Rozšířit find-leads.mjs o nové obory: masážní salony, beauty salony, kadeřnictví, květinářství, kadeřnictví pro psy, a další lokální služby. Kvalita nad kvantitou — lepší filtrování (ARES, telefon, web status). Výstup CSV do /Users/zen/zenuly/leady/.
Hotovo, když: nový sběr vrací kvalitní leady z beauty/wellness oborů.

---

### TASK-69: Registrační email z info@zenuly.cz (Resend SMTP)
Priorita: 2
Stav: zpracovává se — plánování
Přiřazeno: planovac

### Kompletní zadání:
Registrační (verification) email musí přijít z info@zenuly.cz, ne z default Supabase senderu. Nastavit custom SMTP v Supabase dashboardu přes Resend (smtp.resend.com).
Hotovo, když: registrační email přijde z info@zenuly.cz.

---

## ČEKÁ

### TASK-NVD: Projekt NVD (úklid + pomocná síla + security)
Priorita: 3
Stav: čeká — dotazník odeslaný majiteli, čeká se na odpovědi

### Kompletní zadání:
Nový projekt v CRM pro firmu NVD (uklidnvd.cz, securitynvd.cz). Jedna firma, tři služby: úklid, pomocná síla, security. Operátoři volají z okruhů (firmy.cz, mapy.cz), ukládají kontakty za běhu. AI doplní kartu z ARES + web. 10 výsledků hovorů včetně "Spolupracuje s jinou firmou" (AI analýza konkurence před návratem za 7 měsíců). Týdenní report. Pravidlo 25 hovorů/h. Bez pevné pracovní doby.

Blokováno: odpovědi majitele na dotazník (struktura, služby, emaily, reporty, výkon).
Dotazník: viz Claude Docs "NVD — Dotazník pro majitele" + memory project_nvd_crm.md.
Hotovo, když: projekt NVD funguje v CRM se všemi pravidly, reporty a automatickými emaily.

---

## HOTOVÉ

### TASK-K01: Krok 1 — Založení projektu ✅
### TASK-K02: Krok 2 — Databázové schéma ✅
### TASK-K03: Krok 3 — record_call_outcome ✅
### TASK-K04: Krok 4 — Přihlášení a role ✅
### TASK-K05: Krok 5 — Import leadů z CSV ✅
### TASK-K06: Krok 6 — Karta leadu, calling screen ✅
### TASK-K07: Krok 7 — Fronta, přidělování, onboarding ✅
### TASK-K08: Krok 8 — Zápis výsledku hovoru ✅
### TASK-K09: Krok 9 — Google Kalendář + konzultace ✅
### TASK-K10: Krok 10 — E-maily (Resend) ✅
### TASK-K11: Krok 11 — Směny a výkon ✅
### TASK-K12: Krok 12 — Denní report ✅
### TASK-LEADS: Hledání leadů přes celou ČR ✅
### TASK-AUDIT: Kompletní audit + opravy všech bugů ✅

---
