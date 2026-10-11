# Design

Klidný, nadčasový, jednoduchý. Jeden akcent, žádné gradienty, stíny jen výjimečně, žádné emoji.

## Přesná předloha

Ve složce `docs/design-predloha/` je 8 obrazovek jako HTML s inline styly. Jsou to **závazné předlohy vzhledu**: rozměry, odstupy, barvy, velikosti písma, texty a pořadí prvků převezmi přesně. Nejde o kód k zkopírování: hlavička `support.js`, značky `<x-dc>`, `<sc-for>`, `<sc-if>` a `{{…}}` patří nástroji, ve kterém návrh vznikl. Jména firem a čísla jsou ukázková data.

| Soubor | Obrazovka |
| --- | --- |
| `01-mobil-fronta.html` | Fronta „Volat teď“ (mobil) |
| `02-mobil-karta-leadu.html` | Karta leadu (mobil) |
| `03-mobil-zapis-vysledku.html` | Zápis výsledku hovoru včetně „?“ a odložení (mobil) |
| `04-mobil-napoveda.html` | Nápověda „?“ – co zvolit po hovoru (spodní panel) |
| `05-mobil-pruvodce.html` | Průvodce prvním přihlášením, 4 kroky |
| `06-tablet.html` | Operátor na tabletu – fronta + karta se zápisem |
| `07-pocitac.html` | Operátor na počítači – 3 sloupce, klávesy 1–8 |
| `08-report-majitele.html` | Denní report majitele |

## Barvy (Tailwind theme tokens)

| Token | Hex | Použití |
| --- | --- | --- |
| `bg` | `#F6F5F1` | pozadí aplikace |
| `surface` | `#FDFDFB` | karty, panely, lišty |
| `line` | `#E4E2DC` | okraje a oddělovače |
| `line-strong` | `#C9C6BE` | okraje vstupů a sekundárních tlačítek |
| `track` | `#ECEAE4` | pozadí progress barů, štítky |
| `ink` | `#16181D` | hlavní text |
| `muted` | `#5E6168` | popisky, sekundární text |
| `accent` | `#2449C9` | hlavní akce (Zavolat, Uložit), vybraný stav, priorita, aktivní záložka |
| `accent-tint` | `#E8ECFA` | pozadí vybraného stavu a háčku |
| `accent-ink` | `#1B3699` | text na `accent-tint` |
| `accent-deep` | `#12245F` | hlavní text na `accent-tint` |
| `urgent` | `#A3410E` | štítek zpoždění, „pod cílem“ |
| `urgent-tint` | `#FBEDE4` | pozadí propadlých callbacků a výsledku Nemá zájem |
| `urgent-ink` | `#7A3410` | text na `urgent-tint` |

## Písmo

- IBM Plex Sans (400, 500, 600) pro vše.
- IBM Plex Mono (500) pro čísla, časy, počítadla a klávesové zkratky.
- Nadpis obrazovky 24–28 px / 600, nadpisy sekcí 12 px / 600 velkými písmeny s prostrkáním 0,06 em, text 15–16 px, popisky 13 px.
- Zaoblení: karty 14–16 px, tlačítka 12–14 px, štítky 8 px, pill tlačítka plně kulatá.

## Rozložení podle zařízení

Jedna aplikace, tři breakpointy. Stejná data a akce, liší se jen uspořádání.

**Mobil (< 768 px)** – tři obrazovky za sebou:
1. Fronta „Volat teď“: přepínač projektu, karta směny (hovory tuto hodinu / cíl, progress), skupiny Propadlé · Nové · Dnes, spodní navigace Fronta / Úkoly / Kalendář / Výkon.
2. Karta leadu: název, obor, město, kontakt, velké tlačítko Zavolat (`tel:` odkaz), karta Háček (+ zdroj), První věta, mřížka údajů (fáze, priorita, zdroj čísla, kdy berou), historie, dole „Zapsat výsledek hovoru“.
3. Zápis výsledku: otevře se po návratu z hovoru. Výsledky ve 3 skupinách (Zájem 3 · Zkusit znovu 3 · Konec 2), pod nimi text „co se stane“ a jen jeden povinný vstup podle výsledku, dole mikrofon (hlasová poznámka) + „Uložit a další lead“.

**Tablet (768–1279 px)** – dva sloupce: vlevo fronta (380 px) se směnou, vpravo karta leadu a pod ní zápis výsledku (mřížka 4 × 2) na jedné obrazovce.

**Počítač (≥ 1280 px)** – horní lišta (projekt, navigace, počítadlo, pauza), tři sloupce: fronta (max 360 px) · karta leadu s kartami námitek · zápis výsledku (max 400 px). Klávesy 1–8 zvolí výsledek, Enter uloží a otevře další lead.

**Report majitele** – stránka: titulek s hlavním číslem dne, řada KPI dlaždic, důvody ztráty (vodorovné pruhy), doporučení na zítra (tmavý panel), tabulka operátorů, trychtýř.

## Detaily

- Propadlý callback: `urgent-tint` pozadí + štítek „−52 min“ v `urgent`.
- Priorita: plná tečka `accent` = vysoká, prázdný kroužek = běžná.
- Vybraný výsledek: okraj 1,5 px `accent` + `accent-tint`; u skupiny Konec `urgent` varianta.
- Výsledek Jindy: řada rychlých voleb (za 2 h · zítra 9:00 · za týden · za měsíc · za 3 měsíce · vlastní…), u odložení o 7+ dní se objeví pole Důvod. Vrácený lead má na kartě štítek „Odloženo“ s datem a důvodem.
- Barva nikdy nenese význam sama, vždy i text („Vysoká priorita“, „pod cílem“).
