# Callscript Weblyx

Scénář hovoru pro projekt Weblyx v CRM. Volají se firmy, které mají slabý, zastaralý nebo žádný web.

**Cíl hovoru:** Domluvit konzultaci s Jevgenijem: den a hodinu. Web po telefonu neprodáváte.

Proměnné ve složených závorkách doplňuje CRM z karty firmy. Soubor `callscript.ts` vedle tohoto dokumentu dělá totéž v kódu (funkce `buildScript` a `reasonsFor`).

## Průběh hovoru: firma má web

1. **Úvod**
   „Dobrý den, tady {jméno volajícího} z webového studia Weblyx. Mluvím s někým, kdo má u vás na starosti web, tedy {firma}?“
   *Když to není ta osoba: zeptejte se na jméno a kdy ji zastihnete, a dejte „Zavolat později“.*
2. **Proč voláte**
   „Volám jen na minutu. Díval jsem se na váš web {doména} a všiml jsem si, že {důvod hovoru}. {co to firmu stojí}“
   *Řekněte to klidně a věcně, jako postřeh, ne jako výčitku.*
3. **Otázka**
   „Víte o tom, nebo je to pro vás novinka?“
   *Teď mlčte a poslouchejte. Co řeknou, zapište do poznámky.*
4. **Návrh konzultace**
   „Kolega Jevgenij, který u nás weby navrhuje, by vám to rád ukázal přímo na vašem webu. Je to krátký hovor, zdarma a k ničemu vás nezavazuje: projde s vámi, kde web ztrácí zákazníky a jak by mohl vypadat nový. Hodilo by se vám to spíš zítra dopoledne, nebo pozítří odpoledne?“
   *Vždy nabídněte dva konkrétní termíny, ne „někdy“. Když neodpovídá ani jeden, zeptejte se, kdy má čas.*
5. **Potvrzení termínu**
   „Výborně, zapisuju si to. Jevgenij vám zavolá na tohle číslo, nebo je lepší jiné? A na jaký e-mail vám můžu poslat potvrzení?“
   *Zopakujte den, hodinu a číslo. Zapište jméno toho, s kým mluvíte.*
6. **Když konzultaci nechce**
   „Rozumím. Můžu vám aspoň poslat e-mailem krátký rozbor vašeho webu? Je zdarma a uvidíte v něm, co přesně jsme našli.“
   *Rozbor smíte poslat jen tomu, kdo výslovně řekne ano. E-mail zopakujte po písmenech.*
7. **Rozloučení**
   „Děkuju za váš čas a přeju hezký den.“

## Průběh hovoru: firma nemá web

Liší se kroky 2 až 4; ostatní jsou stejné.

2. **Proč voláte**
   „Volám jen na minutu. Hledal jsem vaši firmu na internetu a všiml jsem si, že {důvod hovoru}. {co to firmu stojí}“
3. **Otázka**
   „Přemýšleli jste už o vlastním webu, nebo vám zatím stačí to, co máte?“
4. **Návrh konzultace**
   „Kolega Jevgenij, který u nás weby navrhuje, by vám to rád ukázal přímo na vašem webu. Je to krátký hovor, zdarma a k ničemu vás nezavazuje: projde s vámi, kde web ztrácí zákazníky a jak by mohl vypadat nový. Hodilo by se vám to spíš zítra dopoledne, nebo pozítří odpoledne?“

## Důvod hovoru

Vzniká z rozboru webu u každé firmy. Do věty se berou nejvýš dva nálezy, nejzávažnější první, a dopad prvního z nich.

| Nález v rozboru | Co volající řekne („…všiml jsem si, že…“) | Co to firmu stojí |
|---|---|---|
| nemá web | jsem nenašel váš vlastní web, jen kontakt na mapě | Kdo vás hledá na internetu, najde dřív konkurenci, která web má. |
| jen profil na sociální síti / v katalogu | máte jen profil na sociálních sítích, ne vlastní web | Na Googlu se profil skoro nezobrazí a pravidla sítě se můžou kdykoli změnit. |
| web nefunguje (ENOTFOUND) | se mi váš web vůbec nenačetl | Kdo na něj klikne, odejde hned jinam. |
| není responzivní (chybí viewport) | se na mobilu špatně zobrazuje, člověk musí zvětšovat a posouvat | Většina lidí dnes hledá z telefonu a takový web rychle zavře. |
| bez HTTPS | ho prohlížeč označuje jako nezabezpečený | Návštěvník vidí varování dřív než vaši nabídku. |
| patička © 2019 | má v patičce pořád rok 2019 | Působí to, jako by firma už nefungovala. |
| neměněno od 2018 | se naposledy měnil v roce 2018 | Zákazník si není jistý, jestli údaje ještě platí. |
| PageSpeed mobil 31/100 | se na mobilu načítá pomalu | Lidé nečekají a odejdou dřív, než se stránka zobrazí. |
| starý WordPress 4.9.8 | běží na staré verzi redakčního systému | Takové weby bývají terčem útoků a špatně se upravují. |
| zastaralé HTML (font/center/frameset) | je postavený starou technologií | Na nových telefonech a prohlížečích se může rozpadat. |
| chybí OG tagy | se při sdílení na Facebooku neukáže s obrázkem | Sdílený odkaz pak nikoho nezaujme. |

Firma, u které rozbor nenajde nic z tabulky, se nevolá: volající by neměl o čem mluvit.

## Námitky

| Řeknou | Odpověď |
|---|---|
| Teď nemám čas. | Rozumím, nebudu zdržovat. Kdy vám můžu zavolat, aby se to hodilo líp? Je to na dvě minuty. |
| Nemám zájem. | V pořádku. Můžu se jen zeptat: je to tím, že web teď neřešíte, nebo jste s ním spokojeni? |
| Web máme a jsme s ním spokojeni. | To je dobře. Právě proto volám jen s jednou konkrétní věcí, kterou jsme na něm našli. Jevgenij vám ji ukáže a je na vás, jestli s tím něco uděláte. |
| Máme svého webaře / agenturu. | Výborně, pak to půjde rychle opravit. Jevgenij vám řekne, co přesně mu máte předat. Je to zdarma. |
| Dělal nám to známý / syn. | To je časté a nic proti tomu. Jde jen o pár věcí, které se od té doby změnily. Jevgenij vám je ukáže, ať víte, na čem jste. |
| Kolik to stojí? | Konzultace nic. Nový web děláme od 7 990 korun, jednorázově a bez měsíčních poplatků. Přesnou cenu vám Jevgenij řekne podle toho, co budete potřebovat. |
| Na to teď nemáme peníze. | Rozumím. Konzultace je zdarma a aspoň budete vědět, co web potřebuje a kolik by to stálo, až na to přijde čas. |
| Stačí nám Facebook / Instagram. | Sítě jsou dobré pro stálé zákazníky. Kdo vás ale hledá přes Google, profil většinou nenajde. Jevgenij vám ukáže, jak se dá obojí propojit. |
| Zákazníků máme dost, chodí na doporučení. | To je nejlepší reklama. I ten, komu vás někdo doporučí, si vás dnes nejdřív najde na internetu. Jde o to, co tam uvidí. |
| Pošlete mi to mailem. | Rád. Na jakou adresu? Pošlu vám rozbor webu a domluvíme krátký hovor, kde vám ho Jevgenij projde. Hodí se vám to do konce týdne? |
| Jak dlouho trvá udělat web? | Většinou do týdne od dodání podkladů. Podrobnosti vám řekne Jevgenij. |
| Kde je háček? Co za to chcete? | Žádný háček. Děláme weby a takhle hledáme firmy, kterým můžeme pomoct. Když se vám to nebude líbit, nic se neděje. |
| Odkud máte moje číslo? Jak jste na nás přišli? | Z veřejných údajů vaší firmy, číslo je uvedené u vaší provozovny na mapě nebo na vašem webu. Hledali jsme firmy z vašeho oboru ve vašem okolí. |
| Volá mi takových deset denně. | To chápu a omlouvám se. Rozdíl je v tom, že jsme se na váš web opravdu podívali a volám s konkrétní věcí, ne s obecnou nabídkou. |
| To jste zjistili jak? To je nějaký robot? | Web jsme prošli měřicím nástrojem, stejným, jakým kontrolujeme weby našich klientů. Výsledek vám Jevgenij ukáže a vysvětlí. |
| Už jste mi psali e-mail. | Ano, to jsme byli my. Jestli vás to obtěžovalo, omlouvám se. Volám, protože po telefonu se to vysvětlí líp než e-mailem. |
| O tom nerozhoduju já. | Rozumím. Kdo má web na starosti a kdy ho zastihnu? Zavolám přímo jemu. |
| Nevolejte mi už. | Rozumím, omlouvám se za vyrušení. Zařídím, aby vám už nikdo od nás nevolal. Hezký den. |

## Pravidla pro volající

- Cílem je termín konzultace. Cenu a podrobnosti řeší Jevgenij.
- Mluvte pomalu a klidně. Po otázce nechte druhou stranu domluvit.
- O termín se pokuste nejvýš dvakrát. Pak nabídněte rozbor e-mailem a rozlučte se.
- Kdo řekne, ať nevoláte, toho zapište jako „Nevolat“. Bez výjimky.
- Po každém hovoru zapište výsledek a krátkou poznámku.

## Výsledky hovoru, které má CRM evidovat

| Výsledek | Co se stane dál |
|---|---|
| Domluvena konzultace | Uloží se den a hodina, Jevgenij dostane upozornění s kontaktem a poznámkou. |
| Chce rozbor e-mailem | Jen po výslovném souhlasu. Rozbor odejde na e-mail, který řekli do telefonu. |
| Zavolat později | Uloží se datum a čas; firma se vrátí stejnému volajícímu. |
| Nezvedl | Zkusí se znovu později, nejvýš třikrát. |
| Nemá zájem | Uzavřeno, znovu se nevolá. |
| Špatné číslo | Uzavřeno. |
| Nevolat | Číslo jde na seznam „nikdy nekontaktovat“ a žádný projekt už ho nenabídne. |

Dva volající nesmí dostat stejnou firmu: firma se přiděluje jednomu volajícímu ve chvíli, kdy si ji vyžádá, a uvolní se, až zapíše výsledek.

## Co je v odpovědích tvrzeno o Weblyxu

Tyhle údaje jsou převzaté z webu weblyx.cz k 8. 10. 2026. Když se změní, je potřeba upravit i skript.

- Nový web od 7 990 Kč, jednorázově, bez měsíčních poplatků.
- Dodání většinou do týdne od dodání podkladů.
- Konzultace i rozbor webu jsou zdarma.

## Právní poznámka

I telefonický marketing má pravidla. Před ostrým voláním je potřeba ověřit s právníkem, komu se smí volat, a „Nevolat“ respektovat bez výjimky.
