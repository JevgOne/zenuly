# Jak se hledají a oslovují leady

Popis celého postupu tak, jak běží k 8. 10. 2026. Slouží jako zadání pro samostatné CRM.

Postup má dvě části:

1. **Hledání** – skript `~/lead-finder/find-leads.mjs` (Node, bez závislostí). Výstup je CSV a HTML přehled.
2. **Rozbor, e-mail a odeslání** – web Weblyx (`~/Weblyx`), sekce adminu „Lead generation“.

---

## 1. Hledání firem (`find-leads.mjs`)

### 1.1 Zdroj: OpenStreetMap

Firmy se berou z OpenStreetMap přes Overpass API (zdarma, bez klíče).

- Oblast: `--mesto "Kolín"`, kraj nebo víc oblastí oddělených čárkou (`"Středočeský kraj,Praha"`). Hledá se administrativní hranice s tím názvem.
- Obor: klíčové slovo ze slovníku `OBORY` (kadernictvi, kosmetika, nehty, masaze, tetovani, solarium, restaurace, kavarna, hotel, penzion, autoservis, pneuservis, zubar, lekar, veterinar, instalater, elektrikar, truhlar, kvetinarstvi, realitka, ucetni, pravnik, fitness) nebo libovolný OSM tag (`craft=plumber`). Bez oboru vezme vše, co má v OSM uvedený web.
- Standardně jen objekty s tagem `website` nebo `contact:website`. S `--bez-webu` i firmy bez webu.
- Dotaz se posílá po dávkách 8 filtrů; při chybě se opakuje a zkouší záložní server.

Z OSM se čte: název, obor (tag), web, telefon, e-mail, adresa.

### 1.2 Co se vyřadí hned

- Pobočky řetězců (tag `brand`), památky, vojenské objekty.
- Školy, školky, úřady, kostely, policie, pošty, knihovny, nemocnice, banky, čerpací stanice, parkoviště.
- Muzea, atrakce, infocentra; úřady, strany, církve, spolky.
- Duplicitní weby (stejná doména) v rámci jednoho běhu.

### 1.3 Skóre zastaralosti webu

Stáhne se úvodní stránka (když HTTPS selže, zkusí HTTP) a body se sčítají:

| Nález | Body |
|---|---|
| chybí `viewport` (web není pro mobil) | 3 |
| Flash (`.swf`) | 3 |
| web běží jen na HTTP | 2 |
| rok v patičce © starý 3 a více let | 2 |
| WordPress starší než 6, Joomla 1.x/2.x | 2 |
| zastaralé HTML (`font`, `center`, `frameset`, `marquee`) | 2 |
| jQuery 1.x | 1 |
| 5 a více tabulek (layout v tabulkách) | 1 |
| chybí Open Graph tagy | 1 |
| hlavička `Last-Modified` stará 3 a více let | 1 |
| PageSpeed mobil pod 50 (jen s `--pagespeed`) | 2 |

Zvláštní případy:

- **Web nefunguje** (nenačte se): skóre 5.
- **Blokace robota nebo timeout** (401, 403, 429): lead se vynechá, nejde ověřit.
- **Firma nemá web**, nebo má jen Facebook/Instagram/Firmy.cz: do výstupu jde jen s `--bez-webu` a když má e-mail nebo telefon.

Do výstupu jdou weby se skóre od `--min-score` (výchozí 3), seřazené od nejhoršího.

### 1.4 Kontakty

- E-mail z OSM, z úvodní stránky a až ze dvou podstránek, jejichž odkaz obsahuje „kontakt“, „contact“ nebo „napište“.
- Umí rozluštit HTML entity, zápis „(at)“ / „[zavináč]“ a ochranu Cloudflare (`data-cfemail`).
- Zahazuje adresy obrázků a zjevné vzory (`vas@`, `jmeno@`, `example.`).
- Přednost mají adresy na doméně firmy; do CSV jdou nejvýš dvě.
- Telefon z OSM, jinak první odkaz `tel:` na webu.

### 1.5 Výstup

CSV oddělené středníkem, s BOM, buňky v uvozovkách (mohou obsahovat nové řádky):

```
firma; web; email; telefon; adresa; skore; duvody; predmet; text_emailu
```

Sloučený soubor `vsechny-leady.csv` má navíc první sloupec `oblast`.

K tomu HTML přehled se stejnými daty (hledání, filtr „jen s e-mailem“, kopírování textu).

Skript ke každé firmě připraví i obecný text oslovení podle oboru (`OBOR_TEXT`, 70+ oborů) a hlavního nálezu. Ten se dnes používá jen jako záloha, viz 2.3.

### 1.6 Čísla z dosavadních běhů

| Oblast | Nalezeno | S e-mailem |
|---|---|---|
| Praha | 508 | – |
| Středočeský kraj | 496 | – |
| Kolín | 32 | – |
| **Celkem** | **1 036** | **512** |

Telefon má většina firem; e-mail zhruba polovina.

---

## 2. Rozbor, e-mail a odeslání (web Weblyx)

### 2.1 Import

Admin → Lead generation → Importovat CSV (`lib/outreach/csv.ts`).

- Pozná formát lead-finderu podle hlavičky.
- Z buňky s více adresami (oddělené čárkou, středníkem, mezerou) vezme první platnou.
- Přeskočí duplicitu podle e-mailu **i** podle domény webu, proti databázi i v rámci souboru.
- Přeskočí adresy ze seznamu „nikdy neoslovovat“.
- Řádky bez e-mailu neimportuje.

Tabulky: `lead_generation_leads` (firma, kontakty, stav, uložený rozbor) a `generated_emails` (předmět a text e-mailu pro firmu).

### 2.2 Rozbor webu

Vlastní analyzátor webu (`lib/web-analyzer.ts`, `lib/audits/checks.ts`), stejný jako u bezplatného auditu na weblyx.cz. Dává:

- celkové skóre 0–100 a šest dílčích (SEO, rychlost, bezpečnost, přístupnost, sociální sítě, AI vyhledávání),
- 17 kontrol ano/ne v řeči majitele firmy: web pro mobil, telefon na jedno klepnutí, HTTPS, napojení na mapy, titulek a popis v Googlu, recenze na webu, aktuálnost obsahu, kontakt v textu, náhled při sdílení, formát obrázků, mapa webu, FAQ, měření návštěvnosti, cookie lišta, přístup AI robotů, llms.txt, strukturované údaje,
- seznam nálezů s doporučením.

Rozbor trvá 10–20 s na web. Výsledek se ukládá k leadu (`analysis_result`), takže celý report jde později poslat bez nového čtení webu. Z 493 firem se podařilo rozebrat 380; zbytek web nemá, nebo se nenačetl.

### 2.3 Text e-mailu

`lib/outreach/compose.ts`. Když rozbor najde aspoň dvě věci, obecný text se nahradí tímto:

1. věta se jménem domény a skóre,
2. dvě až tři nejvýmluvnější neprošlé kontroly, každá jednou větou,
3. kolik dalších věcí je sepsáno a nabídka celého rozboru zdarma,
4. nabídka nezávazného návrhu nového webu.

Předmět: „Krátký rozbor webu {doména}“. Každá věta vychází z kontroly, která na tom webu opravdu neprošla.

### 2.4 Podoba a odeslání

`lib/outreach/email.ts`, `app/api/lead-generation/outreach/route.ts`.

- Odesílatel `Weblyx <info@weblyx.cz>`, přes Resend. HTML i čistý text.
- Podpis jako vizitka (Jevgenij, telefon, web).
- Tlačítko „Poslat mi celý rozbor zdarma“ u firem s uloženým rozborem.
- Odkaz na odhlášení a hlavičky `List-Unsubscribe` pro tlačítko v poštovní aplikaci.
- Dávka nejvýš 20 e-mailů, pauza 1,5 s, každá firma jen jednou.
- Neplatná adresa se odloží a dávka pokračuje; chyba služby dávku zastaví.

### 2.5 Co se děje po odeslání

- **Odhlášení** (`/odhlasit`): potvrzení jedním tlačítkem, adresa jde do `outreach_unsubscribes` a už se neosloví ani neimportuje.
- **Vyžádání rozboru** (`/rozbor`): firma klikne, rozbor jí odejde sám, lead se označí jako zájemce a tým dostane upozornění e-mailem a do Telegramu.
- **Ruční odeslání rozboru**: v adminu u každé firmy „Zobrazit rozbor“ a „Poslat rozbor firmě“.

Odkazy jsou podepsané (HMAC adresy), takže fungují jen pro adresu, pro kterou vznikly.

---

## 3. Co postup neumí

- **Odpovědi e-mailem** nečte. Schránka `info@weblyx.cz` (Titan) není napojená; odpověď musí někdo zpracovat ručně.
- **Doručení a otevření** se neukládá. Stav jde dohledat jen v Resendu.
- **Následné zprávy** (připomenutí po pár dnech) nejsou.
- **Obor firmy** se do CSV nezapisuje jako sloupec, je jen v textu e-mailu.
- **Jméno kontaktní osoby** se nehledá; oslovení je vždy „Dobrý den“.
- **Jen OpenStreetMap**: firma, která v OSM není, se nenajde. Pokrytí je dobré u provozoven, slabší u firem bez kamenné pobočky.
- **Polovina firem nemá e-mail**; využít jdou jen po telefonu.

---

## 4. Právní upozornění

Zasílání obchodních sdělení e-mailem bez předchozího souhlasu příjemce je v Česku zakázané zákonem č. 480/2004 Sb., i když jde o firmu a adresa je veřejná. Dozor má ÚOOÚ. Z prvních 18 odeslaných e-mailů přišla jedna odpověď s pohrůžkou stížností.

Než se rozesílka spustí znovu nebo se postaví do nového CRM, je potřeba to probrat s právníkem. Bezpečnější pořadí je nejdřív telefon a e-mail s rozborem až tomu, kdo o něj řekne.

---

## 5. Kde co je

| Co | Kde |
|---|---|
| Hledání firem | `~/lead-finder/find-leads.mjs` |
| Záložní odesílání ze skriptu | `~/lead-finder/send-leads.mjs` |
| Nalezené leady | `~/lead-finder/*.csv`, `vsechny-leady.csv` |
| Import CSV | `~/Weblyx/lib/outreach/csv.ts` |
| Analyzátor webu | `~/Weblyx/lib/web-analyzer.ts`, `lib/audits/checks.ts`, `lib/audits/report.ts` |
| Text e-mailu z rozboru | `~/Weblyx/lib/outreach/compose.ts` |
| Hromadný rozbor fronty | `~/Weblyx/lib/outreach/improve.ts` |
| Podoba e-mailu, podpis | `~/Weblyx/lib/outreach/email.ts` |
| Celý rozbor a jeho odeslání | `~/Weblyx/lib/outreach/report.ts` |
| Odhlášení, podpis odkazů | `~/Weblyx/lib/outreach/unsubscribe.ts` |
| API rozesílky | `~/Weblyx/app/api/lead-generation/outreach/route.ts` |
| Stránka adminu | `~/Weblyx/app/admin/lead-generation/page.tsx` |
| Veřejné stránky | `~/Weblyx/app/odhlasit`, `~/Weblyx/app/rozbor` |
