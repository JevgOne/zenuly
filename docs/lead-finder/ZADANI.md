# Zadání: vyhledávání firem v CRM, přesně podle zkoušky

Postav v CRM (zenuly.cz) vyhledávání a ověřování firem tak, aby dávalo stejné výsledky jako zkouška ve složce `~/lead-finder`, a aby šlo kdykoli spustit znovu po krajích.

Než začneš, přečti si:
1. `~/lead-finder/SYSTEM.md`: celý systém, pravidla a důvody. Tohle zadání z něj vychází a nic z něj neruší.
2. `~/lead-finder/crm-pipeline/osm.ts`, `inspect.ts`, `categories.ts`: hotové moduly (TypeScript, bez závislostí). Převezmi je, neopisuj je z hlavy.
3. `~/lead-finder/kvalita.mjs`: ověření v rejstříku, dohledání webu, známka, důvod hovoru, věty pro operátora. Logiku převeď do CRM beze změny pravidel.

Kde se zadání a `SYSTEM.md` liší od toho, co v CRM už je, platí tyto dva dokumenty. Kde si nejsi jistý, zeptej se, nedomýšlej.

## 1. Co má jít spustit

Jedno hledání = projekt + oblast + sada oborů.

- **Oblast:** obec, okres nebo kraj podle názvu v OpenStreetMap; jde zadat víc najednou.
- **„Celá ČR“:** tlačítko, které zařadí všech 14 krajů za sebe. Kraje se zpracují postupně, ne souběžně.
- **Opakované spuštění:** stejné hledání jde pustit znovu. Firmy, které už v databázi jsou, se nehledají ani neprověřují podruhé, pokud je jejich ověření mladší 6 měsíců. Po změně pravidel musí jít vynutit nové vyhodnocení už nalezených firem bez nového stahování z mapy.

Kraje, přesně takto pojmenované (název v OSM → tvar do textu):

| Název v OSM | „kde“ |
|---|---|
| Praha | v Praze |
| Středočeský kraj | ve Středočeském kraji |
| Jihočeský kraj | v Jihočeském kraji |
| Plzeňský kraj | v Plzeňském kraji |
| Karlovarský kraj | v Karlovarském kraji |
| Ústecký kraj | v Ústeckém kraji |
| Liberecký kraj | v Libereckém kraji |
| Královéhradecký kraj | v Královéhradeckém kraji |
| Pardubický kraj | v Pardubickém kraji |
| Kraj Vysočina | na Vysočině |
| Jihomoravský kraj | v Jihomoravském kraji |
| Olomoucký kraj | v Olomouckém kraji |
| Zlínský kraj | ve Zlínském kraji |
| Moravskoslezský kraj | v Moravskoslezském kraji |

## 2. Obory

Výchozí sada „všechno“ je těchto 35 značek OSM. Uživatel si z nich může vybrat jen část.

- všechny obchody a služby s provozovnou: `shop=*` (patří sem i kadeřnictví, kosmetika, nehty, masáže, tetování, autoservisy, pneuservisy)
- všechna řemesla: `craft=*` (stavební firmy, instalatéři, elektrikáři, úklid…)
- všechny kanceláře: `office=*` (advokáti, notáři, účetní, realitky, pojišťovny, architekti, IT…)
- zdravotní služby: `healthcare=*`
- `amenity=` restaurant, cafe, pub, bar, fast_food, dentist, doctors, veterinary, clinic, driving_school, childcare, language_school, music_school, dancing_school, car_wash, car_rental, events_venue, studio
- `tourism=` hotel, guest_house, apartment, chalet, camp_site, hostel
- `leisure=` fitness_centre, sports_centre, dance, sauna, horse_riding, bowling_alley, escape_game

Hledání „všeho, co má v mapě web“ bez omezení oborem nedělat: ve zkoušce vracelo sběrné dvory, horolezecké cesty a obecní úřady.

## 3. Dotazy na mapu

Dotaz a vyřazování převezmi z `osm.ts`. Časy a počet opakování nastav podle hodnot níže; `osm.ts` je má kratší (50 s, 3 pokusy) a na celý kraj to nestačí:

- oblast: `area["name"="<název>"]["boundary"="administrative"]`
- pro každou značku dva filtry: objekt má `website`, nebo má `contact:website`
- **nejvýš 4 značky na jeden dotaz**; celý kraj se všemi obory najednou server nevrátí
- časový limit dotazu 150 s; při chybě (typicky 504) opakovat až 10× s pauzou 20 s
- dotazy posílat po jednom, nikdy souběžně; server je veřejná služba
- **dávka, která neprošla ani po opakování, se nesmí ztratit:** zapíše se jako nedokončená a zkusí se znovu později. Ve zkoušce takhle napoprvé vypadly pražské restaurace a kavárny, tedy největší skupina, a přišlo se na to jen náhodou.
- u hledání ukazovat, kolik dávek je hotových, kolik čeká a kolik selhalo

Hned po stažení vyřadit (funkce `notACustomer` v `osm.ts`): objekty se značkou řetězce, školy, úřady, kostely, nemocnice, banky, památky, muzea, spolky, politické strany.

Duplicity: jedna doména = jedna firma, napříč obory, kraji i projekty.

## 4. Zpracování jedné firmy

Pořadí je závazné. Každý krok je v `SYSTEM.md` popsaný podrobně; tady jen co přesně převzít.

| # | Krok | Odkud převzít |
|---|---|---|
| 1 | Načíst web: úvodní stránka, rozbalení rámů a přesměrování, až 4 kontaktní stránky, pak až 8 dalších stránek menu, dokud se nenajde telefon; u stránek kreslených skriptem prohledat skripty | `inspectSite` v `inspect.ts` |
| 2 | Stav webu: nemá / nefunguje / zástupná stránka / ve výstavbě / firma skončila / nelze ověřit / zanedbaný / používaný, vždy s důvody | tamtéž |
| 3 | Když web chybí nebo nefunguje: zkusit doménu e-mailu, pak adresy složené z názvu firmy (přijmout jen při shodě telefonu nebo e-mailu) | `findWebsite` v `kvalita.mjs` |
| 4 | Telefony: všechny zdroje v pořadí podle `SYSTEM.md` 3.4, jednotný tvar, nejvýš 3, příznak mobilu a „uvedeno na webu“ | `extractPhones`, `normalizePhone` |
| 5 | E-mail: vlastní doména před freemailem, doména musí mít MX záznam, uložit typ adresy | `verify` v `kvalita.mjs` |
| 6 | Odkazy na sítě, mapu, rezervace | `extractLinks` |
| 7 | IČO z webu (s kontrolní číslicí) a ověření v ARES; záznam se počítá jen při shodě názvu, ulice nebo příjmení | `extractIco`, `ares`, `matchesRegister` |
| 8 | Bodování zastaralosti webu | `datedness` v `inspect.ts` |
| 9 | Důvod hovoru a věty „o čem mluvit“ | `callReason`, `talkingPoints` |
| 10 | Známka A / B / T / N / C / X | `verify` |

Do CRM se zakládají jen známky A a B. Ostatní firmy zůstanou v databázi se známkou a důvodem, aby se při příštím hledání nezpracovávaly znovu a aby bylo vidět, proč neprošly.

Rychlost a ohleduplnost:
- weby načítat nejvýš 12 souběžně, časový limit 12 s na úvodní stránku a 8 s na další;
- ARES po jednom dotazu s odstupem 400 ms; když ARES přístup omezí, pokračovat bez něj a firmy označit „neověřeno“;
- Google Mapy jsou vypnuté (viz 6).

Protože zpracování jedné firmy trvá několik sekund a kraj má tisíce firem, musí běžet na pozadí po malých dávkách a jít kdykoli přerušit a navázat. Žádný krok nesmí záviset na tom, že má uživatel otevřenou stránku.

## 5. Kvalifikace pro projekt Weblyx

Lead vznikne, když platí aspoň jedno:
- firma nemá vlastní web,
- web nefunguje, je zaparkovaný nebo ve výstavbě,
- web má aspoň 3 body zastaralosti.

A zároveň má firma známku A nebo B a systém umí říct důvod hovoru jednou větou. Živá firma s webem, kterému není co vytknout, dostane známku N a lead z ní nevznikne.

Pro další projekty (úklidová firma) se kvalifikace nastaví zvlášť; kroky 1–7 jsou společné a dělají se pro firmu jen jednou.

## 6. Co se nedělá

- Žádné ruční dohledávání telefonů. Firma bez telefonu se nezakládá.
- Žádné Google Mapy, dokud se nezapnou platby u Googlu. Krok je v `kvalita.mjs` připravený a bez klíče se přeskočí; v CRM ho postav stejně: vypnutý, zapínatelný doplněním klíče, se stropem dotazů.
- Žádné stahování z Firmy.cz ani přímo z Google Map.
- Žádné hádání e-mailových adres.
- Nic se neodesílá bez potvrzení; každý e-mail má odhlášení (`SYSTEM.md`, kapitola 4).
- Nestavět do administrace Weblyx; patří to do víceprojektového CRM.

## 7. Podle čeho poznat, že to funguje stejně

**Jednotlivé weby** (stav k 8. 10. 2026; weby se mění, při neshodě nejdřív ověř, jestli se nezměnil web):

| Web | Co má vyjít |
|---|---|
| `pneupokr.com` | zanedbaný; tři telefony včetně +420 321 728 308; důvod hovoru „web se na telefonu nepřizpůsobí displeji…“ |
| `vhdevon.cz` | telefon +420 724 218 963, nalezený až na stránce Kontakty (odkaz vede na variantu s `www`) |
| `bike-hotel.cz` | telefon +420 606 042 989, nalezený až průchodem menu |
| `pensionbaron.cz` | telefon +420 605 016 837, nalezený až po přesměrování skriptem |
| `prima-outdoor.cz` | „firma skončila“, vyřazeno |
| `nafojtstvi.cz`, `cukrarnaubabicky.cz` | zástupná stránka (parkovací stránka v rámu), ne „používaný“ |
| `bitclub.cz` | nefunguje (doména neexistuje) |
| `elsaco.cz` | IČO z webu sedí s firmou ulicí; v rejstříku aktivní od 1992; kontaktní osoba z rejstříku |

**Kolín, 66 firem ze souboru `kolin.csv`:** A 30, B 14, bez důvodu k hovoru 2, vyřazeno 20. Odchylka o pár firem je v pořádku, weby se mění.

**Kraje.** Co dal první sběr (starší pravidla, práh 3 body, bez ověření kvality). Slouží jako řádový odhad; nový běh má najít podobný počet firem v mapě, výsledný počet leadů bude po ověření kvality nižší.

| Oblast | Prověřených webů | Zastaralých nebo nefunkčních | Z toho s e-mailem |
|---|---|---|---|
| Praha | 6 417 | 1 886 | 1 039 |
| Středočeský kraj | 2 668 | 868 | 505 |
| Jihomoravský kraj | 3 686 | 1 129 | 791 |
| Jihočeský kraj | 1 656 | 599 | 411 |
| Moravskoslezský kraj | 1 733 | 702 | 460 |
| Pardubický kraj | 1 211 | 362 | 270 |
| Plzeňský kraj | 1 075 | 381 | 255 |
| Královéhradecký kraj | 1 049 | 380 | 216 |
| Olomoucký kraj | 913 | 335 | 221 |
| Zlínský kraj | 893 | 306 | 220 |
| Liberecký kraj | 879 | 318 | 189 |
| Ústecký kraj | 647 | 222 | 140 |
| Kraj Vysočina, Karlovarský kraj | sběr nedoběhl | | |

Čísla u Prahy a Středočeského kraje jsou součtem několika běhů s překrývajícími se obory, takže obsahují duplicity. V krajském běhu navíc dvě dávky selhaly a nikdo je nezopakoval, proto jsou některá čísla spodní odhad. Přesně tohle má nové hledání ošetřit (bod 3).

## 8. Co odevzdat

1. Hledání podle bodů 1–3 s viditelným průběhem po krajích a dávkách.
2. Zpracování firmy podle bodu 4, běžící na pozadí, s možností navázat.
3. Kartu firmy podle `SYSTEM.md` 3.8, včetně „proč voláme“ a „o čem mluvit“.
4. Přehled, kolik firem kterým krokem prošlo a kolik kde vypadlo, po krajích.
5. Test, který projde weby z bodu 7 a ohlásí rozdíly.
6. Krátký zápis, co se oproti zadání nepovedlo nebo udělalo jinak a proč.

Před nasazením na produkci a před prvním ostrým hledáním přes celou republiku se zeptej.
