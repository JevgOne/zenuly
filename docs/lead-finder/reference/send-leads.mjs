#!/usr/bin/env node
// Odešle oslovení z CSV (výstup find-leads.mjs) přes Resend.
//
//   node send-leads.mjs kolin.csv --from "Weblyx <info@weblyx.cz>" --jmeno "Jevgenij"
//       → jen vypíše, komu by co šlo (nic neodesílá)
//   node send-leads.mjs kolin.csv --from ... --jmeno ... --odeslat
//       → opravdu odešle (klíče bere ze souboru .env vedle skriptu)
//
//   ... --test moje@adresa.cz   → pošle první e-mail z fronty jen na tuto adresu (ukázka, nezapisuje se)
//
// Přepínače: --limit N (výchozí 20 e-mailů na jedno spuštění)  --reply-to adresa
//            --pozice "…"  --telefon "…"  (řádky podpisu)   --nahled soubor.html (uloží ukázku)
// Odeslané adresy se zapisují do odeslano.json a příště se přeskočí.
//
// E-mail jde jako HTML i jako čistý text. Každý nese odkaz na odhlášení
// (weblyx.cz/odhlasit) a před odesláním se skript zeptá webu, jestli se adresa
// mezitím neodhlásila. K tomu potřebuje v .env i OUTREACH_UNSUBSCRIBE_SECRET.

import { readFile, writeFile } from 'node:fs/promises'
import { createHmac } from 'node:crypto'

const args = process.argv.slice(2)
const opt = { limit: 20, odeslat: false, telefon: '+420 702 110 166', pozice: 'Weblyx · tvorba webových stránek' }
let file
for (let i = 0; i < args.length; i++) {
  const a = args[i]
  if (a === '--from') opt.from = args[++i]
  else if (a === '--jmeno') opt.jmeno = args[++i]
  else if (a === '--pozice') opt.pozice = args[++i]
  else if (a === '--telefon') opt.telefon = args[++i]
  else if (a === '--nahled') opt.nahled = args[++i]
  else if (a === '--reply-to') opt.replyTo = args[++i]
  else if (a === '--limit') opt.limit = Number(args[++i])
  else if (a === '--odeslat') opt.odeslat = true
  else if (a === '--test') opt.test = args[++i]
  else file = a
}

if (!file || !opt.from || !opt.jmeno) {
  console.error(
    'Použití: node send-leads.mjs leady.csv --from "Weblyx <info@weblyx.cz>" --jmeno "Jméno" [--odeslat]\n' +
      'Jméno je povinné: příjemce musí vědět, kdo mu píše.',
  )
  process.exit(1)
}
// klíč se dá uložit i do souboru .env vedle skriptu (RESEND_API_KEY=re_...)
try {
  process.loadEnvFile(new URL('.env', import.meta.url))
} catch {}
const KEY = process.env.RESEND_API_KEY
if ((opt.odeslat || opt.test) && !KEY) {
  console.error('Chybí RESEND_API_KEY.')
  process.exit(1)
}

const SECRET = process.env.OUTREACH_UNSUBSCRIBE_SECRET
if (!SECRET) {
  console.error('Chybí OUTREACH_UNSUBSCRIBE_SECRET v .env: bez něj nejde vytvořit odkaz na odhlášení.')
  process.exit(1)
}

const SITE = 'https://www.weblyx.cz'
const OPT_OUT = 'Pokud o další zprávy nemáte zájem, stačí odpovědět a už se neozvu.'
const LOG = 'odeslano.json'
const FROM_EMAIL = (opt.from.match(/<([^>]+)>/)?.[1] ?? opt.from).trim()

// Odkaz na odhlášení: token je HMAC adresy, stejný výpočet má web (lib/outreach/unsubscribe.ts).
const token = (email) => createHmac('sha256', SECRET).update(email.trim().toLowerCase()).digest('hex').slice(0, 32)
const unsubUrl = (email, path = '/odhlasit') => `${SITE}${path}?e=${encodeURIComponent(email)}&t=${token(email)}`

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function textBody(lead, to) {
  return `${lead.text_emailu}\n\n${opt.jmeno}\n${opt.pozice}\n${FROM_EMAIL} · ${opt.telefon}\nwww.weblyx.cz\n\n${OPT_OUT}\nOdhlásit se můžete i tady: ${unsubUrl(to)}`
}

// Vzhled: obyčejný dopis, ne newsletter. Žádné obrázky ani bannery, jen čitelný
// text, podpis jako vizitka a nenápadná patička s odhlášením.
function htmlBody(lead, to) {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  const paragraphs = lead.text_emailu
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px;">${esc(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('')
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:580px;padding:24px 20px;font-family:${font};font-size:16px;line-height:1.65;color:#1e293b;">
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;font-family:${font};">
  <tr>
    <td style="padding:2px 18px 2px 0;border-right:3px solid #14b8a6;vertical-align:middle;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;background:#14b8a6;border-radius:9px;font-size:19px;line-height:34px;font-weight:800;color:#ffffff;">W</td>
        <td valign="middle" style="padding-left:9px;font-size:22px;line-height:34px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;">Weblyx</td>
      </tr></table>
    </td>
    <td style="padding:2px 0 2px 18px;vertical-align:middle;font-size:14px;line-height:1.55;color:#475569;">
      <div style="font-size:16px;font-weight:700;color:#0f172a;">${esc(opt.jmeno)}</div>
      <div style="font-size:13px;font-weight:600;color:#0d9488;margin-bottom:6px;">${esc(opt.pozice)}</div>
      <a href="mailto:${FROM_EMAIL}" style="color:#475569;text-decoration:none;">${FROM_EMAIL}</a> &nbsp;·&nbsp; <a href="tel:${opt.telefon.replace(/\s/g, '')}" style="color:#475569;text-decoration:none;">${esc(opt.telefon)}</a><br>
      <a href="${SITE}" style="color:#0d9488;text-decoration:none;font-weight:600;">www.weblyx.cz</a>
    </td>
  </tr>
</table>
<p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:#94a3b8;">
  ${OPT_OUT} Nebo se <a href="${unsubUrl(to)}" style="color:#64748b;text-decoration:underline;">odhlaste jedním kliknutím</a>.
</p>
</div></body></html>`
}

// Zeptá se webu, jestli se adresa mezitím neodhlásila. Když web neodpoví,
// raději neposílat než poslat odhlášenému.
async function unsubscribed(email) {
  const res = await fetch(unsubUrl(email, '/odhlasit/stav'), { headers: { 'User-Agent': 'weblyx-send-leads/1.0' } })
  if (!res.ok) throw new Error(`kontrola odhlášení selhala (${res.status})`)
  return (await res.json()).unsubscribed === true
}

// CSV se středníkem, buňky v uvozovkách můžou obsahovat nové řádky
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

const leads = parseCsv((await readFile(file, 'utf8')).replace(/^﻿/, ''))
const sent = JSON.parse(await readFile(LOG, 'utf8').catch(() => '{}'))

const queue = []
const seen = new Set()
for (const lead of leads) {
  const to = lead.email.split(',')[0].trim().toLowerCase()
  if (!to || !lead.text_emailu || sent[to] || seen.has(to)) continue
  seen.add(to)
  queue.push({ to, firma: lead.firma, subject: lead.predmet, lead, text: textBody(lead, to), html: htmlBody(lead, to) })
}
// V testu míří i odkaz na odhlášení na testovací adresu, ne na firmu z fronty:
// kdo si ukázku prokliká, nesmí tím odhlásit skutečného příjemce.
const batch = opt.test
  ? queue.slice(0, 1).map((m) => ({ ...m, to: opt.test, text: textBody(m.lead, opt.test), html: htmlBody(m.lead, opt.test) }))
  : queue.slice(0, opt.limit)

console.error(
  `${leads.length} leadů v ${file}, ${Object.keys(sent).length} adres už odesláno dřív, ve frontě ${queue.length}, teď ${batch.length}.`,
)

if (opt.nahled && batch[0]) {
  await writeFile(opt.nahled, batch[0].html)
  console.error(`Náhled prvního e-mailu uložen do ${opt.nahled}.`)
}

if (!opt.odeslat && !opt.test) {
  for (const m of batch) console.log(`${m.to}  |  ${m.subject}`)
  if (batch[0]) console.log(`\n--- ukázka prvního e-mailu ---\nOd: ${opt.from}\nKomu: ${batch[0].to}\nPředmět: ${batch[0].subject}\n\n${batch[0].text}`)
  console.error('\nNic se neodeslalo. Pro ostré odeslání přidej --odeslat.')
  process.exit(0)
}

let ok = 0
for (const m of batch) {
  // m.lead.email je skutečná adresa firmy i v testovacím režimu
  const real = m.lead.email.split(',')[0].trim().toLowerCase()
  if (!opt.test) {
    try {
      if (await unsubscribed(real)) {
        sent[real] = { firma: m.firma, datum: new Date().toISOString(), odhlaseno: true }
        await writeFile(LOG, JSON.stringify(sent, null, 2))
        console.error(`přeskočeno (odhlášeno) ${real}`)
        continue
      }
    } catch (e) {
      console.error(`STOP: ${e.message}. Nic dalšího neposílám.`)
      break
    }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: opt.from,
      to: [m.to],
      subject: m.subject,
      text: m.text,
      html: m.html,
      headers: {
        'List-Unsubscribe': `<${unsubUrl(m.to, '/odhlasit/stav')}>, <mailto:${FROM_EMAIL}?subject=Odhlasit>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      ...(opt.replyTo ? { reply_to: opt.replyTo } : {}),
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    console.error(`CHYBA ${m.to}: ${res.status} ${data.message ?? ''}`)
    // špatný klíč, neověřená doména nebo limit: nemá smysl zkoušet další
    if ([401, 403, 429].includes(res.status)) break
    continue
  }
  if (!opt.test) {
    sent[m.to] = { firma: m.firma, datum: new Date().toISOString(), id: data.id }
    await writeFile(LOG, JSON.stringify(sent, null, 2))
  }
  ok++
  console.error(`odesláno ${m.to}`)
  await new Promise((r) => setTimeout(r, 1500))
}
console.error(`Hotovo: odesláno ${ok} z ${batch.length}, zbývá ${queue.length - ok}.`)
