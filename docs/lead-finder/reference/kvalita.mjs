#!/usr/bin/env node
// Ověří leady a nechá jen ty, u kterých je doložené, že firma žije a dá se jí dovolat.
//
//   node kvalita.mjs                      (čte vsechny-leady.csv, píše kvalitni-leady.csv + .html)
//   node kvalita.mjs kolin.csv --limit 50 --out zkouska
//
// Google Mapy se použijí jen v nouzi (firma nemá funkční web, telefon, nebo doklad života) a jen
// když je nastavený klíč GOOGLE_PLACES_API_KEY (v prostředí nebo v souboru .env vedle skriptu).
// Strop dotazů na jeden běh: --places-limit N (výchozí 100; 0 = Google Mapy vypnuté).
//
// U každé firmy: znovu načte web (stav, telefony, e-maily, odkazy, IČO), ověří IČO v ARES
// (existuje? nezanikla? kdo ji vede?), zkontroluje, že doména e-mailu přijímá poštu,
// a přidělí známku A / B / C. Do výstupu jdou jen A a B.

import { readFile, writeFile } from 'node:fs/promises'
import { resolveMx } from 'node:dns/promises'
import { inspectSite, normalizePhone } from './crm-pipeline/inspect.ts'

const args = process.argv.slice(2)
const opt = { limit: Infinity, out: 'kvalitni-leady', placesLimit: 100 }
let file = 'vsechny-leady.csv'
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit') opt.limit = Number(args[++i])
  else if (args[i] === '--out') opt.out = args[++i]
  else if (args[i] === '--places-limit') opt.placesLimit = Number(args[++i])
  else file = args[i]
}

function parseCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') cell += '"', i++
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ';') row.push(cell), (cell = '')
    else if (c === '\n') row.push(cell), rows.push(row), (row = []), (cell = '')
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) row.push(cell), rows.push(row)
  const [header, ...data] = rows
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])))
}

// ---------- ARES ----------

const ARES = 'https://ares.gov.cz/ekonomicke-subjekty-v-be/rest'
const aresCache = new Map()
let aresChain = Promise.resolve()
let aresBlocked = false

// Rejstřík je veřejná služba: dotazy jdou po jednom s odstupem, ne naráz.
function aresGet(path) {
  const run = aresChain.then(async () => {
    if (aresBlocked) return null
    await new Promise((r) => setTimeout(r, 400))
    try {
      const res = await fetch(`${ARES}${path}`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) })
      if (res.status === 429 || res.status === 403) {
        aresBlocked = true
        console.error('\n  ARES omezil přístup, další firmy zůstanou bez ověření v rejstříku.')
        return null
      }
      return res.ok ? await res.json() : null
    } catch {
      return null
    }
  })
  aresChain = run.catch(() => {})
  return run
}

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s-])\p{L}/gu, (c) => c.toUpperCase())

async function ares(ico) {
  if (aresCache.has(ico)) return aresCache.get(ico)
  const promise = (async () => {
    const d = await aresGet(`/ekonomicke-subjekty/${ico}`)
    if (!d?.ico) return null
    const states = Object.values(d.seznamRegistraci ?? {})
    const info = {
      nazev: d.obchodniJmeno ?? '',
      sidlo: d.sidlo?.textovaAdresa ?? '',
      vznik: (d.datumVzniku ?? '').slice(0, 4),
      aktivni: !d.datumZaniku && states.includes('AKTIVNI'),
      zanik: (d.datumZaniku ?? '').slice(0, 4),
      osoby: [],
    }
    if (info.aktivni && d.seznamRegistraci?.stavZdrojeVr === 'AKTIVNI') {
      const vr = await aresGet(`/ekonomicke-subjekty-vr/${ico}`)
      const people = new Set()
      for (const organ of vr?.zaznamy?.[0]?.statutarniOrgany ?? []) {
        for (const c of organ.clenoveOrganu ?? []) {
          const p = c.fyzickaOsoba
          if (!c.datumVymazu && p?.prijmeni) people.add(titleCase(`${p.jmeno ?? ''} ${p.prijmeni}`.trim()))
        }
      }
      info.osoby = [...people].slice(0, 3)
    } else if (info.aktivni && /^10\d$/.test(String(d.pravniForma))) {
      // fyzická osoba podnikající: název subjektu je jméno podnikatele
      info.osoby = [info.nazev]
    }
    return info
  })()
  aresCache.set(ico, promise)
  return promise
}

// ---------- Google Mapy (jen v nouzi) ----------

try {
  process.loadEnvFile(new URL('.env', import.meta.url))
} catch {}
const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY
let placesUsed = 0
let placesOff = false

const PLACE_STATUS = { OPERATIONAL: 'otevřeno', CLOSED_TEMPORARILY: 'dočasně zavřeno', CLOSED_PERMANENTLY: 'trvale zavřeno' }

/** Z nalezených míst jen to, které je prokazatelně ta samá firma. */
function pickPlace(lead, places, phones) {
  const name = tokens(lead.firma)
  if (name.length === 0) return null
  const street = tokens(lead.adresa.split(',')[0])
  const city = tokens(lead.adresa.split(',').slice(1).join(' ') || (/kraj/i.test(lead.oblast ?? '') ? '' : lead.oblast ?? ''))
  for (const p of places) {
    const theirs = new Set(tokens(p.displayName?.text))
    // všechna slova kratšího z názvů musí být v tom druhém; „kadeřnictví“ samo nestačí
    const [small, big] = name.length <= theirs.size ? [name, theirs] : [[...theirs], new Set(name)]
    if (small.length === 0 || !small.every((t) => big.has(t))) continue
    const address = plain(p.formattedAddress)
    const phone = normalizePhone(p.nationalPhoneNumber ?? '')
    const samePlace = street.some((t) => address.includes(t)) || city.some((t) => address.includes(t)) || (phone && phones.includes(phone))
    if (samePlace || (street.length === 0 && city.length === 0 && small.length >= 2)) return p
  }
  return null
}

async function placesLookup(lead, phones) {
  if (!PLACES_KEY || placesOff || placesUsed >= opt.placesLimit || !lead.firma.trim()) return null
  placesUsed++
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': PLACES_KEY,
        'X-Goog-FieldMask':
          'places.displayName,places.formattedAddress,places.websiteUri,places.nationalPhoneNumber,places.businessStatus,places.rating,places.userRatingCount,places.googleMapsUri,places.regularOpeningHours.weekdayDescriptions',
      },
      body: JSON.stringify({ textQuery: [lead.firma, lead.adresa || lead.oblast].filter(Boolean).join(', '), languageCode: 'cs', regionCode: 'CZ', pageSize: 3 }),
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      // špatný klíč, vypnutá služba nebo vyčerpaná kvóta: další dotazy by dopadly stejně
      placesOff = true
      const message = (await res.json().catch(() => ({}))).error?.message ?? ''
      console.error(`\n  Google Places odmítl dotaz (${res.status} ${message}). Pokračuji bez Google Map.`)
      return null
    }
    const p = pickPlace(lead, (await res.json()).places ?? [], phones)
    if (!p) return null
    return {
      phone: normalizePhone(p.nationalPhoneNumber ?? ''),
      website: p.websiteUri ?? '',
      status: p.businessStatus ?? '',
      rating: p.rating ?? null,
      reviews: p.userRatingCount ?? 0,
      mapsUrl: p.googleMapsUri ?? '',
      hours: (p.regularOpeningHours?.weekdayDescriptions ?? []).join('; '),
    }
  } catch {
    return null
  }
}

// ---------- e-mail ----------

const mxCache = new Map()
function hasMx(domain) {
  if (!mxCache.has(domain)) {
    mxCache.set(domain, resolveMx(domain).then((r) => r.length > 0, () => false))
  }
  return mxCache.get(domain)
}

const FREEMAIL = /@(seznam\.cz|email\.cz|post\.cz|centrum\.cz|volny\.cz|atlas\.cz|tiscali\.cz|gmail\.com|googlemail\.com|outlook\.com|hotmail\.com|yahoo\.com|icloud\.com)$/

// ---------- patří nalezené IČO opravdu té firmě? ----------

// V patičce webu bývá i IČO toho, kdo web dělal. Záznam z rejstříku se proto počítá jen tehdy,
// když sedí s firmou názvem, adresou, nebo příjmením v e-mailu či doméně.
const plain = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const tokens = (s) => plain(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !/^(spol|sro|group|praha|czech|studio|salon|servis|company)$/.test(t))

function matchesRegister(lead, reg, email) {
  const name = new Set(tokens(reg.nazev))
  if (tokens(lead.firma).some((t) => name.has(t))) return true
  const seat = plain(reg.sidlo)
  // jen ulice: stejné město má i místní tvůrce webů
  const place = tokens(lead.adresa.split(',')[0])
  if (place.length > 0 && place.some((t) => seat.includes(t))) return true
  const online = plain(`${email} ${lead.web}`)
  return [...name].some((t) => online.includes(t))
}

// ---------- kde má firma web, když ho zdroj nezná ----------

const slug = (s) => plain(s).replace(/\b(s\.?r\.?o\.?|spol\.?|a\.?s\.?)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
const ALIVE = (state) => !['none', 'dead', 'parked', 'construction', 'closed', 'blocked'].includes(state)

async function findWebsite(lead) {
  const known = plain(lead.web)
  // 1) z e-mailu: info@drsonestudio.cz → drsonestudio.cz
  const own = lead.email.split(/[,;\s]+/).map((e) => e.trim().toLowerCase().split('@')[1]).find((d) => d && !FREEMAIL.test('@' + d))
  if (own && !known.includes(own)) {
    const insp = await inspectSite(own)
    if (ALIVE(insp.state)) return { web: `https://${own}`, insp, source: 'z domény e-mailu' }
  }
  // 2) z názvu: studiodaniela.cz, studio-daniela.cz… Cizí web se stejným jménem nesmí projít,
  //    proto se bere jen ten, na kterém je telefon nebo e-mail, který už o firmě známe.
  const words = slug(lead.firma).split(' ').filter(Boolean)
  if (words.length === 0 || words.join('').length < 5) return null
  const phones = lead.telefon.split(/\s*[;,]\s*/).map(normalizePhone).filter(Boolean)
  const mails = lead.email.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean)
  if (phones.length === 0 && mails.length === 0) return null
  const names = [...new Set([words.join(''), words.join('-')])]
  for (const name of names) {
    for (const tld of ['cz', 'com', 'eu']) {
      const domain = `${name}.${tld}`
      if (known.includes(domain)) continue
      const insp = await inspectSite(domain)
      if (!ALIVE(insp.state)) continue
      if (insp.phones.some((p) => phones.includes(p)) || insp.emails.some((e) => mails.includes(e))) {
        return { web: `https://${domain}`, insp, source: 'dohledán podle názvu, potvrzen kontaktem' }
      }
    }
  }
  return null
}

// ---------- o čem má operátor mluvit ----------

// Nálezy na webu převedené do vět, které jdou říct do telefonu.
const SPOKEN = [
  [/mobil/, 'web se na telefonu nepřizpůsobí displeji, návštěvník musí zvětšovat a posouvat'],
  [/HTTPS/, 'web neběží na zabezpečeném spojení, prohlížeč u něj ukazuje „Nezabezpečeno“'],
  [/v patičce rok (\d{4})/, (m) => `v patičce webu je pořád rok ${m[1]}`],
  [/neměněn od (\d{4})/, (m) => `stránka se naposledy měnila v roce ${m[1]}`],
  [/rámech|zastaralé HTML|tabulk|Flash|jQuery|starý /, 'web je postavený starou technologií, kterou dnešní prohlížeče a Google špatně snášejí'],
  [/náhled pro sdílení/, 'při sdílení na Facebooku nebo WhatsAppu se neukáže náhled s obrázkem'],
]

function talkingPoints(insp, web, reg, emailType) {
  const points = []
  const domain = web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')
  if (insp.state === 'none') points.push(insp.links.length ? `vlastní web nemají, jen profil (${insp.links.map((l) => l.type).join(', ')})` : 'vlastní web nemají')
  else if (['dead', 'parked', 'construction'].includes(insp.state)) points.push(`web ${domain} teď nejde zobrazit (${insp.evidence[0] ?? 'nefunguje'})`)
  else {
    points.push(`mají web ${domain}`)
    const said = new Set()
    for (const reason of insp.datedReasons) {
      for (const [pattern, sentence] of SPOKEN) {
        const m = pattern.exec(reason)
        if (!m) continue
        const text = typeof sentence === 'function' ? sentence(m) : sentence
        if (!said.has(text)) said.add(text), points.push(text)
        break
      }
    }
    if (insp.state === 'active') points.push(`o web se starají (${insp.evidence[0]}), takže ho berou vážně`)
  }
  if (emailType.startsWith('freemail')) points.push('píšou z freemailu, ne z adresy na vlastní doméně')
  const networks = insp.links.filter((l) => ['facebook', 'instagram', 'tiktok', 'youtube'].includes(l.type)).map((l) => l.type)
  if (insp.state !== 'none' && networks.length) points.push(`jsou na sítích (${networks.join(', ')})`)
  if (insp.links.some((l) => l.type === 'rezervace')) points.push('berou rezervace online')
  if (reg?.aktivni && reg.vznik) points.push(`firma funguje od roku ${reg.vznik}`)
  return points.slice(0, 6)
}

/** Jedna věta, proč firmě voláme. Bez ní se lead nezakládá. */
function callReason(insp, points) {
  if (insp.state === 'none') return 'nemají vlastní web'
  if (['dead', 'parked', 'construction'].includes(insp.state)) return 'jejich web nejde zobrazit'
  // první nález po úvodní větě „mají web …“; věty o sítích nebo stáří firmy důvod nejsou
  const finding = points.slice(1).find((p) => /^web |^v patičce|^stránka se|^při sdílení/.test(p))
  return finding ?? ''
}

// ---------- ověření jedné firmy ----------

const WEB_STATE = {
  closed: 'firma na webu píše, že skončila', none: 'nemá vlastní web', dead: 'web nefunguje', parked: 'zástupná stránka', construction: 've výstavbě',
  blocked: 'web nelze ověřit', stale: 'web zanedbaný', active: 'web se používá',
}

async function verify(lead) {
  let insp = await inspectSite(lead.web)
  let web = lead.web
  let webSource = ''
  // Bez webu není rozbor a bez rozboru není proč volat. Když web chybí nebo nefunguje,
  // hledá se jinde, než se firma odepíše.
  if (['none', 'dead', 'parked'].includes(insp.state)) {
    const found = await findWebsite(lead)
    if (found) {
      insp = found.insp
      web = found.web
      webSource = found.source
    }
  }
  const fromList = lead.telefon.split(/\s*[;,]\s*/).map(normalizePhone).filter(Boolean)

  // Google Mapy v nouzi, poprvé: firma nemá funkční web, nebo se nenašel žádný telefon.
  let place = null
  if (!ALIVE(insp.state) || (insp.phones.length === 0 && fromList.length === 0)) {
    place = await placesLookup(lead, fromList)
    if (place?.website && !ALIVE(insp.state) && !/facebook\.com|instagram\.com/i.test(place.website)) {
      const viaMaps = await inspectSite(place.website)
      if (ALIVE(viaMaps.state)) {
        insp = viaMaps
        web = place.website
        webSource = 'z Google Map'
      }
    }
  }
  const collectPhones = () => [...new Set([...insp.phones, ...fromList, ...(place?.phone ? [place.phone] : [])])].slice(0, 3)
  let phones = collectPhones()
  const phoneOnWeb = insp.phones.length > 0
  const emails = [...new Set([...lead.email.split(/[,;\s]+/), ...insp.emails].map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@%]+@[^\s@]+\.[a-z]{2,}$/.test(e)))]
  emails.sort((a, b) => Number(FREEMAIL.test(a)) - Number(FREEMAIL.test(b)))
  let email = ''
  for (const e of emails) {
    if (await hasMx(e.split('@')[1])) { email = e; break }
  }

  const found = insp.ico ? await ares(insp.ico) : null
  // rejstřík se počítá jen u záznamu, který k firmě prokazatelně patří
  const reg = found && matchesRegister(lead, found, email) ? found : null

  // Google Mapy v nouzi, podruhé: nic zatím nedokládá, že firma žije.
  if (!place && !reg?.aktivni && insp.state !== 'active' && insp.state !== 'closed') {
    place = await placesLookup(lead, phones)
    phones = collectPhones()
  }

  const life = []
  if (reg?.aktivni) life.push(`v rejstříku aktivní${reg.vznik ? ` (od ${reg.vznik})` : ''}`)
  if (insp.state === 'active') life.push(...insp.evidence)
  if (place?.status === 'OPERATIONAL') life.push(`v Google Mapách otevřená provozovna${place.reviews ? ` (${place.reviews} recenzí)` : ''}`)
  const closedOnMaps = place?.status === 'CLOSED_PERMANENTLY'

  let grade
  if ((reg && !reg.aktivni) || insp.state === 'closed' || closedOnMaps) grade = 'X'
  else if (life.length > 0 && phones.length > 0 && (phoneOnWeb || Boolean(email) || Boolean(place?.phone)) && (reg?.aktivni || insp.state === 'active' || place?.status === 'OPERATIONAL')) grade = 'A'
  // bez telefonu se firma do CRM nedostane; jde do fronty na dohledání čísla
  else if (phones.length === 0) grade = (life.length > 0 || insp.state === 'stale') && email ? 'T' : 'C'
  else if (life.length > 0 || insp.state === 'stale') grade = 'B'
  else grade = 'C'
  // A jen s doloženým životem ze dvou stran, nebo z rejstříku
  if (grade === 'A' && !reg?.aktivni && life.length < 2 && !email) grade = 'B'

  const emailType = !email ? '' : FREEMAIL.test(email) ? 'freemail (schránku nelze ověřit)' : 'vlastní doména'
  const points = talkingPoints(insp, web, reg, emailType)
  if (place?.rating) points.push(`na Googlu mají hodnocení ${String(place.rating).replace('.', ',')} z ${place.reviews} recenzí`)
  if (place && !place.website && insp.state === 'none') points.push('ani v Google Mapách nemají uvedený web')
  const reason = callReason(insp, points)
  // živá firma s webem, na kterém není co vytknout: není proč volat
  if (!reason && (grade === 'A' || grade === 'B')) grade = 'N'
  return {
    ...lead,
    duvod_hovoru: reason,
    o_cem_mluvit: points.join(' | '),
    duvody: insp.datedReasons.length ? insp.datedReasons.join(' | ') : lead.duvody,
    web,
    web_dohledan: webSource,
    kvalita: grade,
    telefon: phones.join(', '),
    mobil: phones.some((p) => /^\+420 [67]/.test(p)) ? 'ano' : '',
    telefon_na_webu: phoneOnWeb ? 'ano' : '',
    email,
    typ_emailu: emailType,
    ico: reg ? insp.ico : '',
    pravni_nazev: reg?.nazev ?? '',
    kontaktni_osoba: reg?.osoby.join(', ') ?? '',
    sidlo: reg?.sidlo ?? '',
    vznik: reg?.vznik ?? '',
    stav_firmy: reg ? (reg.aktivni ? 'aktivní' : `zaniklá${reg.zanik ? ` ${reg.zanik}` : ''}`) : found ? 'neověřeno (IČO na webu nesedí s firmou)' : 'neověřeno',
    stav_webu: WEB_STATE[insp.state],
    dukazy_zivota: life.join(' | '),
    odkazy: [...insp.links, ...(place?.mapsUrl ? [{ type: 'google mapy', url: place.mapsUrl }] : [])].map((l) => `${l.type}: ${l.url}`).join(' | '),
    google_stav: closedOnMaps ? 'trvale zavřeno' : PLACE_STATUS[place?.status] ?? '',
    google_hodnoceni: place?.rating ? `${String(place.rating).replace('.', ',')} (${place.reviews} recenzí)` : '',
    oteviraci_doba: place?.hours ?? '',
  }
}

// ---------- běh ----------

async function pool(items, limit, worker) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await worker(items[i], i)
    }
  }))
  return results
}

const leads = parseCsv((await readFile(file, 'utf8')).replace(/^﻿/, '')).slice(0, opt.limit)
let done = 0
const checked = await pool(leads, 10, async (lead) => {
  const r = await verify(lead).catch((err) => ({ ...lead, kvalita: 'C', stav_webu: `chyba ověření: ${err.message}` }))
  process.stderr.write(`\r  ověřeno ${++done}/${leads.length}`)
  return r
})
process.stderr.write('\n')

const count = (g) => checked.filter((r) => r.kvalita === g).length
const good = checked.filter((r) => r.kvalita === 'A' || r.kvalita === 'B').sort((a, b) => a.kvalita.localeCompare(b.kvalita) || Number(b.skore || 0) - Number(a.skore || 0))

const cols = ['kvalita', 'oblast', 'firma', 'pravni_nazev', 'kontaktni_osoba', 'duvod_hovoru', 'o_cem_mluvit', 'ico', 'stav_firmy', 'vznik', 'telefon', 'mobil', 'telefon_na_webu', 'email', 'typ_emailu', 'web', 'web_dohledan', 'stav_webu', 'dukazy_zivota', 'google_stav', 'google_hodnoceni', 'oteviraci_doba', 'odkazy', 'adresa', 'sidlo', 'skore', 'duvody', 'predmet', 'text_emailu']
const noPhone = checked.filter((r) => r.kvalita === 'T')

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
await writeFile(`${opt.out}.csv`, '﻿' + [cols.join(';'), ...good.map((r) => cols.map((c) => cell(r[c])).join(';'))].join('\r\n'))

await writeFile(`${opt.out}-bez-telefonu.csv`, '\uFEFF' + [cols.join(';'), ...noPhone.map((r) => cols.map((c) => cell(r[c])).join(';'))].join('\r\n'))

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const rowsHtml = good.map((r) => `<tr data-g="${r.kvalita}">
<td><span class="g g${r.kvalita}">${r.kvalita}</span></td>
<td><b>${esc(r.firma || r.pravni_nazev || r.web)}</b>${r.pravni_nazev && r.pravni_nazev !== r.firma ? `<div class="m">${esc(r.pravni_nazev)}</div>` : ''}${r.kontaktni_osoba ? `<div>👤 ${esc(r.kontaktni_osoba)}</div>` : ''}<div class="m">${esc([r.oblast, r.adresa || r.sidlo].filter(Boolean).join(' · '))}</div></td>
<td class="n">${r.telefon.split(', ').filter(Boolean).map((p) => `<a href="tel:${esc(p.replace(/\s/g, ''))}">${esc(p)}</a>`).join('<br>') || '–'}${r.email ? `<div><a href="mailto:${esc(r.email)}">${esc(r.email)}</a></div>` : ''}</td>
<td>${r.duvod_hovoru ? `<div><b>Proč voláme:</b> ${esc(r.duvod_hovoru)}</div>` : ''}${r.o_cem_mluvit ? `<ul>${r.o_cem_mluvit.split(' | ').map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}</td>
<td>${esc(r.stav_firmy)}${r.ico ? `<div class="m">IČO ${esc(r.ico)}${r.vznik ? `, od ${esc(r.vznik)}` : ''}</div>` : ''}<div class="m">${esc(r.dukazy_zivota)}</div>${r.oteviraci_doba ? `<details class="m"><summary>otevírací doba</summary>${esc(r.oteviraci_doba)}</details>` : ''}</td>
<td>${r.web ? `<a href="${esc(r.web)}" target="_blank" rel="noopener noreferrer">${esc(r.web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, ''))} ↗</a>` : ''}<div class="m">${esc(r.stav_webu)}${r.web_dohledan ? ` · web ${esc(r.web_dohledan)}` : ''}</div><div class="m">${r.odkazy.split(' | ').filter(Boolean).map((o) => { const [t, ...u] = o.split(': '); return `<a href="${esc(u.join(': '))}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>` }).join(' · ')}</div></td>
</tr>`).join('\n')
await writeFile(`${opt.out}.html`, `<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Kvalitní leady</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--text:#1a1d23;--muted:#6b7280;--line:#e5e7eb;--link:#1d4ed8;--a:#15803d;--b:#b45309}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181b21;--text:#e6e8ec;--muted:#9aa1ad;--line:#2a2e37;--link:#7aa7ff;--a:#4ade80;--b:#fbbf24}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--text);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.wrap{max-width:1280px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--muted);margin-bottom:14px}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}
input[type=search]{flex:1 1 240px;padding:9px 12px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--text);font:inherit}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow-x:auto}table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:12px;text-transform:uppercase;color:var(--muted);padding:10px 12px;border-bottom:1px solid var(--line)}
td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:top}tr[hidden]{display:none}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}.m{color:var(--muted);font-size:13px}.n{white-space:nowrap}
ul{margin:0;padding-left:18px}li{margin-bottom:2px}
.g{display:inline-block;width:26px;text-align:center;padding:3px 0;border-radius:6px;font-weight:700;color:#fff}.gA{background:var(--a)}.gB{background:var(--b)}
@media (prefers-color-scheme:dark){.g{color:#0f1115}}
</style></head><body><div class="wrap">
<h1>Kvalitní leady</h1>
<div class="sub">${good.length} firem (A: ${count('A')}, B: ${count('B')}) z ${checked.length} prověřených · vyřazeno ${count('C')} bez doloženého života nebo kontaktu a ${count('X')} zaniklých · ${new Date().toLocaleDateString('cs-CZ')}</div>
<div class="bar"><input type="search" id="q" placeholder="Hledat firmu, město, obor…"><label><input type="checkbox" id="a"> jen A</label><span class="m" id="c"></span></div>
<div class="card"><table><thead><tr><th></th><th>Firma</th><th>Kontakt</th><th>O čem mluvit</th><th>Žije?</th><th>Web</th></tr></thead><tbody id="r">
${rowsHtml}
</tbody></table></div></div>
<script>
const q=document.getElementById('q'),a=document.getElementById('a'),c=document.getElementById('c'),t=[...document.querySelectorAll('#r tr')]
function f(){const n=q.value.trim().toLowerCase();let s=0;for(const r of t){const ok=(!n||r.textContent.toLowerCase().includes(n))&&(!a.checked||r.dataset.g==='A');r.hidden=!ok;if(ok)s++}c.textContent='zobrazeno '+s+' z '+t.length}
q.addEventListener('input',f);a.addEventListener('change',f);f()
</script></body></html>`)

console.error(`Hotovo: z ${checked.length} leadů je A ${count('A')}, B ${count('B')}; bez telefonu ${count('T')}, bez důvodu k hovoru ${count('N')}; vyřazeno C ${count('C')}, zaniklých ${count('X')}. IČO nalezeno u ${checked.filter((r) => r.ico).length}. Google Places: ${PLACES_KEY ? `${placesUsed} dotazů` : 'klíč není nastavený, krok vynechán'}. → ${opt.out}.csv, ${opt.out}.html`)
