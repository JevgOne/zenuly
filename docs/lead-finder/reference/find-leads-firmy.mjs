#!/usr/bin/env node
// Najde firmy na firmy.cz (Seznam.cz byznys adresář) a vypíše k nim telefon,
// email a adresu do CSV — stejný formát jako find-leads.mjs.
//
// Hlavní smysl: získat TELEFONY pro firmy, které v OSM telefon nemají.
// Data se parsují z JSON-LD (schema.org LocalBusiness) přímo v HTML.
//
//   node find-leads-firmy.mjs --kategorie kadernictvi --kraj praha
//   node find-leads-firmy.mjs --kategorie kadernictvi,masaze --kraj vsechny
//   node find-leads-firmy.mjs --kategorie kadernictvi --kraj praha --jen-telefon
//   node find-leads-firmy.mjs --kategorie kadernictvi --kraj praha --dedup-csv leady.csv
//   node find-leads-firmy.mjs --kategorie kadernictvi --kraj praha --out firmy-kadernictvi-praha.csv
//
// Přepínače: --jen-telefon (výchozí ON)  --out soubor.csv  --dedup-csv soubor.csv  --max-pages N  --delay N

import { writeFile, readFile } from 'node:fs/promises'
import { get } from 'node:https'

// ---------- Kategorie (ověřené URL cesty na firmy.cz) ----------

const KATEGORIE = {
  kadernictvi: 'Remesla-a-sluzby/Sluzby-pece-o-telo/Kadernictvi',
  kosmetika: 'Remesla-a-sluzby/Sluzby-pece-o-telo/Kosmeticke-salony',
  masaze: 'Remesla-a-sluzby/Sluzby-pece-o-telo/Masazni-salony',
  nehty: 'Remesla-a-sluzby/Sluzby-pece-o-telo/Kosmeticke-salony/Nehtova-studia',
  fitness: 'Sport/Fitness-centra-a-posilovny',
  kvetinarstvi: 'Obchody-a-nakupovani/Kvetiny-a-kvetinarstvi',
  psisalon: 'Remesla-a-sluzby/Sluzby-pro-zvirata/Salony-pro-psy',
  joga: 'Sport/Joga',
  sauna: 'Remesla-a-sluzby/Sluzby-pece-o-telo/Sauny-a-solaria',
  spa: 'Remesla-a-sluzby/Sluzby-pece-o-telo/Wellness',
}

const KRAJE = {
  praha: 'kraj-praha',
  stredocesky: 'kraj-stredocesky',
  jihocesky: 'kraj-jihocesky',
  plzensky: 'kraj-plzensky',
  karlovarsky: 'kraj-karlovarsky',
  ustecky: 'kraj-ustecky',
  liberecky: 'kraj-liberecky',
  kralovehradecky: 'kraj-kralovehradecky',
  pardubicky: 'kraj-pardubicky',
  vysocina: 'kraj-vysocina',
  jihomoravsky: 'kraj-jihomoravsky',
  olomoucky: 'kraj-olomoucky',
  moravskoslezsky: 'kraj-moravskoslezsky',
  zlinsky: 'kraj-zlinsky',
}

// Mapování kategorie → obor text (2. pád, obsah webu, koho přivede)
const OBOR_TEXT = {
  kadernictvi: ['kadeřnictví', 'ceníkem, možností objednání a fotkami vaší práce', 'nové zákaznice a zákazníky'],
  kosmetika: ['kosmetického salonu', 'ceníkem, možností objednání a fotkami vaší práce', 'nové zákaznice a zákazníky'],
  masaze: ['masáží', 'ceníkem, možností objednání a fotkami vaší práce', 'nové zákaznice a zákazníky'],
  nehty: ['nehtového studia', 'ceníkem, možností objednání a fotkami vaší práce', 'nové zákaznice a zákazníky'],
  fitness: ['fitness centra', 'rozvrhem, ceníkem a pár fotkami', 'nové členy'],
  kvetinarstvi: ['květinářství', 'nabídkou, otevírací dobou a pár fotkami', 'nové zákazníky'],
  psisalon: ['psího salonu', 'přehledem služeb, ceníkem a fotkami proměn', 'nové zákazníky'],
  joga: ['jóga studia', 'rozvrhem lekcí, ceníkem a fotkami', 'nové klienty'],
  sauna: ['sauny', 'přehledem služeb, ceníkem a otevírací dobou', 'nové návštěvníky'],
  spa: ['wellness centra', 'přehledem procedur, ceníkem a fotkami', 'nové klienty'],
}
const OBOR_DEFAULT = ['firem a služeb', 'kontaktem, nabídkou a pár fotkami', 'nové poptávky']

// ---------- CLI parsing ----------

const args = process.argv.slice(2)
const opt = {
  kategorie: [],
  kraje: [],
  out: null,
  dedupCsv: null,
  jenTelefon: true, // default ON — celý smysl je telefony
  maxPages: 50,
  delay: 2000,
  podpis: null,
  lokal: null,
}

for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--kategorie' && args[i + 1]) {
    opt.kategorie = args[++i].split(',').map((k) => k.trim().toLowerCase())
  } else if (a === '--kraj' && args[i + 1]) {
    const v = args[++i].toLowerCase()
    opt.kraje = v === 'vsechny' ? Object.keys(KRAJE) : v.split(',').map((k) => k.trim())
  } else if (a === '--out' && args[i + 1]) {
    opt.out = args[++i]
  } else if (a === '--dedup-csv' && args[i + 1]) {
    opt.dedupCsv = args[++i]
  } else if (a === '--jen-telefon') {
    opt.jenTelefon = true
  } else if (a === '--bez-telefon-filter') {
    opt.jenTelefon = false
  } else if (a === '--max-pages' && args[i + 1]) {
    opt.maxPages = parseInt(args[++i], 10)
  } else if (a === '--delay' && args[i + 1]) {
    opt.delay = parseInt(args[++i], 10)
  } else if (a === '--podpis' && args[i + 1]) {
    opt.podpis = args[++i]
  } else if (a === '--lokal' && args[i + 1]) {
    opt.lokal = args[++i]
  } else if (a === '--help' || a === '-h') {
    console.log(`Použití: node find-leads-firmy.mjs --kategorie OBOR[,OBOR] --kraj KRAJ[,KRAJ]

Kategorie: ${Object.keys(KATEGORIE).join(', ')}
Kraje: ${Object.keys(KRAJE).join(', ')}, vsechny

Přepínače:
  --out SOUBOR.csv       výstupní CSV (výchozí: stdout + firmy-{kat}-{kraj}.csv)
  --dedup-csv SOUBOR.csv vyloučit telefony/emaily z jiného CSV
  --jen-telefon          jen firmy s telefonem (výchozí: zapnuto)
  --bez-telefon-filter   vypnout filtr telefonu
  --max-pages N          max stránek na kategorii/kraj (výchozí: 50)
  --delay N              prodleva mezi požadavky v ms (výchozí: 2000)
  --podpis "..."         podpis do emailu
  --lokal "v Praze"      lokální tvar pro email`)
    process.exit(0)
  }
}

if (!opt.kategorie.length) {
  console.error('Chyba: --kategorie je povinný. Použij --help pro nápovědu.')
  process.exit(1)
}
if (!opt.kraje.length) {
  console.error('Chyba: --kraj je povinný. Použij --help pro nápovědu.')
  process.exit(1)
}

for (const k of opt.kategorie) {
  if (!KATEGORIE[k]) {
    console.error(`Neznámá kategorie: ${k}. Dostupné: ${Object.keys(KATEGORIE).join(', ')}`)
    process.exit(1)
  }
}
for (const k of opt.kraje) {
  if (!KRAJE[k]) {
    console.error(`Neznámý kraj: ${k}. Dostupné: ${Object.keys(KRAJE).join(', ')}, vsechny`)
    process.exit(1)
  }
}

// ---------- HTTP fetch with delay ----------

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'cs,en;q=0.5',
      },
    }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `https://www.firmy.cz${res.headers.location}`
        fetchUrl(redirectUrl).then(resolve, reject)
        return
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString()))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error(`Timeout for ${url}`))
    })
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function fetchWithDelay(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const html = await fetchUrl(url)
      await sleep(opt.delay)
      return html
    } catch (err) {
      if (attempt < 2) {
        console.error(`  Retry ${attempt + 1}/3: ${err.message}`)
        await sleep(opt.delay * 2)
      } else {
        throw err
      }
    }
  }
}

// ---------- JSON-LD extraction ----------

function extractJsonLd(html) {
  const results = []
  const regex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = regex.exec(html)) !== null) {
    try {
      const data = JSON.parse(m[1])
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item['@type'] === 'LocalBusiness' || item['@type']?.includes?.('LocalBusiness')) {
            results.push(item)
          }
        }
      } else if (data['@type'] === 'ItemList') {
        const items = data.itemListElement ?? []
        for (const el of items) {
          const item = el.item ?? el
          if (item['@type'] === 'LocalBusiness' || item['@type']?.includes?.('LocalBusiness') || item.name) {
            results.push(item)
          }
        }
      } else if (data['@type'] === 'LocalBusiness' || data['@type']?.includes?.('LocalBusiness')) {
        results.push(data)
      }
    } catch {
      // Invalid JSON — skip
    }
  }
  return results
}

// ---------- Address formatting ----------

function formatAddress(addr) {
  if (!addr) return ''
  if (typeof addr === 'string') return addr
  const parts = []
  if (addr.streetAddress) parts.push(addr.streetAddress)
  if (addr.addressLocality) parts.push(addr.addressLocality)
  if (addr.postalCode) parts.push(addr.postalCode)
  return parts.join(', ')
}

// ---------- Phone normalization (E.164) ----------

function normalizePhone(phone) {
  if (!phone) return ''
  let p = String(phone).replace(/[\s\-().]/g, '')
  // Remove leading +420 duplicates
  if (/^\+420\+420/.test(p)) p = p.replace(/^\+420/, '')
  // Add +420 if missing country code
  if (/^[2-9]\d{8}$/.test(p)) p = '+420' + p
  if (/^00420/.test(p)) p = '+420' + p.slice(5)
  // Validate Czech number
  if (/^\+420[2-9]\d{8}$/.test(p)) return p
  // Return original cleaned if not Czech
  return phone.replace(/[\s\-()]/g, '') || ''
}

// ---------- Main scraping logic ----------

async function scrapeCategory(kategorieKey, krajKey) {
  const katPath = KATEGORIE[kategorieKey]
  const krajPath = KRAJE[krajKey]
  const base = `https://www.firmy.cz/${katPath}/${krajPath}`
  const leads = []

  for (let page = 1; page <= opt.maxPages; page++) {
    const url = page === 1 ? base : `${base}?page=${page}`
    let html
    try {
      html = await fetchWithDelay(url)
    } catch (err) {
      console.error(`  Chyba na stránce ${page}: ${err.message}`)
      break
    }

    const businesses = extractJsonLd(html)
    if (!businesses || businesses.length === 0) break

    for (const biz of businesses) {
      const phone = normalizePhone(biz.telephone)
      const email = biz.email ?? ''
      // sameAs is an array: [firmy.cz URL, external website URL (if any)]
      // url is always firmy.cz profile
      const sameAs = Array.isArray(biz.sameAs) ? biz.sameAs : (biz.sameAs ? [biz.sameAs] : [])
      const externalWeb = sameAs.find((u) => u && !u.includes('firmy.cz')) ?? ''

      leads.push({
        name: biz.name ?? '',
        phone,
        email,
        web: externalWeb, // only external website, not firmy.cz profile
        address: formatAddress(biz.address),
        rating: biz.aggregateRating?.ratingValue ?? '',
        reviewCount: biz.aggregateRating?.reviewCount ?? '',
        kategorie: kategorieKey,
        source: 'firmy.cz',
      })
    }

    process.stderr.write(`  ${kategorieKey}/${krajKey} stránka ${page}: ${businesses.length} firem (celkem ${leads.length})\n`)

    // Less than full page = probably last page
    if (businesses.length < 10) break

    // Check if page has pagination / next link
    if (!html.includes(`page=${page + 1}`)) break
  }

  return leads
}

// ---------- Deduplication ----------

async function loadDedupSet(csvPath) {
  const phones = new Set()
  const emails = new Set()
  try {
    const content = await readFile(csvPath, 'utf-8')
    const lines = content.split(/\r?\n/)
    // Find phone/email column indices from header
    const header = lines[0]?.replace(/^\uFEFF/, '').split(';').map((h) => h.replace(/"/g, '').toLowerCase())
    const phoneIdx = header?.indexOf('telefon') ?? -1
    const emailIdx = header?.indexOf('email') ?? -1
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'))
      if (phoneIdx >= 0 && cols[phoneIdx]) phones.add(normalizePhone(cols[phoneIdx]))
      if (emailIdx >= 0 && cols[emailIdx]) emails.add(cols[emailIdx].toLowerCase())
    }
  } catch (err) {
    console.error(`Varování: nelze načíst dedup CSV: ${err.message}`)
  }
  return { phones, emails }
}

// ---------- Email generation ----------

function buildEmail(lead) {
  const [gen, obsah, zisk] = OBOR_TEXT[lead.kategorie] ?? OBOR_DEFAULT
  const lokal = opt.lokal ?? 'na internetu'

  const problem = lead.web
    ? `váš web by mohl být ještě lepší — přehlednější a modernější`
    : 'nemáte vlastní web'

  const who = lead.name || 'vás'
  return {
    subject: lead.name ? `Návrh nového webu pro ${lead.name}` : 'Návrh nového webu',
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

// ---------- Main ----------

const allLeads = []

console.error(`Firmy.cz scraper — ${opt.kategorie.length} kategorií × ${opt.kraje.length} krajů\n`)

for (const kat of opt.kategorie) {
  for (const kraj of opt.kraje) {
    console.error(`\nScrapuji: ${kat} / ${kraj}`)
    try {
      const leads = await scrapeCategory(kat, kraj)
      allLeads.push(...leads)
      console.error(`  → ${leads.length} firem nalezeno`)
    } catch (err) {
      console.error(`  CHYBA: ${err.message}`)
    }
  }
}

// Deduplicate within results (by phone)
const seenPhones = new Set()
const seenNames = new Set()
let dupsRemoved = 0
let filtered = allLeads.filter((l) => {
  const key = l.phone || `name:${l.name}|${l.address}`
  if (seenPhones.has(key)) {
    dupsRemoved++
    return false
  }
  seenPhones.add(key)
  // Also dedup by exact name+address
  const nameKey = `${l.name}|${l.address}`.toLowerCase()
  if (seenNames.has(nameKey)) {
    dupsRemoved++
    return false
  }
  seenNames.add(nameKey)
  return true
})
console.error(`\nInterní deduplikace: odstraněno ${dupsRemoved} duplicit`)

// Dedup against existing CSV
if (opt.dedupCsv) {
  const dedup = await loadDedupSet(opt.dedupCsv)
  const before = filtered.length
  filtered = filtered.filter((l) => {
    if (l.phone && dedup.phones.has(l.phone)) return false
    if (l.email && dedup.emails.has(l.email.toLowerCase())) return false
    return true
  })
  console.error(`Dedup s ${opt.dedupCsv}: odstraněno ${before - filtered.length} duplicit`)
}

// Filter: only with phone (default ON)
if (opt.jenTelefon) {
  const before = filtered.length
  filtered = filtered.filter((l) => l.phone)
  console.error(`Filtr jen-telefon: odstraněno ${before - filtered.length} bez telefonu`)
}

// Fisher-Yates shuffle
for (let i = filtered.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [filtered[i], filtered[j]] = [filtered[j], filtered[i]]
}

// Build emails
for (const r of filtered) r.mail = buildEmail(r)

// Lead type for firmy.cz entries
const leadType = (r) => r.web ? 'has_web' : 'no_web'
const problemyCz = (r) => r.web ? 'Má web, nalezeno na firmy.cz' : 'Nemá vlastní web'

// ---------- CSV output ----------

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const csv = [
  ['firma', 'web', 'email', 'telefon', 'adresa', 'skore', 'typ_leadu', 'problemy_webu', 'duvody', 'predmet', 'text_emailu'].join(';'),
  ...filtered.map((r) =>
    [r.name, r.web, r.email, r.phone, r.address, '', leadType(r), problemyCz(r), `zdroj: firmy.cz | ${r.kategorie}`, r.mail.subject, r.mail.body]
      .map(cell)
      .join(';'),
  ),
].join('\r\n')

const outFile = opt.out ?? `firmy-${opt.kategorie.join('-')}-${opt.kraje.join('-')}.csv`
await writeFile(outFile, '\uFEFF' + csv)

const withEmail = filtered.filter((r) => r.email).length
const withPhone = filtered.filter((r) => r.phone).length
const withWeb = filtered.filter((r) => r.web).length

console.error(`
=== VÝSLEDEK ===
Celkem nalezeno: ${allLeads.length} firem
Po deduplikaci:  ${filtered.length} unikátních
S telefonem:     ${withPhone}
S emailem:       ${withEmail}
S webem:         ${withWeb}
Bez webu:        ${filtered.length - withWeb}
Uloženo do:      ${outFile}
`)

// ---------- HTML přehled ----------

const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const hostOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, '') }
  catch { return url }
}

const title = `Firmy.cz leady – ${opt.kategorie.join(', ')} – ${opt.kraje.join(', ')}`

const htmlRows = filtered
  .map((r) => {
    const emails = r.email ? r.email.split(', ') : []
    const phones = r.phone ? r.phone.split(/\s*[;,]\s*/).filter(Boolean) : []
    return `<tr class="lead" data-email="${emails.length ? 1 : 0}" data-phone="${phones.length ? 1 : 0}">
<td class="score"><span class="badge none">–</span></td>
<td><div class="name">${esc(r.name)}</div>${r.address ? `<div class="muted">${esc(r.address)}</div>` : ''}${r.kategorie ? `<div class="muted">${esc(r.kategorie)}</div>` : ''}</td>
<td>${r.web ? `<a href="${esc(r.web)}" target="_blank" rel="noopener noreferrer">${esc(hostOf(r.web))} ↗</a>` : '<span class="muted">bez webu</span>'}</td>
<td>${emails.map((e) => `<a class="email" href="mailto:${esc(e)}">${esc(e)}</a>`).join('<br>') || '<span class="muted">–</span>'}</td>
<td class="nowrap">${phones.map((p) => `<a href="tel:${esc(p.replace(/\s/g, ''))}">${esc(p)}</a>`).join('<br>') || '<span class="muted">–</span>'}</td>
<td><span class="chip">${esc(problemyCz(r))}</span></td>
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

const htmlContent = `<!doctype html>
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
<div class="sub">${filtered.length} leadů · ${withPhone} s telefonem · ${withEmail} s e-mailem · ${withWeb} s webem · zdroj: firmy.cz · vygenerováno ${new Date().toLocaleDateString('cs-CZ')}</div>
<div class="bar">
<input type="search" id="q" placeholder="Hledat firmu, adresu, telefon…">
<label><input type="checkbox" id="onlyEmail"> jen s e-mailem</label>
<label><input type="checkbox" id="onlyPhone" checked> jen s telefonem</label>
<button id="copy">Kopírovat e-maily</button>
<span class="muted" id="count"></span>
</div>
<div class="card">
<table>
<tr><th></th><th>Firma</th><th>Web</th><th>E-mail</th><th>Telefon</th><th>Info</th></tr>
${htmlRows}
</table>
</div>
</div>
<script>
const rows = document.querySelectorAll('tr.lead, tr.mail')
const q = document.getElementById('q')
const onlyEmail = document.getElementById('onlyEmail')
const onlyPhone = document.getElementById('onlyPhone')
const count = document.getElementById('count')
function update() {
  const term = q.value.toLowerCase()
  let n = 0
  for (let i = 0; i < rows.length; i += 2) {
    const lead = rows[i], mail = rows[i + 1]
    const text = lead.textContent.toLowerCase()
    const hasEmail = lead.dataset.email === '1'
    const hasPhone = lead.dataset.phone === '1'
    const show = (!term || text.includes(term)) && (!onlyEmail.checked || hasEmail) && (!onlyPhone.checked || hasPhone)
    lead.hidden = !show; mail.hidden = !show
    if (show) n++
  }
  count.textContent = n + ' zobrazeno'
}
q.addEventListener('input', update)
onlyEmail.addEventListener('change', update)
onlyPhone.addEventListener('change', update)
update()

document.getElementById('copy').addEventListener('click', () => {
  const emails = []
  document.querySelectorAll('tr.lead:not([hidden]) .email').forEach(a => emails.push(a.textContent))
  navigator.clipboard.writeText(emails.join('\\n'))
})

document.querySelectorAll('.copy').forEach(btn => {
  btn.addEventListener('click', () => {
    const row = btn.closest('tr')
    const el = row.querySelector(btn.dataset.what)
    if (el) navigator.clipboard.writeText(el.textContent)
  })
})
</script>
</body>
</html>`

const htmlFile = outFile.replace(/\.csv$/, '.html')
await writeFile(htmlFile, htmlContent)
console.error(`HTML přehled: ${htmlFile}`)
