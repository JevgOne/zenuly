import { turso } from '@/lib/turso';
import { parseLeadFinderCsv } from '@/lib/outreach/csv';

/**
 * The call list: companies with a weak website, to be phoned.
 *
 * Two or more callers work the same list, so a company is handed to one
 * caller at a time: `next()` assigns it before returning it, and nobody else
 * is offered it until that caller records an outcome or the assignment goes
 * stale. A number that asked not to be called is never offered again and is
 * skipped by every later import.
 */
export const OUTCOMES = {
  no_answer: 'Nezvedl',
  callback: 'Zavolat později',
  not_interested: 'Nemá zájem',
  wants_report: 'Chce rozbor e-mailem',
  meeting: 'Domluvena konzultace',
  wrong_number: 'Špatné číslo',
  do_not_call: 'Nevolat',
} as const;
export type Outcome = keyof typeof OUTCOMES;

/** After this long without an outcome a company goes back to the shared list. */
const STALE_ASSIGNMENT_S = 30 * 60;
/** How soon a company that did not pick up is offered again. */
const RETRY_AFTER_S = 3 * 60 * 60;
const MAX_ATTEMPTS = 3;

export interface CallLead {
  id: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  area: string;
  address: string;
  reasons: string;
  score: number | null;
  outcome: Outcome | null;
  note: string;
  attempts: number;
  callbackAt: number | null;
  calledAt: number | null;
  calledBy: string;
  reportSentAt: number | null;
}

let ready: Promise<unknown> | null = null;
function ensureTables() {
  ready ??= turso.batch(
    [
      `CREATE TABLE IF NOT EXISTS call_leads (
         id TEXT PRIMARY KEY,
         company TEXT NOT NULL DEFAULT '',
         phone TEXT NOT NULL,
         phone_key TEXT NOT NULL UNIQUE,
         email TEXT NOT NULL DEFAULT '',
         website TEXT NOT NULL DEFAULT '',
         area TEXT NOT NULL DEFAULT '',
         address TEXT NOT NULL DEFAULT '',
         reasons TEXT NOT NULL DEFAULT '',
         score INTEGER,
         outcome TEXT,
         note TEXT NOT NULL DEFAULT '',
         attempts INTEGER NOT NULL DEFAULT 0,
         callback_at INTEGER,
         assigned_to TEXT,
         assigned_at INTEGER,
         called_at INTEGER,
         called_by TEXT NOT NULL DEFAULT '',
         report_sent_at INTEGER,
         created_at INTEGER NOT NULL DEFAULT (unixepoch())
       )`,
      'CREATE INDEX IF NOT EXISTS idx_call_leads_queue ON call_leads(outcome, assigned_to, score)',
      `CREATE TABLE IF NOT EXISTS call_log (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         lead_id TEXT NOT NULL,
         caller TEXT NOT NULL,
         outcome TEXT NOT NULL,
         note TEXT NOT NULL DEFAULT '',
         created_at INTEGER NOT NULL DEFAULT (unixepoch())
       )`,
    ],
    'write'
  );
  return ready;
}

/** Digits only, without the Czech prefix — "+420 608 617 181" and "608617181" are one number. */
export const phoneKey = (phone: string) => phone.replace(/\D/g, '').replace(/^(00)?420(?=\d{9}$)/, '');
const firstPhone = (cell: string) => cell.split(/[;,/]|\s{2,}/).map((p) => p.trim()).find((p) => phoneKey(p).length >= 9) ?? '';

const toLead = (r: Record<string, unknown>): CallLead => ({
  id: String(r.id),
  company: String(r.company ?? ''),
  phone: String(r.phone ?? ''),
  email: String(r.email ?? ''),
  website: String(r.website ?? ''),
  area: String(r.area ?? ''),
  address: String(r.address ?? ''),
  reasons: String(r.reasons ?? ''),
  score: r.score === null || r.score === undefined ? null : Number(r.score),
  outcome: (r.outcome as Outcome | null) ?? null,
  note: String(r.note ?? ''),
  attempts: Number(r.attempts ?? 0),
  callbackAt: r.callback_at ? Number(r.callback_at) : null,
  calledAt: r.called_at ? Number(r.called_at) : null,
  calledBy: String(r.called_by ?? ''),
  reportSentAt: r.report_sent_at ? Number(r.report_sent_at) : null,
});

/** Import of the lead-finder CSV: every row with a phone number, once. */
export async function importCallLeads(csv: string) {
  await ensureTables();
  const rows = parseLeadFinderCsv(csv.replace(/^﻿/, ''));
  const existing = await turso.execute('SELECT phone_key FROM call_leads');
  const known = new Set(existing.rows.map((r) => String(r.phone_key)));
  const result = { imported: 0, duplicates: 0, withoutPhone: 0 };
  const statements: { sql: string; args: (string | number | null)[] }[] = [];

  for (const row of rows) {
    const phone = firstPhone(row.telefon ?? '');
    const key = phoneKey(phone);
    if (!key) { result.withoutPhone++; continue; }
    if (known.has(key)) { result.duplicates++; continue; }
    known.add(key);
    const score = Number(row.skore);
    statements.push({
      sql: `INSERT INTO call_leads (id, company, phone, phone_key, email, website, area, address, reasons, score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        `call_${Date.now().toString(36)}_${statements.length.toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        (row.firma ?? '').trim(),
        phone,
        key,
        (row.email ?? '').split(/[,;\s]+/)[0]?.trim().toLowerCase() ?? '',
        (row.web ?? '').trim(),
        (row.oblast ?? '').trim(),
        (row.adresa ?? '').trim(),
        (row.duvody ?? '').trim(),
        Number.isFinite(score) && row.skore !== '' ? score : null,
      ],
    });
    result.imported++;
  }
  for (let i = 0; i < statements.length; i += 100) await turso.batch(statements.slice(i, i + 100), 'write');
  return result;
}

/**
 * The company this caller should phone now: one they already hold, a callback
 * that has come due, or the next one nobody has. It is theirs from here on.
 */
export async function next(caller: string): Promise<CallLead | null> {
  await ensureTables();
  const pick = await turso.execute({
    sql: `SELECT id FROM call_leads
           WHERE (assigned_to = ?1 AND (outcome IS NULL OR (outcome = 'callback' AND callback_at <= unixepoch())))
              OR (outcome IS NULL AND (assigned_to IS NULL OR assigned_at < unixepoch() - ${STALE_ASSIGNMENT_S}))
              OR (outcome = 'callback' AND callback_at <= unixepoch() AND (assigned_to IS NULL OR assigned_at < unixepoch() - ${STALE_ASSIGNMENT_S}))
              OR (outcome = 'no_answer' AND attempts < ${MAX_ATTEMPTS} AND called_at < unixepoch() - ${RETRY_AFTER_S}
                  AND (assigned_to IS NULL OR assigned_to = ?1 OR assigned_at < unixepoch() - ${STALE_ASSIGNMENT_S}))
           ORDER BY (assigned_to = ?1 AND outcome IS NULL) DESC,
                    (outcome = 'callback') DESC,
                    (outcome IS NULL) DESC,
                    score DESC, created_at
           LIMIT 5`,
    args: [caller],
  });

  // Claim one; if another caller got there first, the update changes nothing and the next is tried.
  for (const row of pick.rows) {
    const claimed = await turso.execute({
      sql: `UPDATE call_leads SET assigned_to = ?1, assigned_at = unixepoch()
             WHERE id = ?2 AND (assigned_to IS NULL OR assigned_to = ?1 OR assigned_at < unixepoch() - ${STALE_ASSIGNMENT_S})`,
      args: [caller, String(row.id)],
    });
    if (claimed.rowsAffected > 0) {
      const lead = await turso.execute({ sql: 'SELECT * FROM call_leads WHERE id = ?', args: [String(row.id)] });
      return toLead(lead.rows[0] as Record<string, unknown>);
    }
  }
  return null;
}

export async function getCallLead(id: string): Promise<CallLead | null> {
  await ensureTables();
  const lead = await turso.execute({ sql: 'SELECT * FROM call_leads WHERE id = ?', args: [id] });
  return lead.rows[0] ? toLead(lead.rows[0] as Record<string, unknown>) : null;
}

export async function recordOutcome(input: {
  id: string;
  caller: string;
  outcome: Outcome;
  note: string;
  callbackAt?: number | null;
  email?: string;
}) {
  await ensureTables();
  await turso.batch(
    [
      {
        sql: `UPDATE call_leads
                 SET outcome = ?, note = ?, callback_at = ?, attempts = attempts + 1, called_at = unixepoch(), called_by = ?,
                     email = CASE WHEN ? != '' THEN ? ELSE email END,
                     assigned_to = CASE WHEN ? IN ('callback', 'no_answer') THEN assigned_to ELSE NULL END
               WHERE id = ?`,
        args: [
          input.outcome, input.note, input.outcome === 'callback' || input.outcome === 'meeting' ? input.callbackAt ?? null : null, input.caller,
          input.email ?? '', input.email ?? '', input.outcome, input.id,
        ],
      },
      { sql: 'INSERT INTO call_log (lead_id, caller, outcome, note) VALUES (?, ?, ?, ?)', args: [input.id, input.caller, input.outcome, input.note] },
    ],
    'write'
  );
}

export async function markReportSent(id: string) {
  await turso.execute({ sql: 'UPDATE call_leads SET report_sent_at = unixepoch() WHERE id = ?', args: [id] });
}

export async function stats(caller: string) {
  await ensureTables();
  const all = await turso.execute(
    `SELECT COUNT(*) AS total,
            SUM(outcome IS NULL) AS waiting,
            SUM(outcome = 'callback') AS callbacks,
            SUM(outcome = 'no_answer') AS no_answer,
            SUM(outcome IN ('wants_report', 'meeting')) AS interested,
            SUM(outcome IN ('not_interested', 'do_not_call', 'wrong_number')) AS closed
       FROM call_leads`
  );
  const today = await turso.execute({
    sql: `SELECT caller, COUNT(*) AS calls, SUM(outcome IN ('wants_report', 'meeting')) AS interested
            FROM call_log WHERE date(created_at, 'unixepoch', 'localtime') = date('now', 'localtime')
           GROUP BY caller ORDER BY calls DESC`,
    args: [],
  });
  const n = (v: unknown) => Number(v ?? 0);
  const row = all.rows[0];
  return {
    total: n(row.total), waiting: n(row.waiting), callbacks: n(row.callbacks), noAnswer: n(row.no_answer),
    interested: n(row.interested), closed: n(row.closed),
    today: today.rows.map((r) => ({ caller: String(r.caller), calls: n(r.calls), interested: n(r.interested) })),
    mineToday: n(today.rows.find((r) => String(r.caller) === caller)?.calls),
  };
}

/** For whoever runs the team: what has been called, newest first. */
export async function list(filter: 'interested' | 'callbacks' | 'called', limit = 200): Promise<CallLead[]> {
  await ensureTables();
  const where =
    filter === 'interested' ? "outcome IN ('wants_report', 'meeting')" : filter === 'callbacks' ? "outcome = 'callback'" : 'outcome IS NOT NULL';
  const rows = await turso.execute({ sql: `SELECT * FROM call_leads WHERE ${where} ORDER BY called_at DESC LIMIT ?`, args: [limit] });
  return rows.rows.map((r) => toLead(r as Record<string, unknown>));
}
