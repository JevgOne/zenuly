# Systém na získávání a oslovování firem: jak má fungovat

Zadání pro stavbu v CRM (zenuly.cz). Popisuje celý systém od zadání hledání po výsledek hovoru: co se děje, v jakém pořadí, podle jakých pravidel, jaká data se drží a kolik to stojí. Stav k 8. 10. 2026.

Tento dokument nahrazuje dřívější `PIPELINE.md`.

## 1. Zásady

1. **Kvalita, ne počet.** Do CRM jde jen firma, u které je doložené, že žije, a ke které je ověřený kontakt. Tisíce neověřených kontaktů cílem nejsou.
2. **Telefon je povinný.** Hledá se všemi automatickými cestami; firma bez telefonu se do CRM nedostane. Ručně se nic nedohledává.
3. **Každý hovor má důvod.** Lead vzniká jen tehdy, když systém umí jednou větou říct, proč firmě voláme („web se na telefonu nepřizpůsobí displeji“, „vlastní web nemají“). Živá firma s webem, na kterém není co vytknout, se nezakládá.
4. **Obchodník musí vědět, komu volá.** Karta firmy říká, kdo firmu vede, čím se zabývá, v jakém stavu má web a proč ji oslovujeme.
5. **Každý e-mail má odhlášení.** Bez výjimky, včetně zkušebních a následných zpráv.
6. **Každý projekt mluví za sebe.** Vlastní odesílací adresa, vlastní nabídka, vlastní texty, vlastní seznam odhlášených.
7. **Nic neodejde bez potvrzení.** Výchozí je vždy náhled.

## 2. Projekty

CRM obsluhuje víc projektů najednou, například Weblyx (weby) a úklidovou firmu. Projekty sdílejí databázi firem a ověřovací část; všechno ostatní má každý své.

| Co | Sdílené | Vlastní pro každý projekt |
|---|---|---|
| databáze firem a jejich ověření (web, telefon, rejstřík) | ano | |
| odesílací adresa, jméno odesílatele, adresa pro odpovědi, podpis | | ano |
| ověřená doména a klíč u poskytovatele e-mailů | | ano |
| komu se nabízí (obory, oblasti) | | ano |
| proč firmu oslovit (kvalifikace) | | ano |
| texty e-mailů a scénář hovoru | | ano |
| seznam odhlášených | | ano, plus jeden společný „nikdy nekontaktovat“ |
| stav leadu, historie oslovení, výsledky | | ano |

**Nastavení projektu (povinné před prvním odesláním):**
- název a kdo za ním stojí (firma, IČO, kontakt: tyhle údaje jdou do patičky e-mailu),
- odesílatel ve tvaru `Jméno <adresa@doména-projektu.cz>` a adresa pro odpovědi; `noreply` se nepřipouští,
- ověřená doména u poskytovatele e-mailů; dokud není ověřená, projekt nemůže odesílat,
- podpis,
- cílové obory a oblasti,
- kvalifikační pravidlo (viz 3.6),
- šablony e-mailu a scénář hovoru,
- denní strop odeslaných e-mailů.

**Proč oddělené adresy a domény:** stížnosti na jednu nabídku nesmí zhoršit doručitelnost druhého projektu ani běžné pošty firmy.

**Jedna firma, víc projektů:** stejnou firmu smí oslovit víc projektů, ale ne ve stejném týdnu. Systém hlídá odstup mezi osloveními napříč projekty (výchozí 14 dní).

## 3. Tok krok za krokem

```
Zadání hledání → Vyhledání firem → Prověření webu → Kontakty (telefon povinný)
   → Ověření firmy v rejstříku → Kvalifikace pro projekt → Známka A/B
   → Karta v CRM → Oslovení e-mailem / telefonem → Výsledek a další krok
```

Kroky 3.2–3.5 se dělají jednou pro firmu a platí pro všechny projekty. Kroky od 3.6 jsou pro každý projekt zvlášť.

### 3.1 Zadání hledání

Uživatel vybere projekt, oblast (obec, okres, kraj; jde víc najednou) a obory. Systém ukáže odhad, kolik firem to přinese, a spustí hledání na pozadí. Hledání má stav (běží, hotovo, chyba) a jde spustit znovu; už známé firmy se přeskočí.

### 3.2 Vyhledání firem

Zdroj: OpenStreetMap. Ze zdroje se bere název, obor, web, telefon, e-mail, adresa a profily na sítích.

- Dotazy po dávkách nejvýš 4 oborů; při chybě serveru opakovat až 10× s pauzou 20 s.
- Hned vyřadit: pobočky řetězců, školy, úřady, kostely, nemocnice, banky, památky, muzea, spolky, politické strany.
- Jedna doména = jedna firma.
- Obor uložit jako samostatné pole.

### 3.3 Prověření webu

Hledání na webu je důkladné, ne jen úvodní stránka:

1. Úvodní stránka (https, při chybě http).
2. Když je to jen „obálka“ (přesměrování, rámy, jeden celostránkový iframe), jde se o krok dál na skutečný obsah. Staré weby jsou takhle postavené často.
3. Až 4 stránky s kontaktem (kontakt, o nás, provozovna, rezervace; když odkaz chybí, zkusí `/kontakt` a `/kontakty`).
4. Když se telefon pořád nenašel, projde se zbytek menu (až 8 dalších stránek), dokud se číslo neobjeví.
5. Když je stránka vykreslená skriptem a nemá čitelný text, prohledají se soubory skriptů.

**Když web chybí nebo nefunguje, hledá se jinde.** Bez webu není rozbor a bez rozboru není o čem mluvit, proto se firma neodepisuje hned:

| Pořadí | Kde se web hledá | Kdy se přijme |
|---|---|---|
| 1 | doména e-mailu: `info@drsonestudio.cz` → `drsonestudio.cz` | vždy, když doména funguje (ne u seznam.cz, gmail.com apod.) |
| 2 | adresa složená z názvu firmy (`studiodaniela.cz`, `studio-daniela.cz`, i `.com` a `.eu`) | jen když je na nalezeném webu telefon nebo e-mail, který o firmě už známe; jinak by prošel cizí web se stejným jménem |
| 3 | profil firmy v Google Mapách (Places API) | když se shoduje název a adresa |

Změřeno na 120 firmách bez webu nebo s nefunkčním webem: krok 1 našel web u jedné, krok 2 u žádné. Většina těchto firem (hlavně salony) píše z freemailu a web opravdu nemá, nebo ho má jinde, než by napovídal název. Bez kroku 3 u nich není web a zároveň není čím doložit, že firma žije; proto 115 ze 120 neprošlo. Tyhle firmy pokrývají až Google Mapy.

| Stav | Jak se pozná |
|---|---|
| nemá web | web chybí, nebo je to jen profil na Facebooku, Instagramu, Firmy.cz |
| nefunguje | doména neexistuje, chyba 404/5xx |
| zástupná stránka | text registrátora nebo hostingu, „doména na prodej“, prázdná stránka, parkovací stránka schovaná v rámu |
| ve výstavbě | „připravujeme“, „coming soon“ a skoro žádný obsah |
| firma skončila | web sám píše „provoz ukončen“, „trvale zavřeno“ apod.; vyřazuje se vždy |
| nelze ověřit | server robota odmítl nebo neodpověděl; zkusit později |
| zanedbaný | funguje, ale bez známky nedávné péče |
| používaný | aspoň jedna známka péče |

Známky péče: letošní nebo loňský rok v patičce, datovaný obsah z posledního roku, stránka upravená v posledním roce, měřicí kódy (Analytics, Tag Manager, Sklik, Meta pixel), online rezervace.

Sbírané odkazy (od každého typu první): Facebook, Instagram, LinkedIn, YouTube, TikTok, X, WhatsApp, mapa, rezervační systém, profil na Firmy.cz, TripAdvisor.

### 3.4 Kontakty

**Telefon se hledá postupně, dokud se nenajde:**

| Pořadí | Zdroj | Cena |
|---|---|---|
| 1 | údaj ze zdroje firem | zdarma |
| 2 | odkazy k vytočení na webu (`tel:`, WhatsApp) | zdarma |
| 3 | strukturovaná data webu (`telephone`) | zdarma |
| 4 | čísla za slovem tel, telefon, mobil, volejte: v jakémkoli zápisu | zdarma |
| 5 | čísla zapsaná jako telefon: s +420, ve skupinách, nebo devět číslic začínajících 6 nebo 7 | zdarma |
| 6 | další stránky webu, rámy, přesměrování, skripty (viz 3.3) | zdarma |
| 7 | web odvozený z domény e-mailu | zdarma |
| 8 | profil firmy v Google Mapách podle názvu a adresy (Google Places API) | 1 000 dotazů měsíčně zdarma, pak asi 35 USD / 1 000 |

Ruční dohledávání se nedělá. Firma, u které číslo nenajde žádný krok, se do CRM nedostane.

Čísla za lomítkem (účty) a osmimístná čísla (IČO) se neberou. Vše se převádí na tvar `+420 xxx xxx xxx`, ukládají se nejvýš 3. U čísla se drží, odkud je, jestli je to mobil a jestli je uvedené přímo na webu firmy.

Změřeno na 107 firmách, které dřív zůstaly bez telefonu: kroky 2–7 najdou číslo u 84 (79 %). Ze zbylých 23 je 10 zaparkovaných nebo zavřených webů, tedy firem, které do CRM stejně nepatří; u ostatních telefon na webu buď není, nebo je web vykreslený tak, že ho bez prohlížeče nejde přečíst.

**Google Mapy (krok 8) jsou zatím odložené.** Vyžadují zapnuté platby u Googlu a rozhodnutí z 8. 10. 2026 je začít bez nich: kontaktů, které se najdou zdarma, je pro začátek dost. Krok je připravený a vypnutý; zapne se doplněním klíče. Až se zapne, používá se jen v nouzi, tedy když bezplatné kroky nestačí:

| Kdy se dotaz pošle | Co z profilu vezmeme |
|---|---|
| firma nemá funkční web | web z profilu; prověří se jako každý jiný a udělá se z něj rozbor |
| nenašel se žádný telefon | telefon z profilu |
| nic nedokládá, že firma žije | stav provozovny: otevřeno / dočasně zavřeno / trvale zavřeno |

K tomu vždy hodnocení a počet recenzí, otevírací doba (kdy volat) a odkaz na profil. „Trvale zavřeno“ firmu vyřazuje. Profil se přijme jen tehdy, když sedí názvem a zároveň ulicí, městem nebo telefonem; samotné „kadeřnictví“ v názvu nestačí.

Na jednu firmu jde nejvýš jeden dotaz a každý běh má strop (výchozí 100), takže se provoz drží v bezplatných 1 000 dotazech měsíčně. V Google Cloud se navíc nastaví denní kvóta, aby účet nemohl nic naúčtovat ani omylem. Když Google dotaz odmítne (špatný klíč, vyčerpaná kvóta), systém pokračuje bez Google Map a firmy vyhodnotí podle ostatních zdrojů.

Dokud je krok vypnutý, firmy bez funkčního webu a bez jiného dokladu života se nezakládají. Stav: krok je naprogramovaný, ale proti skutečnému Googlu zatím nevyzkoušený. Klíč, který má Weblyx (`GOOGLE_PLACES_API_KEY`), Google odmítá, protože jeho projekt nemá zapnuté platby. Strojové stahování přímo z Google Map (bez API) je proti podmínkám Googlu a nepoužívá se.

**E-mail:** ze zdroje a z webu, včetně skrytých zápisů (`(at)`, HTML entity, ochrana Cloudflare). Nehádat `info@doména`. Pořadí: adresa na vlastní doméně firmy, pak freemail. Doména musí přijímat poštu (MX záznam). U freemailu (seznam.cz, gmail.com…) doména projde vždy, konkrétní schránku tak ověřit nejde; typ adresy se ukládá. E-mail je nepovinný.

### 3.5 Ověření firmy v rejstříku

Z webu se vytáhne IČO (kontroluje se kontrolní číslice) a ověří v ARES: právní název, sídlo, rok vzniku, stav (aktivní / zaniklá), jednatelé; u živnostníka je názvem přímo jméno podnikatele.

- Zaniklá firma se vyřazuje vždy.
- V patičce webu bývá i IČO tvůrce webu. Záznam se počítá jen tehdy, když s firmou sedí názvem, ulicí, nebo příjmením v e-mailu či doméně. Jinak se označí „IČO na webu nesedí s firmou“.
- IČO je na webu u necelé třetiny firem. Kde chybí, ověření stojí na webu a kontaktech.

### 3.6 Kvalifikace pro projekt

Odpovídá na otázku „proč zrovna tuhle firmu oslovit s touhle nabídkou“. Každý projekt má vlastní pravidlo a z něj vzniká i věta do e-mailu a do scénáře hovoru.

**Weblyx (weby):** firma nemá web, web nefunguje, nebo je zastaralý.

| Znak zastaralosti | Body |
|---|---|
| není přizpůsobený mobilům | 3 |
| Flash | 3 |
| bez HTTPS | 2 |
| rok v patičce 3 a více let starý | 2 |
| starý WordPress (pod 6) nebo Joomla 1–2 | 2 |
| zastaralé HTML (`font`, `center`, `frameset`) | 2 |
| jQuery 1.x | 1 |
| rozvržení v tabulkách | 1 |
| chybí náhled pro sdílení | 1 |
| soubor neměněný 3 a více let | 1 |

Práh 3 body. Nad prahem se pustí plný rozbor (analyzátor Weblyx: skóre 0–100, 17 kontrol) a e-mail jmenuje dvě až tři konkrétní věci. Firma bez webu nebo s nefunkčním webem rozbor přeskakuje.

**Úklidová firma (příklad jiného projektu):** kvalifikace nestojí na webu, ale na typu provozovny a oblasti: kanceláře, ordinace, restaurace, hotely, fitness, obchody v dojezdu. Web se použije jen k ověření, že firma žije, a ke kontaktům. Přesné pravidlo je potřeba s majitelem projektu doladit.

Firma, která kvalifikací neprojde, zůstane ve sdílené databázi, ale lead v projektu z ní nevznikne.

### 3.7 Známka

| Známka | Podmínka | Kam jde |
|---|---|---|
| A | telefon + doložený život (rejstřík nebo používaný web) + ještě jedno potvrzení (číslo uvedené na webu firmy, nebo e-mail s funkční doménou) | do CRM, volat a psát jako první |
| B | telefon + aspoň jeden doklad života nebo fungující zanedbaný web | do CRM |
| T | chybí telefon, jinak v pořádku | nezakládá se; zkusí se znovu při příštím ověření |
| C | bez dokladu života nebo bez kontaktu | vyřazeno |
| N | živá firma s kontaktem, ale bez důvodu k hovoru (web je v pořádku) | nezakládá se v tomto projektu |
| X | v rejstříku zaniklá, nebo web píše, že firma skončila | vyřazeno |

Zkouška na Kolíně (66 dříve nasbíraných firem): A 30, B 14, vyřazeno 22; aktivní firma v rejstříku potvrzena u 15, vždy i se jménem osoby.

### 3.8 Karta firmy v CRM

Co obchodník vidí, než zvedne telefon:

- název, právní název, IČO, rok vzniku, **kontaktní osoba**,
- obor, oblast, adresa,
- **telefony** (mobil označený, zdroj čísla),
- e-mail a jeho typ,
- web, jeho stav a doklady života („v rejstříku aktivní od 1992“, „obsah datovaný 2026“),
- odkazy na sítě, mapu, rezervace,
- **proč voláme**: jedna věta, hlavní důvod hovoru,
- **o čem mluvit**: tři až šest vět, které jdou říct do telefonu, složených z toho, co se o firmě zjistilo. Operátor musí mít čím začít:
  - „mají web pneupokr.com“
  - „web se na telefonu nepřizpůsobí displeji, návštěvník musí zvětšovat a posouvat“
  - „web neběží na zabezpečeném spojení, prohlížeč u něj ukazuje Nezabezpečeno“
  - „stránka se naposledy měnila v roce 2023“
  - „o web se starají, takže ho berou vážně“ / „jsou na Instagramu“ / „berou rezervace online“
  - „firma funguje od roku 1992“
  
  U firmy bez webu: „vlastní web nemají, jen profil na Facebooku“. Každá věta vychází z konkrétního nálezu, nic se nedomýšlí.
- známka,
- připravený e-mail a scénář hovoru,
- historie: co kdy odešlo, co kdo řekl, další krok.

### 3.9 Oslovení e-mailem

- Odchází z adresy projektu, s podpisem a údaji o tom, kdo píše.
- Prostý osobní text, ne grafická šablona.
- Dávky nejvýš 20 e-mailů, pauza 1,5 s, denní strop podle nastavení projektu.
- Před odesláním náhled dávky a prvního e-mailu; ostré odeslání až po potvrzení.
- Zkušební e-mail na vlastní adresu se do evidence nezapisuje.
- Jedna firma dostane v projektu první e-mail jen jednou.
- Před každým odesláním kontrola seznamu odhlášených.

### 3.10 Oslovení telefonem

Volací seznam je seřazený: známka A, mobil, pak ostatní. Po hovoru obchodník vybere výsledek jedním klepnutím:

| Výsledek | Co se stane |
|---|---|
| nezvedá | zařadí se znovu, nejvýš 3 pokusy v různé dny a časy |
| zájem | stav „zájem“, naplánuje se další krok (nabídka, schůzka) |
| zavolat později | připomínka na zadaný den |
| nemá zájem | uzavřeno, znovu nejdřív za zadanou dobu |
| nechce být kontaktován | zápis do seznamu odhlášených, i pro e-mail |
| špatné číslo | číslo se označí jako neplatné; když firma jiné nemá, vyřadí se z volání |
| firma nefunguje | vyřazeno, zapíše se do sdílené databáze pro všechny projekty |

### 3.11 Po oslovení

- Odpověď na e-mail přijde do schránky projektu; v CRM se k firmě zapíše ručně nebo napojením schránky.
- Kliknutí na „pošlete mi rozbor“ (Weblyx) odešle celý rozbor automaticky.
- Vrácený e-mail (nedoručitelný) označí adresu jako neplatnou a firma zůstane jen na telefon.
- Následný e-mail nejdřív po 5 pracovních dnech, nejvýš jeden, opět s odhlášením.

## 4. Odhlášení

Platí pro každý e-mail každého projektu.

- **V těle zprávy:** viditelná věta s odkazem, například „Nechcete od nás další nabídky? Odhlaste se jedním klepnutím.“ Bez přihlašování, bez formuláře.
- **V hlavičce zprávy:** `List-Unsubscribe` a `List-Unsubscribe-Post`, aby se dalo odhlásit tlačítkem přímo v Gmailu nebo Seznamu.
- **Odpovědí:** kdo odpoví, že nechce, je odhlášen ručně jedním klepnutím v CRM.
- **Po telefonu:** výsledek „nechce být kontaktován“.

Co odhlášení znamená:
- Platí okamžitě a natrvalo, pro e-mail i telefon.
- Platí pro projekt, ze kterého zpráva přišla. Stránka odhlášení nabídne i „nechci žádné nabídky“; to zapíše firmu do společného seznamu pro všechny projekty.
- Odhlášená adresa se znovu nezaloží ani po smazání leadu a ani při novém hledání nebo importu.
- Odkaz je podepsaný, aby nešel zneužít k odhlášení cizí adresy; zkušební e-mail nese odkaz pro zkušební adresu, ne pro firmu.
- E-mail bez odhlášení systém neodešle: kontroluje se při sestavení zprávy, ne v šabloně.

## 5. Stavy

**Firma ve sdílené databázi:** nalezená → prověřená → ověřená (známka A/B) / bez telefonu (T) / vyřazená (C, X). Ověření se obnovuje po 6 měsících.

**Lead v projektu:** nový → připravený (text a scénář hotové) → oslovený e-mailem / volaný → zájem / zavolat později / bez zájmu / odhlášený / neplatný kontakt → zákazník.

## 6. Data

| Tabulka | Co drží |
|---|---|
| projekty | nastavení z kapitoly 2 |
| hledání | projekt, oblast, obory, stav, počty |
| firmy | sdílené: název, obor, adresa, web, stav webu, doklady života, odkazy, IČO, právní název, kontaktní osoba, stav v rejstříku, známka, zdroj a datum nalezení, datum ověření |
| kontakty | telefony a e-maily firmy: hodnota, typ, zdroj, ověření, platnost |
| leady | firma × projekt: kvalifikace a její důvody, stav, připravený e-mail, scénář, další krok |
| aktivity | každý e-mail, hovor a poznámka: kdy, kdo, výsledek |
| odhlášení | adresa nebo telefon, projekt nebo „všechny“, kdy, jak |

Duplicity: firma podle domény, jinak podle názvu a telefonu. Kontakt podle hodnoty.

## 7. Obrazovky

1. **Projekty:** seznam a nastavení, stav ověření domény.
2. **Hledání:** zadání, běžící a hotová hledání, kolik firem prošlo jakým krokem.
3. **Ke kontrole:** nově ověřené firmy se známkou, hromadné přijetí nebo vyřazení.
4. **Karta firmy:** kapitola 3.8.
5. **Rozesílka:** fronta, náhled dávky, zkouška, odeslání.
6. **Volací seznam:** kapitola 3.10.
7. **Odhlášení:** seznam, ruční přidání.
8. **Přehled:** čísla z kapitoly 8.

## 8. Co měřit

Pro každý projekt a hledání: nalezeno firem → prošlo prověřením → s telefonem → známka A / B → osloveno e-mailem → doručeno → odpověď → odhlášení → voláno → dovoláno → zájem → zákazník.

Hlídat: podíl vrácených e-mailů (nad 3 % rozesílku zastavit), podíl odhlášení, podíl špatných čísel, podíl firem, které po telefonu nefungují (ukazuje kvalitu ověření).

## 9. Ceny

Náklady na provoz, ne ceník služeb. Ceny v USD z veřejných ceníků a srovnání dohledaných 8. 10. 2026; před objednáním ověřit.

| Položka | Cena | Poznámka |
|---|---|---|
| zdroj firem OpenStreetMap | zdarma | zná jen část firem; pro pravidelné použití provozovatel doporučuje kolem 100 dotazů denně |
| prověření webu, telefon, e-mail, odkazy, bodování | zdarma | jen čas serveru, 2–6 s na firmu |
| rejstřík ARES | zdarma | starší pravidla uváděla strop 1 000 dotazů ve dne a 5 000 v noci; posílat po jednom s odstupem |
| plný rozbor webu (Weblyx) | zdarma | 10–20 s na web |
| PageSpeed Insights API | zdarma | 25 000 dotazů denně |
| Resend Pro | 20 USD měsíčně, už placeno | 50 000 e-mailů měsíčně; každý projekt potřebuje vlastní ověřenou doménu, kolik domén tarif dovolí, je potřeba ověřit |
| doména projektu | běžně do 300 Kč ročně | když projekt nemá vlastní |
| profil firmy v Google Mapách (Places API) | 1 000 dotazů měsíčně zdarma, pak asi 35 USD / 1 000 | krok 8, zatím odložený: vyžaduje zapnuté platby u Googlu |
| ověření schránek placenou službou | MillionVerifier asi 0,4–0,5 USD / 1 000; NeverBounce 8 USD / 1 000 | volitelné; jediný způsob, jak ověřit freemail |
| placený zdroj firem (Apify, Google Maps) | zhruba 2–4 USD / 1 000 firem | při cíli „kvalita, ne počet“ není potřeba; stahování z Google Map je proti podmínkám Googlu |
| Firmy.cz | veřejné API nemá | strojové stahování je bez svolení proti podmínkám |

Nový pravidelný náklad v základní podobě: 0. Hosting a databáze běží na tom, co CRM už používá.

## 10. Co systém neumí

- Nezná firmy, které nejsou v OpenStreetMap.
- Neověří, že telefon někdo zvedne; to ukáže až první hovor, proto se výsledek hovoru vrací do databáze.
- Nepozná zavřenou provozovnu firmy, která v rejstříku dál existuje.
- Konkrétní schránku na freemailu bez placené služby neověří.
- Jména v oslovení neskloňuje.
- Weby, které robota odmítnou, zůstanou neprověřené.

## 11. Právní rámec

- Zákon 480/2004 Sb. vyžaduje souhlas s obchodním sdělením i u firemních adres; dozor má ÚOOÚ. Oslovení na posbírané adresy je proto rizikové, i když je běžné. Telefonické oslovení má vlastní pravidla (zákon o elektronických komunikacích); obojí stojí za konzultaci s právníkem před ostrým provozem.
- Každá zpráva musí říkat, kdo ji posílá, a nabízet odhlášení (kapitola 4).
- U každého kontaktu držet zdroj a datum nalezení; u každého oslovení, kdy a co odešlo.
- Jména jednatelů a živnostníků jsou osobní údaje; používat jen k oslovení, nikam je nezveřejňovat.
- Poskytovatel e-mailů podle svých podmínek nevyžádané oslovování nepovoluje (znění ověřit); při stížnostech hrozí zablokování účtu. Proto oddělené domény a nízké denní stropy.

## 12. Hotové stavební kameny

Ve složce `~/lead-finder`. Jsou vyzkoušené na skutečných firmách, ale nejsou nasazené a nemají automatické testy.

| Soubor | Pokrývá |
|---|---|
| `crm-pipeline/osm.ts` | 3.2 vyhledání firem |
| `crm-pipeline/inspect.ts` | 3.3 stav webu a odkazy, 3.4 telefony a e-maily, IČO z webu, bodování zastaralosti |
| `crm-pipeline/categories.ts` | seznam oborů s českými názvy |
| `kvalita.mjs` | 3.5 rejstřík, dohledání webu, Google Mapy v nouzi, ověření e-mailové domény, 3.7 známka, důvod hovoru a věty „o čem mluvit“ |
| `find-leads.mjs` | starší jednorázový skript: hledání, bodování, CSV a HTML přehled |
| `send-leads.mjs` | odesílání z CSV po dávkách |

Přesné zadání pro stavbu vyhledávání (kraje, obory, dávky, kontrolní příklady) je v `ZADANI.md`.

Chybí a je potřeba postavit: projekty a jejich nastavení, sdílená databáze firem, fronty a obrazovky, volací seznam s výsledky hovorů, odhlášení podle kapitoly 4 pro víc projektů, odstup mezi projekty, měření.

Odhlášení, rozesílka po dávkách a rozbor webu už existují v administraci Weblyx pro jeden projekt; dají se převzít jako vzor.

## 13. Zdroje cen

- Google Places API: https://openplacesapi.com/blog/google-places-api-pricing , https://developers.google.com/maps/billing-and-pricing/pricing
- Apify Google Maps Scraper: https://blog.apify.com/best-google-maps-scrapers/
- Resend: https://www.usecarly.com/blog/resend-pricing/
- PageSpeed Insights API: https://unlighthouse.dev/learn-lighthouse/pagespeed-insights-api/rate-limits
- Overpass API: https://dev.overpass-api.de/overpass-doc/en/preface/commons.html
- ARES: https://www.lupa.cz/aktuality/ministerstvo-financi-testuje-otevreni-dat-z-aresu-ostry-provoz-ma-byt-bez-limitu/
- Ověřování e-mailů: https://bouncezero.io/zerobounce-vs-neverbounce
- Doména .cz: https://www.lupa.cz/clanky/vetsina-registratoru-jiz-zlevnila-ceskou-domenu/
