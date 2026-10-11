/**
 * A first look at a company's website, before anything is spent on a full
 * analysis: does it answer, is it a real site that somebody still looks
 * after, how can the company be reached, and where else is it on the web.
 *
 * Reads the home page and up to two contact pages; no browser, no API keys.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export type SiteState =
  /** No website is known for the company. */
  | 'none'
  /** The address does not answer, or answers with an error. */
  | 'dead'
  /** A registrar's or host's placeholder, or a domain offered for sale. */
  | 'parked'
  /** "Coming soon" and nothing else. */
  | 'construction'
  /** The site itself says the business has closed. */
  | 'closed'
  /** The server refused us (bot protection); nothing can be said about the site. */
  | 'blocked'
  /** A real site with no sign that anyone has touched it in years. */
  | 'stale'
  /** A real site with signs of recent care. */
  | 'active';

export interface SiteLink {
  type: string;
  url: string;
}

export interface Inspection {
  state: SiteState;
  /** Why the state is what it is, in Czech, for the person reading the lead. */
  evidence: string[];
  finalUrl: string | null;
  emails: string[];
  phones: string[];
  links: SiteLink[];
  /** The company's registration number (IČO) as printed on the site, checksum-verified. */
  ico: string | null;
  /** How dated the site looks, from cheap signs in its HTML; 0 is nothing found. */
  datedScore: number;
  datedReasons: string[];
}

interface Page {
  html: string;
  finalUrl: string;
  lastModified: string | null;
}

async function fetchPage(url: string, timeout: number): Promise<Page> {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'cs,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // Old Czech sites are still served in windows-1250; read as UTF-8 they lose every accent.
  const charset =
    /charset=([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString('latin1'))?.[1] ??
    'utf-8';
  let html: string;
  try {
    html = new TextDecoder(charset).decode(buf);
  } catch {
    html = buf.toString('utf8');
  }
  return { html, finalUrl: res.url, lastModified: res.headers.get('last-modified') };
}

/** https first; a broken certificate is not a dead site, so http gets a turn too. */
async function fetchHome(website: string): Promise<Page> {
  const bare = website.replace(/^https?:\/\//i, '');
  try {
    return await fetchPage(`https://${bare}`, 12_000);
  } catch (error) {
    if (/^HTTP \d/.test((error as Error).message)) throw error;
    return fetchPage(`http://${bare}`, 12_000);
  }
}

const visibleText = (html: string) =>
  html
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// ---------- contacts ----------

function decodeCfEmail(hex: string): string {
  const key = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

export function extractEmails(html: string): string[] {
  let text = html
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/%20/g, ' ')
    .replace(/\s*[[(]\s*(?:at|zavin[aá][cč])\s*[\])]\s*/gi, '@');
  for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) text += ' ' + decodeCfEmail(m[1]);
  const found = text.match(/[a-z0-9._+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) ?? [];
  return [...new Set(found.map((e) => e.toLowerCase()))].filter(
    (e) =>
      !/\.(png|jpe?g|gif|webp|svg|js|css)$/.test(e) &&
      !/(sentry|wixpress|example\.|domena\.cz|priklad\.cz|vas@|vase@|jmeno@|name@)/.test(e)
  );
}

/** +420 and nine digits, or null for anything that is not a Czech number. */
export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('00420')) digits = digits.slice(5);
  else if (digits.startsWith('+420')) digits = digits.slice(4);
  else if (digits.startsWith('+')) return null;
  else if (digits.length === 12 && digits.startsWith('420')) digits = digits.slice(3);
  if (!/^[2-79]\d{8}$/.test(digits)) return null;
  return `+420 ${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
}

/**
 * Every phone number the pages give away, the surest first: links made to be
 * dialled, structured data, numbers that follow the word "tel" or "mobil",
 * and only then numbers that merely look like a phone.
 */
export function extractPhones(html: string): string[] {
  const phones = new Set<string>();
  const add = (raw: string) => {
    let value = raw;
    try {
      value = decodeURIComponent(raw);
    } catch {
      // a stray % in the link; the digits are still there
    }
    const phone = normalizePhone(value);
    if (phone) phones.add(phone);
  };

  for (const m of html.matchAll(/href=["'](?:tel|callto):([^"']+)/gi)) add(m[1]);
  for (const m of html.matchAll(/(?:wa\.me\/|whatsapp\.com\/send\?phone=)(\+?\d{9,14})/gi)) add(m[1]);
  for (const m of html.matchAll(/"telephone"\s*:\s*"([^"]+)"/gi)) add(m[1]);
  for (const m of html.matchAll(/itemprop=["']telephone["'][^>]*?(?:content=["']([^"']+)["']|>([^<]+)<)/gi)) add(m[1] ?? m[2]);

  // Sites drawn by script keep their content in JSON inside the page; a number
  // with the +420 prefix is a phone wherever it stands.
  for (const m of html.matchAll(/(?:\+|00)420[\s.\-\u00a0]?\d{3}[\s.\-\u00a0]?\d{3}[\s.\-\u00a0]?\d{3}(?!\d)/g)) add(m[0]);

  const text = visibleText(html);
  // After the word that announces a phone, any way of writing it counts.
  for (const m of text.matchAll(/(?:tel(?:efon)?|mob(?:il)?|gsm|phone|volejte|zavolejte|call)\b[^0-9+]{0,25}((?:\+|00)?\d[\d\s./-]{7,18}\d)/gi)) {
    add(m[1]);
    // "777 123 456, 608 111 222" — the second number has no label of its own
    for (const part of m[1].split(/[,;]|\s{2,}/)) add(part);
  }
  // Without the word, only what is written the way phones are: with the +420
  // prefix, in groups, or nine digits in a row starting 6 or 7 (a mobile —
  // company IDs have eight digits, and account numbers end in a slash).
  for (const m of text.matchAll(
    /(?:\+|00)420[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}\b|(?<![\d/-])[2-79]\d{2}[ .-]\d{3}[ .-]\d{3}(?![\d/])|(?<![\d/-])[67]\d{2} \d{2} \d{2} \d{2}(?![\d/])|(?<![\dA-Za-z/-])[67]\d{8}(?![\d/])/g
  )) {
    add(m[0]);
  }
  return [...phones].slice(0, 3);
}

/** Czech company IDs carry a mod-11 check digit; it weeds out phone numbers and postcodes. */
function validIco(ico: string): boolean {
  if (!/^\d{8}$/.test(ico)) return false;
  let sum = 0;
  for (let i = 0; i < 7; i++) sum += Number(ico[i]) * (8 - i);
  return (11 - (sum % 11)) % 10 === Number(ico[7]);
}

export function extractIco(html: string): string | null {
  const text = visibleText(html);
  for (const m of text.matchAll(/I[ČC]O?\s*[:.]?\s*((?:\d\s?){8})(?!\d)/gi)) {
    const ico = m[1].replace(/\s/g, '');
    if (validIco(ico)) return ico;
  }
  return null;
}

// ---------- where else the company is ----------

const LINK_TYPES: Array<[type: string, pattern: RegExp]> = [
  ['facebook', /^https?:\/\/(?:[\w-]+\.)?(?:facebook|fb)\.com\/(?!sharer|share|tr\b|plugins|dialog)[^"'\s]+/i],
  ['instagram', /^https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|explore)[^"'\s]+/i],
  ['linkedin', /^https?:\/\/(?:[\w-]+\.)?linkedin\.com\/(?:company|in)\/[^"'\s]+/i],
  ['youtube', /^https?:\/\/(?:www\.)?youtube\.com\/(?:@|channel\/|c\/|user\/)[^"'\s]+/i],
  ['tiktok', /^https?:\/\/(?:www\.)?tiktok\.com\/@[^"'\s]+/i],
  ['x', /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent|share)[^"'\s]+/i],
  ['whatsapp', /^https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^"'\s]+/i],
  ['mapa', /^https?:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps|g\.page|(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+|mapy\.(?:cz|com))\/?[^"'\s]*/i],
  ['rezervace', /^https?:\/\/(?:[\w-]+\.)?(?:reservio\.com|reservanto\.cz|bookio\.com|noona\.app|booksy\.com|rezervacnisystem\.cz|isalon\.cz|notino\.cz\/salony)[^"'\s]*/i],
  ['firmy.cz', /^https?:\/\/(?:www\.)?firmy\.cz\/detail\/[^"'\s]+/i],
  ['tripadvisor', /^https?:\/\/(?:www\.)?tripadvisor\.[a-z.]+\/[^"'\s]+/i],
];

export function extractLinks(html: string): SiteLink[] {
  const found = new Map<string, string>();
  for (const m of html.matchAll(/href=["'](https?:\/\/[^"']+)["']/gi)) {
    const url = m[1].replace(/&amp;/g, '&');
    for (const [type, pattern] of LINK_TYPES) {
      if (!found.has(type) && pattern.test(url)) found.set(type, url);
    }
  }
  return [...found].map(([type, url]) => ({ type, url }));
}

const sameSite = (a: string, b: string) => a.replace(/^www\./, '') === b.replace(/^www\./, '');

/** Every other page of the site the home page links to, shortest addresses first (the menu, not the archive). */
function otherPages(html: string, baseUrl: string, skip: Set<string>): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1].replace(/&amp;/g, '&'), baseUrl);
      if (!u.protocol.startsWith('http') || !sameSite(u.host, new URL(baseUrl).host)) continue;
      if (/\.(pdf|jpe?g|png|gif|webp|svg|ico|css|js|xml|docx?|zip)$/i.test(u.pathname) || /feed|wp-json|xmlrpc|wp-login|\/tag\/|\/category\//i.test(u.href)) continue;
      if (!skip.has(u.href)) links.add(u.href);
    } catch {
      // not a link we can follow
    }
  }
  return [...links].sort((a, b) => a.length - b.length).slice(0, 8);
}

function contactPages(html: string, baseUrl: string): string[] {
  const links = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi)) {
    if (!/kontakt|contact|napiste|napište|o-nas|o nás|onas|about|kde-nas|kde nás|provozovn|objedn|rezervac/i.test(m[1] + ' ' + m[2])) continue;
    try {
      const u = new URL(m[1], baseUrl);
      if (u.protocol.startsWith('http') && sameSite(u.host, new URL(baseUrl).host) && !/\.(pdf|jpe?g|png|docx?)$/i.test(u.pathname)) links.add(u.href);
    } catch {
      // not a link we can follow
    }
  }
  // Contact pages first; a site whose menu is drawn by script still tends to have /kontakt.
  const ordered = [...links].sort((a, b) => Number(/kontakt|contact/i.test(b)) - Number(/kontakt|contact/i.test(a)));
  if (!ordered.some((l) => /kontakt|contact/i.test(l))) {
    for (const guess of ['/kontakt', '/kontakty']) ordered.unshift(new URL(guess, baseUrl).href);
  }
  return ordered.slice(0, 4);
}

/**
 * Many old sites answer with an empty shell: a meta refresh, a script that
 * redirects, a frameset, or one iframe that holds everything. The content —
 * and the phone number — is one hop further.
 */
function shellTargets(html: string, baseUrl: string): string[] {
  const targets: string[] = [];
  const add = (raw: string | undefined) => {
    if (!raw) return;
    try {
      const u = new URL(raw.replace(/&amp;/g, '&').trim(), baseUrl);
      if (u.protocol.startsWith('http') && u.href !== baseUrl) targets.push(u.href);
    } catch {
      // not an address
    }
  };
  add(/http-equiv=["']?refresh["']?[^>]*content=["'][^"']*url=([^"'>\s]+)/i.exec(html)?.[1]);
  add(/(?:window\.|document\.|top\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i.exec(html)?.[1]);
  add(/location\.replace\(\s*["']([^"']+)["']/i.exec(html)?.[1]);
  for (const m of html.matchAll(/<i?frame[^>]+src=["']([^"']+)["']/gi)) add(m[1]);
  return [...new Set(targets)].slice(0, 3);
}

async function unwrap(home: Page): Promise<Page> {
  let page = home;
  for (let hop = 0; hop < 2 && visibleText(page.html).length < 200; hop++) {
    const targets = shellTargets(page.html, page.finalUrl).filter((t) => !/youtube\.com|google\.com\/maps|facebook\.com\/plugins/i.test(t));
    if (targets.length === 0) break;
    const inner: Page[] = [];
    for (const target of targets) {
      try {
        inner.push(await fetchPage(target, 10_000));
      } catch {
        // a frame that fails leaves the others
      }
    }
    if (inner.length === 0) break;
    // The longest document is the content; the others (menu, header) come along for their links.
    inner.sort((a, b) => b.html.length - a.html.length);
    page = { html: inner.map((p) => p.html).join('\n'), finalUrl: inner[0].finalUrl, lastModified: inner[0].lastModified ?? page.lastModified };
  }
  return page;
}

/** A page drawn entirely by script: its texts sit in the script files. */
async function scriptText(html: string, baseUrl: string): Promise<string> {
  const host = new URL(baseUrl).host;
  const sources: string[] = [];
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    try {
      const u = new URL(m[1], baseUrl);
      if (u.host === host) sources.push(u.href);
    } catch {
      // skip
    }
  }
  let out = '';
  for (const src of sources.slice(0, 4)) {
    try {
      const res = await fetch(src, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8_000) });
      if (res.ok) out += '\n' + (await res.text()).slice(0, 2_000_000);
    } catch {
      // a script that fails costs nothing
    }
  }
  return out;
}

const CLOSED =
  /provoz (?:byl |jsme )?(?:ukon[cč]en|ukon[cč]ili)|ukon[cč]ili jsme (?:provoz|[cč]innost)|[cč]innost (?:byla )?ukon[cč]ena|trvale (?:zav[rř]eno|uzav[rř]en)|provoz (?:e-?shopu |prodejny |restaurace )?(?:je )?(?:pozastaven|zru[sš]en)|prodejna (?:je )?zru[sš]ena|permanently closed|we (?:are|have) closed (?:down|permanently)/i;

// ---------- is it a real, living site ----------

const PARKED =
  /dom[eé]na (?:je )?(?:na prodej|k prodeji|zaregistrov[aá]na|parkov[aá]na)|domain (?:is )?for sale|buy this domain|this domain (?:is|has been) (?:parked|registered)|parkovac[ií] str[aá]nk|sedoparking|parked (?:free|domain)|webhosting nen[ií] aktivn[ií]|hosting (?:byl )?(?:pozastaven|ukon[cč]en)|account (?:has been )?suspended|default web ?page|apache2? (?:ubuntu|debian) default|welcome to nginx|it works!/i;
const CONSTRUCTION =
  /web (?:se )?p[rř]ipravuje|str[aá]nk[ay] (?:se )?p[rř]ipravuj|p[rř]ipravujeme (?:pro v[aá]s )?nov|under construction|coming soon|ve v[yý]stavb[eě]|brzy spust[ií]me/i;
const MEASURED = /googletagmanager\.com|google-analytics\.com|gtag\(|c\.seznam\.cz|sklik|connect\.facebook\.net|fbq\(|clarity\.ms|hotjar/i;

/** The most recent year a page admits to, in a copyright line or a written date. */
function latestYear(html: string, text: string, now: number): { footer: number | null; content: number | null } {
  const years: number[] = [];
  for (const m of html.matchAll(/(?:©|&copy;|&#169;|copyright)[^<]{0,40}/gi)) {
    for (const y of m[0].matchAll(/\b(19\d\d|20\d\d)\b/g)) years.push(Number(y[1]));
  }
  const footer = Math.max(...years.filter((y) => y <= now));
  const dated: number[] = [];
  for (const m of text.matchAll(/\b\d{1,2}\.\s?\d{1,2}\.\s?(20\d\d)\b|\b(20\d\d)-\d{2}-\d{2}\b/g)) dated.push(Number(m[1] ?? m[2]));
  const content = Math.max(...dated.filter((y) => y <= now));
  return { footer: Number.isFinite(footer) ? footer : null, content: Number.isFinite(content) ? content : null };
}

/** Cheap signs of an old site; the full analysis is only worth running above a point or two. */
function datedness(html: string, finalUrl: string, lastModified: string | null, footerYear: number | null, now: number, framed = false) {
  const reasons: string[] = [];
  let score = 0;
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };
  if (!/<meta[^>]+name=["']?viewport/i.test(html)) add(3, 'není přizpůsobený mobilům');
  if (framed) add(2, 'postavený na rámech nebo přesměrování');
  if (finalUrl.startsWith('http://')) add(2, 'bez HTTPS');
  if (footerYear !== null && footerYear <= now - 3) add(2, `v patičce rok ${footerYear}`);
  const generator = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] ?? '';
  const wp = /WordPress (\d+)\./i.exec(generator);
  if ((wp && Number(wp[1]) < 6) || /Joomla!? [12]\./i.test(generator)) add(2, `starý ${generator}`);
  if (/jquery[-./]1\.\d+/i.test(html)) add(1, 'jQuery 1.x');
  if (/\.swf\b/i.test(html)) add(3, 'Flash');
  if (/<(frameset|font|center|marquee)\b/i.test(html)) add(2, 'zastaralé HTML');
  if ((html.match(/<table\b/gi) ?? []).length >= 5) add(1, 'rozvržení v tabulkách');
  if (!/property=["']og:/i.test(html)) add(1, 'chybí náhled pro sdílení');
  if (lastModified) {
    const age = (Date.now() - new Date(lastModified).getTime()) / (365 * 864e5);
    if (age >= 3) add(1, `soubor neměněn od ${new Date(lastModified).getFullYear()}`);
  }
  return { score, reasons };
}

const PROFILE_ONLY = /(^|\.)(facebook\.com|instagram\.com|firmy\.cz|zlatestranky\.cz|linktr\.ee|google\.com)$/i;

export async function inspectSite(website: string | null | undefined): Promise<Inspection> {
  const empty: Inspection = {
    state: 'none', evidence: [], finalUrl: null, emails: [], phones: [], links: [], ico: null, datedScore: 0, datedReasons: [],
  };
  if (!website?.trim()) return { ...empty, evidence: ['firma nemá uvedený web'] };

  let host = '';
  try {
    host = new URL(/^https?:/i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, '');
  } catch {
    return { ...empty, evidence: ['adresa webu není platná'] };
  }
  // A Facebook page is a place the company can be found, not a website of its own.
  if (PROFILE_ONLY.test(host)) {
    const url = /^https?:/i.test(website) ? website : `https://${website}`;
    return { ...empty, evidence: ['místo webu má jen profil na síti nebo v katalogu'], links: extractLinks(`<a href="${url}">`) };
  }

  let home: Page;
  try {
    home = await fetchHome(website);
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause?.code ?? (error as Error).message;
    if (/HTTP (401|403|429)|timeout|aborted/i.test(cause)) {
      return { ...empty, state: 'blocked', evidence: [`web neodpověděl robotovi (${cause})`] };
    }
    return { ...empty, state: 'dead', evidence: [`web nejde načíst (${cause})`] };
  }
  const shell = home;
  if (shellTargets(home.html, home.finalUrl).some((t) => /\/\/(?:parking\.|[\w.-]*sedoparking|page\.active24\.cz\/unknown)/i.test(t))) {
    return { ...empty, state: 'parked', finalUrl: home.finalUrl, evidence: ['na adrese je jen zástupná stránka registrátora nebo hostingu'] };
  }
  home = await unwrap(home);
  const framed = home !== shell;

  let combined = home.html;
  for (const url of contactPages(home.html, home.finalUrl)) {
    try {
      combined += '\n' + (await fetchPage(url, 8_000)).html;
    } catch {
      // a contact page that fails costs a contact, not the lead
    }
  }
  // No number on the home or contact pages: walk the rest of the menu until one turns up.
  if (extractPhones(combined).length === 0) {
    const seen = new Set([home.finalUrl, ...contactPages(home.html, home.finalUrl)]);
    for (const url of otherPages(home.html, home.finalUrl, seen)) {
      try {
        const page = await fetchPage(url, 8_000);
        combined += '\n' + page.html;
        if (extractPhones(page.html).length > 0) break;
      } catch {
        // next page
      }
    }
  }

  // Still nothing to read: the content is drawn by script, so read the scripts.
  if (visibleText(home.html).length < 200) {
    const scripts = await scriptText(home.html, home.finalUrl);
    const fromScripts = [
      ...(scripts.match(/(?:\+|00)420[\s.-]?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}(?!\d)/g) ?? []),
      ...[...scripts.matchAll(/tel:(\+?[\d\s]{9,16})/g)].map((m) => m[1]),
    ];
    const mails = scripts.match(/mailto:[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? [];
    combined += '\n' + fromScripts.map((p) => `<a href="tel:${p}">`).join('') + mails.map((m) => `<a href="${m}">`).join('');
  }

  const now = new Date().getFullYear();
  const text = visibleText(home.html);
  const { footer, content } = latestYear(home.html, text, now);
  const emails = extractEmails(combined);
  // The company's own domain first; the gmail of whoever built the site last.
  emails.sort((a, b) => Number(b.endsWith('@' + host)) - Number(a.endsWith('@' + host)));

  const result: Inspection = {
    ...empty,
    finalUrl: home.finalUrl,
    emails: emails.slice(0, 3),
    phones: extractPhones(combined),
    links: extractLinks(combined),
    ico: extractIco(combined),
  };

  if (CLOSED.test(text.slice(0, 3000))) {
    return { ...result, state: 'closed', evidence: ['web sám uvádí, že provoz skončil'] };
  }
  if (PARKED.test(text) && text.length < 1500) {
    return { ...result, state: 'parked', evidence: ['na adrese je jen zástupná stránka registrátora nebo hostingu'] };
  }
  if (text.length < 600 && CONSTRUCTION.test(text)) {
    return { ...result, state: 'construction', evidence: ['web je „ve výstavbě“, bez obsahu'] };
  }
  if (text.length < 120 && !/<(img|iframe|canvas|video)\b/i.test(home.html) && result.phones.length === 0 && result.emails.length === 0) {
    return { ...result, state: 'parked', evidence: ['stránka je prakticky prázdná'] };
  }

  const dated = datedness(home.html, home.finalUrl, home.lastModified, footer, now, framed);
  result.datedScore = dated.score;
  result.datedReasons = dated.reasons;

  // Signs that somebody still looks after the site.
  const alive: string[] = [];
  const neglected: string[] = [];
  if (footer !== null && footer >= now - 1) alive.push(`v patičce letošní nebo loňský rok (${footer})`);
  if (footer !== null && footer <= now - 3) neglected.push(`v patičce rok ${footer}`);
  if (content !== null && content >= now - 1) alive.push(`na webu je obsah datovaný ${content}`);
  else if (content !== null && content <= now - 3) neglected.push(`poslední datovaný obsah je z roku ${content}`);
  if (home.lastModified) {
    const year = new Date(home.lastModified).getFullYear();
    if (year >= now - 1) alive.push(`stránka upravena ${year}`);
    else if (year <= now - 3) neglected.push(`stránka neměněna od ${year}`);
  }
  if (MEASURED.test(home.html)) alive.push('měří návštěvnost nebo reklamu');
  if (result.links.some((l) => l.type === 'rezervace')) alive.push('má online rezervace');

  result.state = alive.length > 0 ? 'active' : 'stale';
  result.evidence = alive.length > 0 ? alive : neglected.length > 0 ? neglected : ['nenašla se žádná známka nedávné úpravy'];
  return result;
}
