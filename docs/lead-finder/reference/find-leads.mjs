#!/usr/bin/env node
// Najde firmy se zastaralým webem a vypíše k nim e-mail a telefon do CSV.
//
// Firmy bere z OpenStreetMap (Overpass API, zdarma, bez klíče).
//
//   node find-leads.mjs --mesto Kolín kadernictvi autoservis
//   node find-leads.mjs --mesto Brno craft=plumber     (libovolný OSM tag)
//   node find-leads.mjs --mesto "Středočeský kraj,Praha" kadernictvi   (kraj nebo víc oblastí)
//   node find-leads.mjs --mesto Kolín                  (všechno, co má v OSM web)
//   node find-leads.mjs --urls weby.txt                (jen analýza vlastního seznamu URL)
//
// Přepínače: --min-score N (výchozí 3)  --out soubor.csv  --bez-webu  --pagespeed  --jen-telefon
//            --lokal "v Kolíně" (tvar města do textu e-mailu)  --podpis "Jan Novák, Weblyx, 777 123 456"

const OBORY = {
  kadernictvi: 'shop=hairdresser',
  kosmetika: 'shop=beauty',
  nehty: 'beauty=nails',
  masaze: 'shop=massage',
  tetovani: 'shop=tattoo',
  solarium: 'leisure=tanning_salon',
  restaurace: 'amenity=restaurant',
  kavarna: 'amenity=cafe',
  hotel: 'tourism=hotel',
  penzion: 'tourism=guest_house',
  autoservis: 'shop=car_repair',
  pneuservis: 'shop=tyres',
  zubar: 'amenity=dentist',
  lekar: 'amenity=doctors',
  veterinar: 'amenity=veterinary',
  instalater: 'craft=plumber',
  elektrikar: 'craft=electrician',
  truhlar: 'craft=carpenter',
  kvetinarstvi: 'shop=florist',
  realitka: 'office=estate_agent',
  ucetni: 'office=accountant',
  pravnik: 'office=lawyer',
  fitness: 'leisure=fitness_centre',
  psisalon: 'shop=pet_grooming',
  psihotel: 'amenity=animal_boarding',
  sauna: 'leisure=sauna',
  spa: 'amenity=spa',
  joga: 'leisure=yoga',
}

const args = process.argv.slice(2)
const opt = { minScore: 3, out: null, urls: null, mesto: null, bezWebu: false, pagespeed: false, jenTelefon: false }
const queries = []
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--min-score') opt.minScore = Number(args[++i])
  else if (a === '--out') opt.out = args[++i]
  else if (a === '--urls') opt.urls = args[++i]
  else if (a === '--mesto') opt.mesto = args[++i]
  else if (a === '--lokal') opt.lokal = args[++i]
  else if (a === '--podpis') opt.podpis = args[++i]
  else if (a === '--bez-webu') opt.bezWebu = true
  else if (a === '--pagespeed') opt.pagespeed = true
  else if (a === '--jen-telefon') opt.jenTelefon = true
  else queries.push(a)
}

// výchozí název podle oblasti, ať se nepřepíše jiný seznam
opt.out ??= `leady-${(opt.mesto ?? 'urls').toLowerCase().replace(/[^a-z0-9á-ž]+/gi, '-')}.csv`
const KEY = process.env.PAGESPEED_API_KEY
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const YEAR = new Date().getFullYear()
const NOT_OWN_SITE = /(^|\.)(facebook\.com|instagram\.com|firmy\.cz|zlatestranky\.cz|linktr\.ee|google\.com)$/i

const { readFile, writeFile } = await import('node:fs/promises')

if (!opt.mesto && !opt.urls) {
  console.error(
    `Použití: node find-leads.mjs --mesto Kolín [obor ...]\n       node find-leads.mjs --urls weby.txt\nObory: ${Object.keys(OBORY).join(', ')} (nebo OSM tag, např. craft=plumber)`,
  )
  process.exit(1)
}

// ---------- 1. zdroj firem ----------

const KIND_KEYS = ['craft', 'healthcare', 'leisure', 'shop', 'office', 'amenity', 'tourism']
const kindOf = (t) => {
  if (t.shop === 'beauty' && /nails/.test(t.beauty ?? '')) return 'beauty=nails'
  const key = KIND_KEYS.find((k) => t[k])
  return key ? `${key}=${t[key]}` : ''
}
// školy, úřady, kostely, památky a pobočky řetězců (tag brand) nejsou zákazníci pro nový web
const isNotBusiness = (t) =>
  Boolean(t.brand || t.historic || t.military) ||
  /^(school|kindergarten|university|college|place_of_worship|townhall|courthouse|police|fire_station|post_office|library|community_centre|social_facility|hospital|bank|atm|fuel|parking|bus_station)$/.test(t.amenity ?? '') ||
  /^(attraction|museum|information|artwork|viewpoint)$/.test(t.tourism ?? '') ||
  /^(government|political_party|religion|association|ngo)$/.test(t.office ?? '')

// Všechno s webem, co nespadá pod obory hledané zvlášť (obchody, řemesla, kanceláře, zdravotnictví,
// gastro, ubytování…) a není to obec, silnice, příroda ani jiný objekt, který není firma.
const ZBYTEK =
  '[!"shop"][!"craft"][!"office"][!"healthcare"][!"place"][!"boundary"][!"highway"][!"railway"][!"public_transport"][!"natural"][!"route"][!"waterway"][!"aeroway"]' +
  '["amenity"!~"^(restaurant|cafe|pub|bar|fast_food|dentist|doctors|veterinary|clinic|driving_school|childcare|language_school|music_school|dancing_school|car_wash|car_rental|events_venue|studio|animal_boarding|spa)$"]' +
  '["tourism"!~"^(hotel|guest_house|apartment|chalet|camp_site|hostel)$"]' +
  '["leisure"!~"^(fitness_centre|sports_centre|dance|sauna|horse_riding|bowling_alley|escape_game|park|playground|pitch|stadium|nature_reserve|garden|yoga)$"]'

async function searchOsm(mesto, obory) {
  const webTags = ['["website"]', '["contact:website"]']
  const filters = obory.length
    ? obory.flatMap((o) => {
        if (o === 'zbytek') return webTags.map((w) => `nwr(area.a)${w}${ZBYTEK};`)
        const [k, v] = (OBORY[o] ?? o).split('=')
        if (!v) throw new Error(`Neznámý obor "${o}". Známé: ${Object.keys(OBORY).join(', ')}`)
        const base = v === '*' ? `nwr(area.a)["${k}"]` : `nwr(area.a)["${k}"="${v}"]`
        return opt.bezWebu ? [`${base};`] : webTags.map((w) => `${base}${w};`)
      })
    : webTags.map((w) => `nwr(area.a)${w};`)
  // velký dotaz (kraj × desítky oborů) veřejný server neunese, proto po menších dávkách
  const elements = []
  for (let i = 0; i < filters.length; i += 8) {
    const part = await overpass(mesto, filters.slice(i, i + 8))
    elements.push(...part)
    if (filters.length > 8) console.error(`  OSM dávka ${i / 8 + 1}/${Math.ceil(filters.length / 8)}: ${part.length} objektů`)
  }
  return elements.filter(({ tags: t = {} }) => !isNotBusiness(t)).map(({ tags: t = {} }) => {
    const web = t.website ?? t['contact:website'] ?? ''
    return {
      name: t.name ?? '',
      kind: kindOf(t),
      web: web && !/^https?:/i.test(web) ? `http://${web}` : web,
      phone: t.phone ?? t['contact:phone'] ?? t['contact:mobile'] ?? '',
      email: (t.email ?? t['contact:email'] ?? '').toLowerCase(),
      address: [[t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' '), t['addr:city']]
        .filter(Boolean)
        .join(', '),
    }
  })
}

async function overpass(mesto, filters) {
  const query = `[out:json][timeout:150];
(${mesto
    .split(',')
    .map((m) => `area["name"="${m.trim().replace(/"/g, '')}"]["boundary"="administrative"];`)
    .join('')})->.a;
(${filters.join('')});
out tags;`
  // veřejné Overpass servery bývají přetížené, proto zkoušíme postupně víc zrcadel
  const main = 'https://overpass-api.de/api/interpreter'
  const servers = [...Array(10).fill(main), 'https://overpass.kumi.systems/api/interpreter']
  let data, lastError
  for (const server of servers) {
    try {
      const res = await fetch(server, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'lead-finder/1.0' },
        body: 'data=' + encodeURIComponent(query),
        signal: AbortSignal.timeout(170000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      data = await res.json()
      break
    } catch (err) {
      lastError = err
      console.error(`  ${new URL(server).host}: ${err.message}, zkouším znovu`)
      await new Promise((r) => setTimeout(r, 20000))
    }
  }
  if (!data) {
    console.error(`  Overpass API nedostupné (${lastError.message}), tuhle dávku přeskakuji`)
    return []
  }
  return data.elements
}

// ---------- 2. analýza webu ----------

async function fetchHtml(url, timeout = 12000) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'cs,en;q=0.8' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const charset =
    /charset=([\w-]+)/i.exec(res.headers.get('content-type') ?? '')?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(buf.subarray(0, 2048).toString('latin1'))?.[1] ??
    'utf-8'
  let html
  try {
    html = new TextDecoder(charset).decode(buf)
  } catch {
    html = buf.toString('utf8')
  }
  return { html, finalUrl: res.url, lastModified: res.headers.get('last-modified') }
}

function scoreHtml(html, finalUrl, lastModified) {
  const reasons = []
  let score = 0
  const add = (points, reason) => {
    score += points
    reasons.push(reason)
  }

  if (!/<meta[^>]+name=["']?viewport/i.test(html)) add(3, 'není responzivní (chybí viewport)')
  if (finalUrl.startsWith('http://')) add(2, 'bez HTTPS')

  const years = []
  for (const m of html.matchAll(/(?:©|&copy;|&#169;|copyright)[^<]{0,40}/gi)) {
    for (const y of m[0].matchAll(/\b(19\d\d|20\d\d)\b/g)) years.push(Number(y[1]))
  }
  const footerYear = Math.max(...years.filter((y) => y <= YEAR))
  if (Number.isFinite(footerYear) && footerYear <= YEAR - 3) add(2, `patička © ${footerYear}`)

  const generator = /<meta[^>]+name=["']generator["'][^>]+content=["']([^"']+)/i.exec(html)?.[1] ?? ''
  const wp = /WordPress (\d+)\./i.exec(generator)
  if (wp && Number(wp[1]) < 6) add(2, `starý ${generator}`)
  if (/Joomla!? [12]\./i.test(generator)) add(2, `starý ${generator}`)

  if (/jquery[-./]1\.\d+/i.test(html)) add(1, 'jQuery 1.x')
  if (/\.swf\b/i.test(html)) add(3, 'Flash')
  if (/<(frameset|font|center|marquee)\b/i.test(html)) add(2, 'zastaralé HTML (font/center/frameset)')
  if ((html.match(/<table\b/gi) ?? []).length >= 5) add(1, 'layout v tabulkách')
  if (!/property=["']og:/i.test(html)) add(1, 'chybí OG tagy')

  if (lastModified) {
    const age = (Date.now() - new Date(lastModified).getTime()) / (365 * 864e5)
    if (age >= 3) add(1, `neměněno od ${new Date(lastModified).getFullYear()}`)
  }
  return { score, reasons }
}

async function pagespeedScore(url) {
  const api = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
  api.searchParams.set('url', url)
  api.searchParams.set('strategy', 'mobile')
  if (KEY) api.searchParams.set('key', KEY)
  try {
    const res = await fetch(api, { signal: AbortSignal.timeout(60000) })
    if (!res.ok) return null
    const perf = (await res.json()).lighthouseResult?.categories?.performance?.score
    return perf == null ? null : Math.round(perf * 100)
  } catch {
    return null
  }
}

// ---------- 3. kontakty ----------

function decodeCfEmail(hex) {
  const key = parseInt(hex.slice(0, 2), 16)
  let out = ''
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ key)
  return out
}

function extractEmails(html) {
  let text = html
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s*[[(]\s*(?:at|zavin[aá][cč])\s*[\])]\s*/gi, '@')
  for (const m of html.matchAll(/data-cfemail=["']([0-9a-f]+)["']/gi)) text += ' ' + decodeCfEmail(m[1])
  const found = text.replace(/%20/g, ' ').match(/[a-z0-9._+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) ?? []
  return [...new Set(found.map((e) => e.toLowerCase()))].filter(
    (e) =>
      !/\.(png|jpe?g|gif|webp|svg|js|css)$/.test(e) &&
      !/(sentry|wixpress|example\.|domena\.cz|vas@|vase@|jmeno@|name@)/.test(e),
  )
}

function extractPhone(html) {
  // 1. href=tel: link (most reliable)
  const tel = /href=["']tel:([^"']+)/i.exec(html)?.[1]
  if (tel) return decodeURIComponent(tel).trim()
  // 2. text patterns: +420 777 123 456, tel: 777 123 456, tel.: 777123456
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')
  const m = text.match(/(?:tel(?:efon)?\.?\s*:?\s*|phone\s*:?\s*|\+420\s*)(\+?420)?[\s.-]*(\d{3})[\s.-]*(\d{3})[\s.-]*(\d{3})\b/)
  if (m) {
    const digits = (m[1] || '+420').replace(/\s/g, '') + ' ' + m[2] + ' ' + m[3] + ' ' + m[4]
    return digits.startsWith('+') ? digits : '+420 ' + m[2] + ' ' + m[3] + ' ' + m[4]
  }
  return ''
}

function contactLinks(html, baseUrl) {
  const links = new Set()
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]{0,80}?)<\/a>/gi)) {
    if (!/kontakt|contact|napiste|napište/i.test(m[1] + ' ' + m[2])) continue
    try {
      const u = new URL(m[1], baseUrl)
      if (u.protocol.startsWith('http') && u.host === new URL(baseUrl).host) links.add(u.href)
    } catch {}
  }
  return [...links].slice(0, 2)
}

async function analyze(lead) {
  const result = { ...lead, email: lead.email ?? '', score: 0, reasons: [] }
  let host = ''
  try {
    host = new URL(lead.web).hostname.replace(/^www\./, '')
  } catch {}

  if (!lead.web || NOT_OWN_SITE.test(host)) {
    result.score = 99
    result.reasons = [lead.web ? 'jen profil na sociální síti / v katalogu' : 'nemá web']
    result.noSite = true
    return result
  }

  let page
  try {
    // rozbité HTTPS (certifikát, port 443) ještě neznamená mrtvý web, zkusíme i http
    page = await fetchHtml(lead.web).catch((err) => {
      if (!lead.web.startsWith('https://') || /^HTTP \d/.test(err.message)) throw err
      return fetchHtml(lead.web.replace('https://', 'http://'))
    })
  } catch (e) {
    const err = { message: e.cause?.code ?? e.message }
    // blokace bota nebo timeout neznamená rozbitý web, takový lead vynecháme
    if (/HTTP (401|403|429)|timeout/i.test(err.message)) {
      result.reasons = [`nelze ověřit (${err.message})`]
      return result
    }
    result.score = 5
    result.reasons = [`web nefunguje (${err.message})`]
    result.deadWeb = true
    return result
  }

  const scored = scoreHtml(page.html, page.finalUrl, page.lastModified)
  result.score = scored.score
  result.reasons = scored.reasons

  let emails = [...new Set([...(lead.email ? [lead.email] : []), ...extractEmails(page.html)])]
  let phone = extractPhone(page.html)
  for (const link of contactLinks(page.html, page.finalUrl)) {
    try {
      const sub = await fetchHtml(link, 8000)
      emails = [...new Set([...emails, ...extractEmails(sub.html)])]
      phone ||= extractPhone(sub.html)
    } catch {}
  }
  // adresy na doméně firmy mají přednost před gmail/seznam apod.
  emails.sort((a, b) => Number(b.endsWith('@' + host)) - Number(a.endsWith('@' + host)))
  result.email = emails.slice(0, 2).join(', ')
  // web phone has priority over OSM phone (OSM data can be stale)
  if (phone) result.phone = phone
  // fallback to OSM phone if web didn't have one
  // (result.phone already has OSM value from lead data)

  if (opt.pagespeed && result.score >= opt.minScore - 2) {
    const perf = await pagespeedScore(page.finalUrl)
    if (perf != null && perf < 50) {
      result.score += 2
      result.reasons.push(`PageSpeed mobil ${perf}/100`)
    }
  }
  return result
}

// ---------- běh ----------

async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await worker(items[i], i)
      }
    }),
  )
  return results
}

let leads = []
if (opt.urls) {
  const lines = (await readFile(opt.urls, 'utf8')).split('\n').map((l) => l.trim()).filter(Boolean)
  leads = lines.map((l) => ({ name: '', web: /^https?:/.test(l) ? l : `http://${l}`, phone: '', address: '' }))
} else {
  leads = await searchOsm(opt.mesto, queries)
  console.error(`${opt.mesto}${queries.length ? ` (${queries.join(', ')})` : ''}: ${leads.length} firem z OpenStreetMap`)
}

const seen = new Set()
leads = leads.filter((l) => {
  const key = l.web ? l.web.replace(/^https?:\/\/(www\.)?/, '').split(/[/?#]/)[0].toLowerCase() : `${l.name}|${l.phone}`
  if (NOT_OWN_SITE.test(key)) return true
  if (seen.has(key)) return false
  seen.add(key)
  return true
})

let done = 0
const analyzed = await pool(leads, 12, async (lead) => {
  const r = await analyze(lead)
  process.stderr.write(`\r  analyzováno ${++done}/${leads.length}`)
  return r
})
process.stderr.write('\n')

const rows = analyzed
  .filter((r) => (r.noSite ? opt.bezWebu && (r.email || r.phone) : r.score >= opt.minScore))
  .filter((r) => !r.deadWeb)  // dead websites have unreliable OSM-only phone numbers
  .filter((r) => !opt.jenTelefon || r.phone)

// Fisher-Yates shuffle — operátorky volají postupně, náhodné pořadí zabrání
// tomu, aby dvě operátorky volaly stejné firmy ze začátku seznamu
for (let i = rows.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [rows[i], rows[j]] = [rows[j], rows[i]]
}

// ---------- text oslovení ----------

// obor (2. pád po "při hledání"), co má web obsahovat, koho přivede
const SLUZBY = ['přehledem služeb, referencemi a kontaktem', 'nové zakázky']
const SALON = ['ceníkem, možností objednání a fotkami vaší práce', 'nové zákaznice a zákazníky']
const GASTRO = ['nabídkou, otevírací dobou a pár fotkami', 'nové hosty']
const UBYTOVANI = ['fotkami pokojů, ceníkem a možností rezervace', 'nové hosty']
const ORDINACE = ['ordinačními hodinami, přehledem péče a kontaktem', 'nové pacienty']
const OBCHOD = ['sortimentem, otevírací dobou a kontaktem', 'nové zákazníky']
const SERVIS = ['přehledem služeb, ceníkem a možností objednání', 'nové zákazníky']
const OBOR_TEXT = {
  'shop=hairdresser': ['kadeřnictví', ...SALON],
  'shop=beauty': ['kosmetického salonu', ...SALON],
  'shop=massage': ['masáží', ...SALON],
  'beauty=nails': ['nehtového studia', ...SALON],
  'leisure=tanning_salon': ['solária', 'ceníkem, otevírací dobou a možností objednání', 'nové zákazníky'],
  'shop=tattoo': ['tetovacího studia', ...SALON],
  'amenity=restaurant': ['restaurace', 'jídelním lístkem, otevírací dobou a pár fotkami', 'nové hosty'],
  'amenity=cafe': ['kavárny', ...GASTRO],
  'amenity=pub': ['hospody', ...GASTRO],
  'amenity=bar': ['baru', ...GASTRO],
  'amenity=fast_food': ['občerstvení', ...GASTRO],
  'shop=bakery': ['pekárny', ...GASTRO.slice(0, 1), 'nové zákazníky'],
  'shop=confectionery': ['cukrárny', ...GASTRO.slice(0, 1), 'nové zákazníky'],
  'tourism=hotel': ['hotelu', ...UBYTOVANI],
  'tourism=guest_house': ['penzionu', ...UBYTOVANI],
  'tourism=apartment': ['ubytování', ...UBYTOVANI],
  'tourism=hostel': ['ubytování', ...UBYTOVANI],
  'shop=car_repair': ['autoservisu', ...SERVIS],
  'shop=tyres': ['pneuservisu', ...SERVIS],
  'shop=car': ['prodejce aut', 'aktuální nabídkou vozů, fotkami a kontaktem', 'nové zájemce'],
  'amenity=driving_school': ['autoškoly', 'přehledem kurzů, ceníkem a termíny', 'nové žáky'],
  'amenity=dentist': ['zubní ordinace', ...ORDINACE],
  'amenity=doctors': ['lékaře', ...ORDINACE],
  'amenity=clinic': ['ordinace', ...ORDINACE],
  'healthcare=doctor': ['lékaře', ...ORDINACE],
  'healthcare=dentist': ['zubní ordinace', ...ORDINACE],
  'healthcare=physiotherapist': ['fyzioterapie', ...ORDINACE.slice(0, 1), 'nové klienty'],
  'healthcare=psychotherapist': ['psychoterapie', ...ORDINACE.slice(0, 1), 'nové klienty'],
  'amenity=veterinary': ['veterináře', 'ordinačními hodinami, přehledem služeb a kontaktem', 'nové klienty'],
  'craft=builder': ['stavební firmy', ...SLUZBY],
  'office=construction_company': ['stavební firmy', ...SLUZBY],
  'craft=bricklayer': ['zedníka', ...SLUZBY],
  'craft=tiler': ['obkladače', ...SLUZBY],
  'craft=hvac': ['topenáře a klimatizací', ...SLUZBY],
  'craft=gardener': ['zahradníka', ...SLUZBY],
  'craft=metal_construction': ['zámečnictví', ...SLUZBY],
  'craft=window_construction': ['výrobce oken a dveří', ...SLUZBY],
  'craft=cleaning': ['úklidových služeb', ...SLUZBY],
  'office=cleaning': ['úklidových služeb', ...SLUZBY],
  'office=notary': ['notáře', 'přehledem služeb a kontaktem', 'nové klienty'],
  'craft=plumber': ['instalatéra', ...SLUZBY],
  'craft=electrician': ['elektrikáře', ...SLUZBY],
  'craft=carpenter': ['truhláře', ...SLUZBY],
  'craft=painter': ['malíře pokojů', ...SLUZBY],
  'craft=roofer': ['pokrývače', ...SLUZBY],
  'craft=photographer': ['fotografa', 'ukázkami práce, ceníkem a kontaktem', 'nové zakázky'],
  'shop=travel_agency': ['cestovní kanceláře', 'nabídkou zájezdů, ceníkem a kontaktem', 'nové klienty'],
  'shop=dry_cleaning': ['čistírny', ...SERVIS],
  'shop=laundry': ['prádelny', ...SERVIS],
  'shop=tailor': ['krejčovství', ...SERVIS],
  'shop=jewelry': ['klenotnictví', ...OBCHOD],
  'shop=clothes': ['obchodu s oblečením', ...OBCHOD],
  'shop=shoes': ['obchodu s obuví', ...OBCHOD],
  'shop=pet': ['chovatelských potřeb', ...OBCHOD],
  'shop=bicycle': ['cykloprodejny a servisu', ...OBCHOD],
  'shop=furniture': ['prodejny nábytku', ...OBCHOD],
  'shop=car_parts': ['prodejny autodílů', ...OBCHOD],
  'shop=computer': ['počítačového servisu', ...SERVIS],
  'shop=funeral_directors': ['pohřební služby', 'přehledem služeb, ceníkem a kontaktem', 'nové klienty'],
  'office=architect': ['architekta', 'ukázkami práce, referencemi a kontaktem', 'nové zakázky'],
  'office=it': ['IT služeb', ...SLUZBY],
  'office=company': ['firem a služeb', ...SLUZBY],
  'amenity=childcare': ['hlídání dětí', 'přehledem služeb, ceníkem a kontaktem', 'nové klienty'],
  'amenity=language_school': ['jazykové školy', 'přehledem kurzů, ceníkem a termíny', 'nové studenty'],
  'amenity=music_school': ['hudební školy', 'přehledem kurzů, ceníkem a termíny', 'nové žáky'],
  'amenity=dancing_school': ['taneční školy', 'přehledem kurzů, ceníkem a termíny', 'nové žáky'],
  'leisure=dance': ['taneční školy', 'přehledem kurzů, ceníkem a termíny', 'nové žáky'],
  'amenity=car_wash': ['myčky aut', ...SERVIS],
  'amenity=car_rental': ['půjčovny aut', 'nabídkou vozů, ceníkem a možností rezervace', 'nové zákazníky'],
  'tourism=camp_site': ['kempu', ...UBYTOVANI],
  'tourism=chalet': ['chaty k pronájmu', ...UBYTOVANI],
  'shop=florist': ['květinářství', ...GASTRO.slice(0, 1), 'nové zákazníky'],
  'shop=optician': ['optiky', ...OBCHOD],
  'shop=copyshop': ['kopírovacích a tiskových služeb', ...SERVIS],
  'office=estate_agent': ['realitní kanceláře', 'nabídkou nemovitostí, referencemi a kontaktem', 'nové klienty'],
  'office=accountant': ['účetní', 'přehledem služeb, ceníkem a kontaktem', 'nové klienty'],
  'office=tax_advisor': ['daňového poradce', 'přehledem služeb, ceníkem a kontaktem', 'nové klienty'],
  'office=lawyer': ['advokáta', 'přehledem služeb, referencemi a kontaktem', 'nové klienty'],
  'office=insurance': ['pojišťovacího poradce', 'přehledem služeb, referencemi a kontaktem', 'nové klienty'],
  'office=financial': ['finančního poradce', 'přehledem služeb, referencemi a kontaktem', 'nové klienty'],
  'leisure=fitness_centre': ['fitness centra', 'rozvrhem, ceníkem a pár fotkami', 'nové členy'],
  'leisure=sports_centre': ['sportovního centra', 'rozvrhem, ceníkem a pár fotkami', 'nové návštěvníky'],
  'shop=pet_grooming': ['psího salonu', 'přehledem služeb, ceníkem a fotkami proměn', 'nové zákazníky'],
  'amenity=animal_boarding': ['psího hotelu', 'přehledem služeb, ceníkem a fotkami', 'nové zákazníky'],
  'leisure=sauna': ['sauny', 'přehledem služeb, ceníkem a otevírací dobou', 'nové návštěvníky'],
  'amenity=spa': ['wellness centra', 'přehledem procedur, ceníkem a fotkami', 'nové klienty'],
  'leisure=yoga': ['jóga studia', 'rozvrhem lekcí, ceníkem a fotkami', 'nové klienty'],
}
const OBOR_FALLBACK = {
  craft: ['řemeslníků', ...SLUZBY],
  shop: ['obchodů', ...OBCHOD],
}
const OBOR_DEFAULT = ['firem a služeb', 'kontaktem, nabídkou a pár fotkami', 'nové poptávky']

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function buildEmail(r) {
  const [gen, obsah, zisk] = OBOR_TEXT[r.kind] ?? OBOR_FALLBACK[(r.kind ?? '').split('=')[0]] ?? OBOR_DEFAULT
  const lokal = opt.lokal ?? (opt.mesto ? `ve městě ${opt.mesto}` : 'na internetu')
  const reasons = r.reasons.join(' | ')
  const year = /patička © (\d{4})/.exec(reasons)?.[1]

  let problem
  if (r.noSite) problem = r.web ? 'nemáte vlastní web, jen profil na sociálních sítích' : 'nemáte vlastní web'
  else if (/web nefunguje/.test(reasons)) problem = `váš web ${hostOf(r.web)} se mi nepodařilo načíst`
  else if (/není responzivní/.test(reasons)) problem = 'váš web není úplně aktuální a na mobilu se špatně zobrazuje'
  else if (/bez HTTPS/.test(reasons)) problem = 'váš web není úplně aktuální a prohlížeč ho označuje jako nezabezpečený'
  else if (year) problem = `váš web není úplně aktuální (v patičce je stále rok ${year})`
  else problem = 'váš web není úplně aktuální'

  const who = r.name || `váš web ${hostOf(r.web)}`
  return {
    obor: gen,
    subject: r.name ? `Návrh nového webu pro ${r.name}` : 'Návrh nového webu',
    body: [
      'Dobrý den,',
      `narazil jsem na ${who} při hledání ${gen} ${lokal} a všiml jsem si, že ${problem}.`,
      `Dnes většina zákazníků hledá služby nejdřív na internetu, a jednoduchý, přehledný web ${/^[sz]/i.test(obsah) ? 'se' : 's'} ${obsah} vám může přivést ${zisk}.`,
      'Rád vám připravím návrh webu nezávazně a zdarma, ať vidíte, jak by mohl vypadat. Pokud se vám zalíbí, domluvíme se na detailech.',
      'Máte zájem, abych vám návrh poslal?',
      opt.podpis,
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}
for (const r of rows) r.mail = buildEmail(r)

const leadType = (r) => r.noSite ? 'no_web' : 'bad_web'
// problémy webu v češtině pro operátorku — co říct při hovoru
const PROBLEM_CZ = {
  'není responzivní (chybí viewport)': 'Web se špatně zobrazuje na mobilu',
  'bez HTTPS': 'Web nemá zabezpečení (HTTPS)',
  'zastaralé HTML (font/center/frameset)': 'Web používá zastaralou technologii',
  'layout v tabulkách': 'Web používá zastaralý layout',
  'chybí OG tagy': 'Web se špatně zobrazuje na sociálních sítích',
  'Flash': 'Web používá Flash (nefunguje)',
  'jQuery 1.x': 'Web používá zastaralé knihovny',
}
const problemyCz = (r) => {
  if (r.noSite) return r.web ? 'Nemá vlastní web, jen sociální sítě' : 'Nemá žádný web'
  return r.reasons.map((reason) => {
    if (PROBLEM_CZ[reason]) return PROBLEM_CZ[reason]
    if (/web nefunguje/.test(reason)) return 'Web nefunguje'
    if (/patička © \d+/.test(reason)) return reason.replace('patička', 'Patička webu')
    if (/starý /.test(reason)) return 'Web běží na zastaralém systému'
    if (/neměněno od/.test(reason)) return reason.replace('neměněno', 'Web neměněn')
    if (/PageSpeed/.test(reason)) return 'Web je pomalý na mobilu'
    return reason
  }).join(', ')
}

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const csv = [
  ['firma', 'web', 'email', 'telefon', 'adresa', 'skore', 'typ_leadu', 'problemy_webu', 'duvody', 'predmet', 'text_emailu'].join(';'),
  ...rows.map((r) =>
    [r.name, r.web, r.email, r.phone, r.address, r.noSite ? '' : r.score, leadType(r), problemyCz(r), r.reasons.join(' | '), r.mail.subject, r.mail.body]
      .map(cell)
      .join(';'),
  ),
].join('\r\n')

await writeFile(opt.out, '﻿' + csv)
const withEmail = rows.filter((r) => r.email).length
const withPhone = rows.filter((r) => r.phone).length

// ---------- HTML přehled ----------

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const host = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
const scoreClass = (r) => (r.noSite ? 'none' : r.score >= 7 ? 'high' : r.score >= 5 ? 'mid' : 'low')
const title = `Leady – ${opt.mesto ?? opt.urls}${queries.length ? ` (${queries.join(', ')})` : ''}`

const htmlRows = rows
  .map((r) => {
    const emails = r.email ? r.email.split(', ') : []
    const phones = r.phone ? r.phone.split(/\s*[;,]\s*/).filter(Boolean) : []
    return `<tr class="lead" data-email="${emails.length ? 1 : 0}" data-phone="${phones.length ? 1 : 0}">
<td class="score"><span class="badge ${scoreClass(r)}">${r.noSite ? '–' : r.score}</span></td>
<td><div class="name">${esc(r.name || host(r.web))}</div>${r.address ? `<div class="muted">${esc(r.address)}</div>` : ''}</td>
<td>${r.web ? `<a href="${esc(r.web)}" target="_blank" rel="noopener noreferrer">${esc(host(r.web))} ↗</a>` : '<span class="muted">bez webu</span>'}</td>
<td>${emails.map((e) => `<a class="email" href="mailto:${esc(e)}">${esc(e)}</a>`).join('<br>') || '<span class="muted">–</span>'}</td>
<td class="nowrap">${phones.map((p) => `<a href="tel:${esc(p.replace(/\s/g, ''))}">${esc(p)}</a>`).join('<br>') || '<span class="muted">–</span>'}</td>
<td>${r.reasons.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</td>
</tr>
<tr class="mail" data-email="${emails.length ? 1 : 0}" data-phone="${phones.length ? 1 : 0}"><td></td><td colspan="5">
<div class="subject"><span class="muted">Předmět:</span> <span class="subj">${esc(r.mail.subject)}</span></div>
<details><summary>Text oslovení</summary>
<pre>${esc(r.mail.body)}</pre>
</details>
<div class="actions">
${emails.length ? `<a class="btn" href="mailto:${esc(emails[0])}?subject=${encodeURIComponent(r.mail.subject)}&amp;body=${encodeURIComponent(r.mail.body)}">Napsat e-mail</a>` : ''}
<button class="copy" data-what=".subj">Kopírovat předmět</button>
<button class="copy" data-what="pre">Kopírovat text</button>
</div>
</td></tr>`
  })
  .join('\n')

const html = `<!doctype html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
:root { --bg:#f6f7f9; --card:#fff; --text:#1a1d23; --muted:#6b7280; --line:#e5e7eb; --link:#1d4ed8; --chip:#eef0f3;
  --high:#dc2626; --mid:#d97706; --low:#2563eb; --none:#6b7280; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#0f1115; --card:#181b21; --text:#e6e8ec; --muted:#9aa1ad; --line:#2a2e37; --link:#7aa7ff; --chip:#242833;
    --high:#f87171; --mid:#fbbf24; --low:#60a5fa; --none:#9aa1ad; }
}
* { box-sizing: border-box; }
body { margin:0; padding:24px 16px 48px; background:var(--bg); color:var(--text);
  font:14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.wrap { max-width:1280px; margin:0 auto; }
h1 { font-size:22px; margin:0 0 4px; }
.sub { color:var(--muted); margin-bottom:16px; }
.bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:12px; }
.bar input[type=search] { flex:1 1 240px; padding:9px 12px; border:1px solid var(--line); border-radius:8px;
  background:var(--card); color:var(--text); font:inherit; }
.bar label { display:flex; gap:6px; align-items:center; color:var(--muted); white-space:nowrap; }
button { padding:9px 14px; border:1px solid var(--line); border-radius:8px; background:var(--card); color:var(--text);
  font:inherit; cursor:pointer; }
button:hover { border-color:var(--link); }
.card { background:var(--card); border:1px solid var(--line); border-radius:12px; overflow-x:auto; }
table { width:100%; border-collapse:collapse; }
th { text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:.04em; color:var(--muted);
  padding:10px 12px; border-bottom:1px solid var(--line); position:sticky; top:0; background:var(--card); }
td { padding:10px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
tr:last-child td { border-bottom:0; }
tr[hidden] { display:none; }
tr.lead td { border-bottom:0; padding-bottom:4px; }
tr.mail td { padding-top:0; }
tr.mail td > details { display:inline-block; vertical-align:top; max-width:760px; }
summary { cursor:pointer; color:var(--link); padding:6px 0; }
.subject { font-weight:600; margin:2px 0; }
pre { margin:0 0 8px; padding:12px 14px; background:var(--chip); border-radius:8px; white-space:pre-wrap; font:inherit; }
.actions { display:inline-flex; gap:8px; margin-left:12px; vertical-align:top; }
.btn, .actions button { padding:5px 12px; border:1px solid var(--line); border-radius:8px; background:var(--card);
  color:var(--text); font-size:13px; }
.btn:hover { border-color:var(--link); text-decoration:none; }
a { color:var(--link); text-decoration:none; }
a:hover { text-decoration:underline; }
.name { font-weight:600; }
.muted { color:var(--muted); font-size:13px; }
.nowrap { white-space:nowrap; }
.score { width:1%; }
.badge { display:inline-block; min-width:30px; padding:3px 8px; border-radius:999px; text-align:center; font-weight:700;
  color:#fff; background:var(--none); }
.badge.high { background:var(--high); } .badge.mid { background:var(--mid); } .badge.low { background:var(--low); }
@media (prefers-color-scheme: dark) { .badge { color:#0f1115; } }
.chip { display:inline-block; margin:0 4px 4px 0; padding:2px 8px; border-radius:6px; background:var(--chip); font-size:12px; }
</style>
</head>
<body>
<div class="wrap">
<h1>${esc(title)}</h1>
<div class="sub">${rows.length} leadů z ${leads.length} prověřených firem · ${withPhone} s telefonem · ${withEmail} s e-mailem · vygenerováno ${new Date().toLocaleDateString('cs-CZ')} · skóre: čím vyšší, tím zastaralejší web</div>
<div class="bar">
<input type="search" id="q" placeholder="Hledat firmu, web, e-mail, důvod…">
<label><input type="checkbox" id="onlyEmail"> jen s e-mailem</label>
<label><input type="checkbox" id="onlyPhone"> jen s telefonem</label>
<button id="copy">Kopírovat e-maily</button>
<span class="muted" id="count"></span>
</div>
<div class="card">
<table>
<thead><tr><th>Skóre</th><th>Firma</th><th>Web</th><th>E-mail</th><th>Telefon</th><th>Proč je web zastaralý</th></tr></thead>
<tbody id="rows">
${htmlRows}
</tbody>
</table>
</div>
</div>
<script>
const q = document.getElementById('q'), onlyEmail = document.getElementById('onlyEmail'),
  onlyPhone = document.getElementById('onlyPhone'), count = document.getElementById('count'),
  trs = [...document.querySelectorAll('#rows tr.lead')]
function apply() {
  const needle = q.value.trim().toLowerCase()
  let shown = 0
  for (const tr of trs) {
    const ok = (!needle || tr.textContent.toLowerCase().includes(needle)) &&
      (!onlyEmail.checked || tr.dataset.email === '1') && (!onlyPhone.checked || tr.dataset.phone === '1')
    tr.hidden = !ok
    tr.nextElementSibling.hidden = !ok
    if (ok) shown++
  }
  count.textContent = 'zobrazeno ' + shown + ' z ' + trs.length
}
q.addEventListener('input', apply); onlyEmail.addEventListener('change', apply); onlyPhone.addEventListener('change', apply)
document.getElementById('copy').addEventListener('click', async (e) => {
  const emails = [...new Set(trs.filter((tr) => !tr.hidden).flatMap((tr) => [...tr.querySelectorAll('a.email')].map((a) => a.textContent)))]
  await navigator.clipboard.writeText(emails.join('\\n'))
  e.target.textContent = 'Zkopírováno (' + emails.length + ')'
  setTimeout(() => (e.target.textContent = 'Kopírovat e-maily'), 2000)
})
document.getElementById('rows').addEventListener('click', async (e) => {
  if (!e.target.classList.contains('copy')) return
  const label = e.target.textContent
  await navigator.clipboard.writeText(e.target.closest('tr').querySelector(e.target.dataset.what).textContent)
  e.target.textContent = 'Zkopírováno'
  setTimeout(() => (e.target.textContent = label), 2000)
})
apply()
</script>
</body>
</html>
`
const htmlOut = opt.out.replace(/\.csv$/i, '') + '.html'
await writeFile(htmlOut, html)

console.error(`Hotovo: ${rows.length} leadů z ${leads.length} firem (${withPhone} s telefonem, ${withEmail} s e-mailem) → ${opt.out}, ${htmlOut}`)
