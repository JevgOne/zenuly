/**
 * What the caller says.
 *
 * The call has one goal: a consultation with Jevgenij. Not a sale, not a
 * price — a time in the calendar. Everything in the script leads there, and
 * the report by e-mail is the fallback for someone who will not commit to a
 * time.
 *
 * The script is the same for every company except for the reason for calling,
 * which comes from the analysis of *their* website: what is wrong, and what
 * that costs them, in words that can be said out loud.
 */

/** A finding → what to say about it, and why it matters to the owner. Most telling first. */
const REASONS: Array<[pattern: RegExp, say: (m: RegExpExecArray) => string, impact: string]> = [
  [/nemá web/, () => 'jsem vás na Googlu nenašel, jen kontakt na mapě', 'Lidi hledají služby nejdřív na internetu a kdo tam není, toho minou.'],
  [/jen profil na sociální síti/, () => 'jsem vás našel jen na sociálních sítích, ne přes Google', 'Na Googlu se profil skoro nezobrazí a pravidla sítě se můžou kdykoli změnit.'],
  [/web nefunguje/, () => 'se mi váš web vůbec nenačetl', 'Kdo na něj klikne, odejde hned jinam.'],
  [/není responzivní/, () => 'se na mobilu nedá pořádně přečíst, musí se zvětšovat a posouvat', 'Většina lidí dnes hledá z telefonu a takový web zavře do pár vteřin.'],
  [/bez HTTPS/, () => 'mi prohlížeč ukázal varování, že stránka není zabezpečená', 'Lidi to odradí dřív, než vůbec uvidí vaši nabídku.'],
  [/patička © (\d{4})/, (m) => `má v patičce pořád rok ${m[1]}, takže působí zastarale`, 'Zákazník si řekne, jestli firma ještě vůbec funguje.'],
  [/neměněno od (\d{4})/, (m) => `se naposledy měnil v roce ${m[1]}`, 'Člověk si není jistý, jestli údaje ještě platí.'],
  [/PageSpeed mobil (\d+)\/100/, () => 'se na mobilu načítá hodně pomalu', 'Lidi nečekají a odejdou dřív, než se stránka zobrazí.'],
  [/starý (WordPress|Joomla)/, () => 'běží na starší verzi systému, co už se neaktualizuje', 'Takové weby bývají náchylné k napadení a špatně se upravují.'],
  [/Flash|zastaralé HTML|layout v tabulkách|jQuery 1/, () => 'je postavený technologií, která se už nepoužívá', 'Na novějších telefonech se může rozpadat.'],
  [/chybí OG tagy/, () => 'se při sdílení na Facebooku neukáže s obrázkem', 'Sdílený odkaz pak nikoho nezaujme.'],
];

export function reasonsFor(findings: string): { say: string; impact: string }[] {
  const out: { say: string; impact: string }[] = [];
  for (const [pattern, say, impact] of REASONS) {
    const m = pattern.exec(findings);
    if (m && !out.some((r) => r.impact === impact)) out.push({ say: say(m), impact });
  }
  return out.slice(0, 2);
}

export interface ScriptStep {
  title: string;
  say: string;
  /** A note for the caller, not to be read out. */
  hint?: string;
}

export interface Objection {
  they: string;
  you: string;
}

export function buildScript(lead: { company: string; website: string; reasons: string }, callerName: string): {
  goal: string;
  steps: ScriptStep[];
  objections: Objection[];
  rules: string[];
} {
  const domain = lead.website.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const reasons = reasonsFor(lead.reasons);
  const noSite = !domain || /nemá web|jen profil na sociální síti/.test(lead.reasons);
  const found = reasons.length ? reasons.map((r) => r.say).join(' a že ') : 'by si zasloužil pár úprav';
  const impact = reasons[0]?.impact ?? '';

  return {
    goal: 'Domluvit konzultaci s Jevgenijem: den a hodinu. Web po telefonu neprodáváte.',
    steps: [
      {
        title: 'Úvod',
        say: `Dobrý den, tady ${callerName} z webového studia Weblyx. Mluvím s někým, kdo má u vás na starosti web${lead.company ? `, tedy ${lead.company}` : ''}?`,
        hint: 'Když to není ta osoba: zeptejte se na jméno a kdy ji zastihnete, a dejte „Zavolat později“.',
      },
      {
        title: 'Proč voláte',
        say: noSite
          ? `Volám jen na chvilku. Hledal jsem firmy z vašeho oboru ve vašem okolí a ${found}. ${impact}`
          : `Volám jen na chvilku. Hledal jsem firmy z vašeho oboru ve vašem okolí a narazil jsem na váš web ${domain}. Otevřel jsem ho z telefonu a ${found}. ${impact}`,
        hint: 'Řekněte to klidně a věcně, jako osobní postřeh, ne jako výčitku. Žádný „audit" nezmiňujte.',
      },
      {
        title: 'Otázka',
        say: noSite ? 'Přemýšleli jste už o vlastním webu, nebo vám zatím stačí to, co máte?' : 'Víte o tom, nebo je to pro vás novinka?',
        hint: 'Teď mlčte a poslouchejte. Co řeknou, zapište do poznámky.',
      },
      {
        title: 'Návrh konzultace',
        say: 'Kolega Jevgenij, který u nás weby navrhuje, by vám to rád ukázal přímo na vašem webu. Je to krátký hovor, zdarma a k ničemu vás nezavazuje: projde s vámi, kde web ztrácí zákazníky a jak by mohl vypadat nový. Hodilo by se vám to spíš zítra dopoledne, nebo pozítří odpoledne?',
        hint: 'Vždy nabídněte dva konkrétní termíny, ne „někdy“. Když neodpovídá ani jeden, zeptejte se, kdy má čas.',
      },
      {
        title: 'Potvrzení termínu',
        say: 'Výborně, zapisuju si to. Jevgenij vám zavolá na tohle číslo, nebo je lepší jiné? A na jaký e-mail vám můžu poslat potvrzení?',
        hint: 'Zopakujte den, hodinu a číslo. Zapište jméno toho, s kým mluvíte.',
      },
      {
        title: 'Když konzultaci nechce',
        say: 'Rozumím. Můžu vám aspoň poslat e-mailem krátký rozbor vašeho webu? Je zdarma a uvidíte v něm, co přesně jsme našli.',
        hint: 'Rozbor smíte poslat jen tomu, kdo výslovně řekne ano. E-mail zopakujte po písmenech.',
      },
      { title: 'Rozloučení', say: 'Děkuju za váš čas a přeju hezký den.' },
    ],
    objections: [
      { they: 'Teď nemám čas.', you: 'Rozumím, nebudu zdržovat. Kdy vám můžu zavolat, aby se to hodilo líp? Je to na dvě minuty.' },
      { they: 'Nemám zájem.', you: 'V pořádku. Můžu se jen zeptat: je to tím, že web teď neřešíte, nebo jste s ním spokojeni?' },
      { they: 'Web máme a jsme s ním spokojeni.', you: 'To je dobře. Právě proto volám jen s jednou konkrétní věcí, kterou jsme na něm našli. Jevgenij vám ji ukáže a je na vás, jestli s tím něco uděláte.' },
      { they: 'Máme svého webaře / agenturu.', you: 'Výborně, pak to půjde rychle opravit. Jevgenij vám řekne, co přesně mu máte předat. Je to zdarma.' },
      { they: 'Dělal nám to známý / syn.', you: 'To je časté a nic proti tomu. Jde jen o pár věcí, které se od té doby změnily. Jevgenij vám je ukáže, ať víte, na čem jste.' },
      { they: 'Kolik to stojí?', you: 'Konzultace nic. Nový web děláme od 7 990 korun, jednorázově a bez měsíčních poplatků. Přesnou cenu vám Jevgenij řekne podle toho, co budete potřebovat.' },
      { they: 'Na to teď nemáme peníze.', you: 'Rozumím. Konzultace je zdarma a aspoň budete vědět, co web potřebuje a kolik by to stálo, až na to přijde čas.' },
      { they: 'Stačí nám Facebook / Instagram.', you: 'Sítě jsou dobré pro stálé zákazníky. Kdo vás ale hledá přes Google, profil většinou nenajde. Jevgenij vám ukáže, jak se dá obojí propojit.' },
      { they: 'Zákazníků máme dost, chodí na doporučení.', you: 'To je nejlepší reklama. I ten, komu vás někdo doporučí, si vás dnes nejdřív najde na internetu. Jde o to, co tam uvidí.' },
      { they: 'Pošlete mi to mailem.', you: 'Rád. Na jakou adresu? Pošlu vám rozbor webu a domluvíme krátký hovor, kde vám ho Jevgenij projde. Hodí se vám to do konce týdne?' },
      { they: 'Jak dlouho trvá udělat web?', you: 'Většinou do týdne od dodání podkladů. Podrobnosti vám řekne Jevgenij.' },
      { they: 'Kde je háček? Co za to chcete?', you: 'Žádný háček. Děláme weby a takhle hledáme firmy, kterým můžeme pomoct. Když se vám to nebude líbit, nic se neděje.' },
      { they: 'Odkud máte moje číslo? Jak jste na nás přišli?', you: 'Z veřejných údajů vaší firmy, číslo je uvedené u vaší provozovny na mapě nebo na vašem webu. Hledali jsme firmy z vašeho oboru ve vašem okolí.' },
      { they: 'Volá mi takových deset denně.', you: 'To chápu a omlouvám se. My jsme se na váš web opravdu podívali a volám s jednou konkrétní věcí, ne s obecnou nabídkou.' },
      { they: 'To jste zjistili jak? To je nějaký robot?', you: 'Hledali jsme firmy z vašeho oboru a procházeli jejich weby. Váš nás zaujal, protože by mohl fungovat mnohem líp. Jevgenij vám to rád ukáže.' },
      { they: 'Už jste mi psali e-mail.', you: 'Ano, to jsme byli my. Jestli vás to obtěžovalo, omlouvám se. Volám, protože po telefonu se to vysvětlí líp než e-mailem.' },
      { they: 'O tom nerozhoduju já.', you: 'Rozumím. Kdo má web na starosti a kdy ho zastihnu? Zavolám přímo jemu.' },
      { they: 'Nevolejte mi už.', you: 'Rozumím, omlouvám se za vyrušení. Zařídím, aby vám už nikdo od nás nevolal. Hezký den.' },
    ],
    rules: [
      'Cílem je termín konzultace. Cenu a podrobnosti řeší Jevgenij.',
      'Mluvte pomalu a klidně. Po otázce nechte druhou stranu domluvit.',
      'O termín se pokuste nejvýš dvakrát. Pak nabídněte rozbor e-mailem a rozlučte se.',
      'Kdo řekne, ať nevoláte, toho zapište jako „Nevolat“. Bez výjimky.',
      'Po každém hovoru zapište výsledek a krátkou poznámku.',
    ],
  };
}
