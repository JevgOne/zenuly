# Postup stavby – prompty pro Claude Code

Jak to použít: v kořeni projektu spusť `claude`, zkopíruj jeden prompt, nech ho dokončit, zkontroluj „Hotovo, když“ a teprve pak jdi na další. Před prvním promptem musí být v repozitáři `CLAUDE.md` a složka `docs/`.

Co připravíš ty předem: prázdný GitHub repozitář, projekt v Supabase (URL a klíče), účet na Vercelu, doménu zenuly.cz a účet u služby na odesílání e-mailů (doporučuji Resend).

---

## Krok 1 – Založení projektu

```
Přečti CLAUDE.md a všechny soubory v docs/ včetně předloh v docs/design-predloha/. Založ Next.js projekt podle CLAUDE.md (App Router, TypeScript strict, Tailwind, src/), nastav Tailwind tokeny barev a písma z docs/design.md, inicializuj Supabase CLI (supabase/ s migrations a tests), přidej .env.example a Supabase klienty pro server i prohlížeč. Napiš krátké README, jak projekt spustit lokálně.
```
Hotovo, když: `npm run dev` běží, stránka má správné písmo a barvy a aplikace se připojí k Supabase.

## Krok 2 – Databáze a nastavení Weblyxu

```
Vytvoř migrace pro celé schéma podle docs/specifikace-weblyx.md: profiles (role admin/operator), projects, project_members, stages, custom_fields, leads, calls, outcomes (s pravidly v jsonb), lost_reasons, tasks, do_not_call, shifts, email_templates, audit_log. Vše, co se liší mezi projekty, ulož jako konfiguraci. Zapni RLS na všech tabulkách podle rolí z CLAUDE.md. Přidej seed s projektem Weblyx: 8 fází, vlastní pole, 8 výsledků hovoru s pravidly, důvody ztráty, 2 šablony e-mailů. Napiš SQL testy RLS.
```
Hotovo, když: migrace projdou na čisté databázi, seed vytvoří Weblyx a testy potvrdí, že operátor nevidí cizí leady.

## Krok 3 – Pravidla po hovoru

```
Napiš funkci record_call_outcome podle tabulky „Výsledky hovoru a pravidla“ a sekce „Obecná pravidla“ ve specifikaci. Jedna transakce: zápis hovoru, posun fáze, callback v pracovní době, opačná část dne u Nevzal to, max. 4 pokusy, úkoly, předání majiteli, Nevolat, audit. Pravidla čti z konfigurace outcomes, ne natvrdo. Ke každému výsledku napiš SQL test.
```
Hotovo, když: všech 8 výsledků má procházející test a žádný otevřený lead nezůstane bez next_action_at.

## Krok 4 – Přihlášení a role

```
Udělej přihlášení e-mailem a heslem přes Supabase Auth, 2FA pro admina, správu uživatelů pro admina (pozvat operátora, přiřadit k projektu) a přepínač projektu v horní liště. Operátor po přihlášení vidí jen svůj projekt.
```
Hotovo, když: se přihlásíš jako admin i operátor a každý vidí jen to, co má.

## Krok 5 – Import leadů

```
Udělej import leadů z CSV a Excelu pro admina: mapování sloupců, normalizace telefonu do E.164, kontrola duplicit v projektu, odmítnutí čísel ze seznamu Nevolat, povinný zdroj čísla. Na konci souhrn: kolik importováno, kolik duplicit a kolik zablokováno.
```
Hotovo, když: import 100 testovacích řádků projde a duplicity i Nevolat se správně odfiltrují.

## Krok 6 – Karta leadu, seznam a pipeline

```
Udělej kartu leadu přesně podle předloh docs/design-predloha/02, 06 a 07 (mobil, tablet, počítač), seznam leadů s filtrem a kanban pipeline pro admina s přetahováním mezi fázemi a kontrolou povinných polí podle fáze.
```
Hotovo, když: jeden lead projde všemi 8 fázemi a povinná pole se kontrolují.

## Krok 7 – Fronta „Volat teď“ a přidělování

```
Udělej průvodce prvním přihlášením a tlačítko „?“ podle docs/navod-operatorka.md a předloh 04 a 05. Pak udělej frontu Volat teď přesně podle předlohy 01 s řazením ze specifikace (propadlé, nové, dnešní, úkoly) a přidělování leadů round-robin s kapacitou 80, pool a SLA prvního hovoru 2 h (plánovaná úloha přeřadí a upozorní admina). Responzivně podle docs/design.md.
```
Hotovo, když: nová operátorka po prvním přihlášení projde průvodcem, vidí správně seřazenou frontu a nový lead se sám přidělí.

## Krok 8 – Zápis výsledku hovoru

```
Udělej obrazovku zápisu výsledku přesně podle předloh 03 (mobil), 06 (tablet) a 07 (počítač): výsledky ve 3 skupinách, text „co se stane“, jen povinný vstup podle výsledku, Uložit a další lead. Volá record_call_outcome. Na počítači klávesy 1–8 a Enter. Na mobilu se obrazovka otevře po návratu z hovoru (tel: odkaz). Tabulku „Co zvolit po hovoru“ z docs/navod-operatorka.md dej do nápovědy „?“ a do karty leadu přidej karty námitek.
```
Hotovo, když: 8 různých hovorů zapíšeš celkem nejvýš 3 ťuknutími každý a fronta se správně přeskládá.

## Krok 9 – Konzultace a Google Kalendář

```
Napoj Google Kalendář admina: volné sloty pro výsledek Konzultace, vytvoření události s pozvánkou klientovi, připomínka 1 h předem. Lead se předá adminovi.
```
Hotovo, když: domluvená konzultace sama naskočí v kalendáři.

## Krok 10 – E-maily

```
Napoj odesílání e-mailů (Resend) se šablonami A a B ze specifikace, předvyplněním proměnných a odesláním jedním tlačítkem z úkolu. Odeslání uzavře úkol, zapíše se do historie a posune fázi podle pravidel. Přidej automatický e-mail po vyčerpání pokusů.
```
Hotovo, když: testovací nabídka i prezentace dorazí a úkol se uzavře.

## Krok 11 – Směny a výkon

```
Udělej směny (Začít, Pauza, Ukončit), živé počítadlo hovorů za hodinu vs. cíl, upozornění na podezřele rychlé zápisy a měsíční export odpracovaných hodin pro admina.
```
Hotovo, když: z exportu spočítáš výplatu za testovací směny.

## Krok 12 – Denní report

```
Udělej denní report podle specifikace (body 1–5): stránku pro admina přesně podle předlohy 08 a e-mail každý pracovní den v 18:30 Europe/Prague přes plánovanou úlohu.
```
Hotovo, když: report dorazí sám a čísla sedí s daty v databázi.

## Krok 13 – Nasazení

```
Připrav nasazení na Vercel s doménou zenuly.cz, produkční proměnné prostředí, migrace na produkční Supabase a zálohy. Zkontroluj, že service role klíč není nikde v kódu pro prohlížeč.
```
Hotovo, když: CRM běží na zenuly.cz a přihlášení funguje.

## Krok 14 – Pilot

Bez promptu: 1 operátorka, 1 týden reálného volání. Sepiš chyby a nápady a zjisti reálný počet hovorů za hodinu. Pak teprve fáze 4 (AI audit, ARES, Google Places, karty námitek, A/B test) a projekt Úklid.
