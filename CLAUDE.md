# Weblyx CRM – callcentrum

Interní CRM pro callcentrum Weblyxu (tvorba webů pro firmy). Operátorky volají firmám ručně z telefonu, v CRM jen zapisují výsledek hovoru a systém sám naplánuje další krok. Cílem hovoru je domluvit 20minutovou konzultaci, kterou vede majitel.

Později přibude druhý projekt (úklidová firma). Proto **vše, co se liší mezi projekty, je konfigurace v databázi, ne kód**: fáze, vlastní pole, výsledky hovorů a jejich pravidla, důvody ztráty, šablony e-mailů, pracovní doba.

Podrobnosti: `docs/specifikace-weblyx.md` (byznys pravidla), `docs/design.md` (vzhled a obrazovky) a `docs/design-predloha/` (8 obrazovek jako přesná vizuální předloha), `docs/navod-operatorka.md` (texty nápovědy v aplikaci), `docs/postup-prompty.md` (pořadí stavby).

## Stack

- Next.js (App Router, TypeScript strict, Server Components + Server Actions), Tailwind CSS
- Supabase: Postgres, Auth (e-mail + heslo, 2FA pro admina), Row Level Security, Edge Functions / pg_cron pro plánované úlohy
- Nasazení: Vercel, doména zenuly.cz. Prostředí: `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` jen na serveru)
- Schéma databáze výhradně přes migrace v `supabase/migrations/` (Supabase CLI). Nikdy neměň schéma ručně v dashboardu.

## Zásady

- **Jazyk UI je čeština.** Kód, názvy tabulek a proměnných anglicky.
- **Pravidla po hovoru běží v databázi**: jedna funkce `record_call_outcome(...)` (plpgsql, `security definer`) v jedné transakci zapíše hovor, posune fázi, naplánuje callback nebo úkol, předá lead majiteli, zapíše Nevolat a audit. UI ji jen volá. Žádná byznys logika rozházená po komponentách.
- **Každý otevřený lead má vždy `next_action_at`.** Uložení bez dalšího kroku je chyba.
- **RLS na všech tabulkách.** Operátorka vidí jen leady svých projektů, které vlastní, nebo jsou v poolu. Telefony cizích leadů nevidí. Admin vidí vše.
- **Seznam Nevolat je nepřekročitelný**: číslo z něj nejde importovat, zobrazit ve frontě ani zavolat.
- Telefonní čísla ukládej normalizovaná do E.164 (`+420…`). Duplicity kontroluj v rámci projektu podle telefonu a e-mailu.
- Časy ukládej v UTC, zobrazuj v `Europe/Prague`.
- Responzivní od začátku: mobil (390 px), tablet (1180 px), počítač (1440 px). Viz `docs/design.md`.
- Přístupnost: skutečné `<button>`, `<a>`, `<label>`, dotykové cíle min. 44 px, kontrast textu 4,5:1.
- **Vestavěný návod pro operátorku od prvního dne.** Každá obrazovka pro operátora má tlačítko „?“ s krátkou nápovědou, prázdné a chybové stavy říkají, co udělat, a první přihlášení otevře průvodce. Texty ber z `docs/navod-operatorka.md`. Novou obrazovku bez nápovědy nepovažuj za hotovou.
- Žádná vymyšlená data v UI. Prázdné stavy řeš textem, ne ukázkovými čísly.

## Způsob práce

- Stavíme po krocích podle `docs/postup-prompty.md`. Na jeden prompt dělej **jen ten krok** a nepřeskakuj dopředu.
- Na konci každého kroku: spusť `npm run lint`, `npm run build` a testy, napiš, co je hotové, a ověř kritérium „Hotovo, když“ z promptu.
- Pravidla v databázi pokryj SQL testy (pgTAP nebo skript v `supabase/tests/`). Každý výsledek hovoru má aspoň jeden test.
- Když je něco ve specifikaci nejasné, zeptej se, nehádej.
- Commituj po každém hotovém kroku se srozumitelnou zprávou.
