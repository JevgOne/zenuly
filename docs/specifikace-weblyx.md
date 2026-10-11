# Specifikace – projekt Weblyx

Vše v tomto souboru je **výchozí konfigurace projektu Weblyx** (seed do databáze), ne natvrdo psaný kód. Admin ji později mění v administraci.

## Role

| Role | Vidí | Může |
| --- | --- | --- |
| Admin (majitel) | Vše | Nastavení projektu, uživatelé, import, export, mazání, přeřazení, reporty. Vede konzultace. |
| Operátor | Své leady + pool projektu | Volat, zapisovat výsledky, plánovat callbacky, brát leady z poolu, směny |

## Fáze pipeline (8)

| Pořadí | Klíč | Název | Typ |
| --- | --- | --- | --- |
| 1 | `new` | Nový lead | open |
| 2 | `contacted` | Kontaktován | open |
| 3 | `meeting_booked` | Konzultace domluvena | open |
| 4 | `meeting_done` | Konzultace proběhla | open |
| 5 | `offer_sent` | Nabídka odeslána | open |
| 6 | `negotiation` | Vyjednávání | open |
| 7 | `won` | Vyhráno (záloha zaplacena) | won |
| 8 | `lost` | Ztraceno | lost |

Fáze 4–7 řeší jen admin. Operátor vlastní lead do fáze 3.

## Pole leadu

Pevná: firma, kontaktní osoba, telefon (E.164), e-mail, web, město, IČO, zdroj leadu, **zdroj čísla** (povinný: `web_firmy`, `profil_firmy`, `databaze`, `poptavka`), fáze, vlastník, priorita (1–3), `next_action_at`, `next_action_type`, počet pokusů, háček (text) + zdroj háčku, důvod ztráty.

Vlastní pole Weblyxu (konfigurace):

| Pole | Typ | Povinné od fáze |
| --- | --- | --- |
| Obor | výběr: řemeslníci a stavební, služby s rezervacemi, restaurace a ubytování, ostatní | Kontaktován |
| Typ projektu | výběr: landing page, prezentační web, e-shop, redesign | Konzultace domluvena |
| Rozpočet | výběr: do 10 tis., 10–30 tis., 30–80 tis., 80 tis.+ | Konzultace proběhla |
| Rozhodovatel | text | Konzultace domluvena |
| Termín spuštění | datum | Konzultace proběhla |
| Hodnota nabídky (Kč) | číslo | Nabídka odeslána |

## Výsledky hovoru a pravidla

Operátor po hovoru zvolí právě jeden výsledek. Funkce `record_call_outcome` provede vše v tabulce v jedné transakci.

| Klíč | Tlačítko | Skupina | Klávesa | Co se stane | Povinné vstupy |
| --- | --- | --- | --- | --- | --- |
| `meeting` | Konzultace | Zájem | 1 | Fáze `meeting_booked`, vlastník = admin, událost do kalendáře admina, připomínka 1 h předem, lead zmizí z fronty operátora | termín (z volných slotů admina) |
| `offer` | Nabídka | Zájem | 2 | Úkol `send_offer` (termín +24 h, nebo odeslat hned), po odeslání fáze `offer_sent`, callback +3 dny | e-mail |
| `deck` | Prezentace | Zájem | 3 | Úkol `send_deck` (hned), fáze `contacted`, callback +2 dny | e-mail |
| `later` | Jindy | Zkusit znovu | 4 | Fáze `contacted`, callback přesně na zadaný čas. Rychlé volby: za 2 h · zítra 9:00 · za týden · za měsíc · za 3 měsíce · vlastní datum. Do té doby lead není ve frontě. | datum a čas; u odložení o 7 a více dní volitelně důvod (např. „až po sezóně“) |
| `no_answer` | Nevzal to | Zkusit znovu | 5 | Pokus +1, callback další pracovní den v opačné části dne (dopoledne ↔ odpoledne). Po 4. pokusu fáze `lost`, důvod `unreachable`, automatický e-mail „Zkoušeli jsme vás zastihnout“ | – |
| `busy` | Obsazeno | Zkusit znovu | 6 | Callback +30 min, nepočítá se jako pokus | – |
| `not_interested` | Nemá zájem | Konec | 7 | Fáze `lost`, znovu oslovit za 6 měsíců (pokud není Nevolat) | důvod ztráty; volitelně „Nevolat“ |
| `wrong_number` | Špatné číslo | Konec | 8 | Fáze `lost`, úkol pro admina „zkontrolovat kontakt“ | – |

Vždy: zápis do `calls` (operátor, čas, výsledek, poznámka), audit log, aktualizace `next_action_at`.

Důvody ztráty: cena · už má web · nemá čas / teď ne · má agenturu nebo známého · udělá si sám · nedůvěra k AI · nevidí přínos · nedosažitelný (systémový) · jiné (+ text).

## Obecná pravidla

- Pracovní doba volání: Po–Pá 9:00–18:00 (Europe/Prague). Callback mimo ni se posune na začátek dalšího okna.
- Propadlý callback: 30 min po termínu je ve frontě zvýrazněný, po 24 h dostane admin upozornění.
- Nový lead musí dostat první hovor do 2 h v pracovní době, jinak se přeřadí dalšímu operátorovi a admin dostane upozornění.
- Seznam Nevolat: platí pro všechny operátory navždy, blokuje import i volání.
- Odložení: každý otevřený lead v jakékoli fázi (i u admina, např. Nabídka odeslána nebo Vyjednávání) jde odložit tlačítkem „Odložit“ se stejnými rychlými volbami. Fáze se nemění, mění se jen `next_action_at` a uloží se důvod. Když se lead vrátí do fronty, karta ukáže „Odloženo 8. 10. na žádost klienta: až po sezóně“ a první větu „Dobrý den, volám, jak jsme se domluvili minulý měsíc…“. Odložení nesnižuje počet zbývajících pokusů.
- Admin vidí seznam Odložené (seřazený podle data návratu) a v denním reportu počet nových odložení.

## Fronta „Volat teď“ (řazení)

1. Propadlé callbacky (nejstarší první)
2. Nové leady v SLA (podle priority, pak stáří)
3. Dnešní callbacky podle času
4. Úkoly k odeslání (nabídka, prezentace)

## Přidělování leadů

Round-robin mezi operátory projektu, kteří mají aktivní směnu a méně než 80 otevřených leadů. Když nikdo, lead jde do poolu. Duplicitní lead zůstává původnímu vlastníkovi. Přeřazení ručně jen admin, vždy s poznámkou.

## Směny a výkon

- Operátor: Začít směnu / Pauza / Ukončit směnu. Z toho se počítají hodiny (export pro výplatu).
- Hovor = každý zapsaný výsledek. Zvlášť dovolané (vše kromě `no_answer`, `busy`).
- Cíl hovorů za hodinu nastavuje admin (výchozí 20). Operátor vidí živé počítadlo za aktuální hodinu.
- Upozornění pro admina: zápisy výsledků rychleji než 20 s po sobě.

## Denní report (Po–Pá 18:30, e-mail adminovi + stránka v aplikaci)

1. Hodiny, hovory, hovory/h vs. cíl, dovolatelnost – po operátorech
2. Konzultace, odeslané prezentace, odeslané nabídky, Jindy, Nemá zájem, nová Nevolat
3. Top 3 důvody ztráty dnes + trend 7 dní
4. Trychtýř: dovoláno → zájem (výsledky 1–3) → konzultace, vs. minulý týden
5. Nedodělky: úkoly po termínu, propadlé callbacky
6. (Fáze 4 stavby) AI doporučení na zítra

## Šablony e-mailů

**A – nabídka** (předmět: Rozbor webu {{web}} a nabídka od Weblyxu): poděkování za hovor, 2–3 zjištění z auditu, balíček a cena, termín dodání, garance načtení pod 2 s, záloha 50 % až po schválení designu, termín dalšího kontaktu, odkaz na výběr termínu konzultace.

**B – prezentace** (předmět: Ukázky webů pro {{obor}}): příloha prezentace, 1–2 reference z oboru, termín dalšího kontaktu.

Ceník pro šablony (jednorázově, bez měsíčního poplatku za web): landing page 7 990 Kč, základní web 9 990 Kč, standardní web 24 900 Kč, e-shop od 34 900 Kč. Příplatky: rezervační systém 3 990, napojení Reservio 990, platby kartou 2 990, druhý jazyk 1 990, copywriting od 1 490, roční údržba 2 990 Kč. Hosting cca 100–300 Kč/měsíc. Weblyx není plátce DPH: ceny jsou konečné a v e-mailech i nabídkách se uvádí „Nejsme plátci DPH.“

## Fáze 4 – inovace (až po pilotu, nestavět dřív)

- AI audit leadů v noci: najít web, Google PageSpeed (mobil), kontrola HTTPS / mobil / telefon nad ohybem / formulář / ceník, jednatel z ARES, háček na kartu + zdroj, priorita.
- Zdroje leadů: ARES API (obor, region), Google Places jen pro firmy bez webu; ukládat pouze `place_id`, detail načítat živě; denní limit importu.
- Karty námitek během hovoru se statistikou, A/B test otevíracích vět, nejlepší čas volání, hlasová poznámka → AI vyplní pole, AI tipy operátorům a doporučení v reportu.
