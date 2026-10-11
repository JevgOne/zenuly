import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, unauthorizedResponse } from '@/lib/auth/require-auth';
import { hasPermission } from '@/lib/auth/permissions';
import { EMAIL_CONFIG, sendEmail } from '@/lib/email/resend-client';
import { sendTelegramText } from '@/lib/telegram';
import { buildEmailHtml } from '@/lib/audits/report';
import { audit } from '@/lib/outreach/improve';
import { OUTREACH } from '@/lib/outreach/email';
import { EMAIL } from '@/lib/outreach/csv';
import { buildScript } from '@/lib/calls/script';
import { OUTCOMES, getCallLead, importCallLeads, list, markReportSent, next, recordOutcome, stats, type Outcome } from '@/lib/calls/store';

/**
 * The call list for the people phoning companies with a weak website.
 *
 * GET                      counts, and with ?list=… what has been called
 * POST { action: 'next' }  the company to phone now, with its script
 * POST { action: 'outcome', id, outcome, note, callbackAt?, email? }
 * POST { action: 'import', csv }   owner and admin only
 *
 * A report is e-mailed only on the outcome "wants_report": the person said yes
 * on the phone, which is the consent an unrequested e-mail never had.
 */
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !hasPermission(user.role, 'calls')) return unauthorizedResponse();

  const filter = request.nextUrl.searchParams.get('list');
  const canManage = hasPermission(user.role, 'users');
  return NextResponse.json({
    success: true,
    caller: user.name,
    canManage,
    stats: await stats(user.name),
    outcomes: OUTCOMES,
    list: canManage && (filter === 'interested' || filter === 'callbacks' || filter === 'called') ? await list(filter) : undefined,
  });
}

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !hasPermission(user.role, 'calls')) return unauthorizedResponse();
  const body = await request.json().catch(() => ({}));

  if (body.action === 'import') {
    if (!hasPermission(user.role, 'users')) return unauthorizedResponse();
    if (typeof body.csv !== 'string' || !body.csv.trim()) return NextResponse.json({ success: false, error: 'Chybí obsah CSV.' }, { status: 400 });
    return NextResponse.json({ success: true, ...(await importCallLeads(body.csv)) });
  }

  if (body.action === 'next') {
    const lead = await next(user.name);
    return NextResponse.json({ success: true, lead, script: lead ? buildScript(lead, user.name.split(' ')[0]) : null });
  }

  if (body.action === 'outcome') {
    const outcome = body.outcome as Outcome;
    if (typeof body.id !== 'string' || !(outcome in OUTCOMES)) return NextResponse.json({ success: false, error: 'Neplatný výsledek.' }, { status: 400 });
    const lead = await getCallLead(body.id);
    if (!lead) return NextResponse.json({ success: false, error: 'Firma nenalezena.' }, { status: 404 });

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (email && !EMAIL.test(email) && outcome === 'meeting') {
      return NextResponse.json({ success: false, error: 'E-mail nemá správný tvar.' }, { status: 400 });
    }
    if (outcome === 'wants_report' && !EMAIL.test(email)) {
      return NextResponse.json({ success: false, error: 'Zadejte e-mail, na který má rozbor přijít.' }, { status: 400 });
    }
    // For a callback this is when to phone again; for a consultation, when Jevgenij calls them.
    const callbackAt =
      outcome === 'callback' || outcome === 'meeting'
        ? Math.floor(new Date(body.callbackAt ?? Date.now() + 86_400_000).getTime() / 1000)
        : null;

    await recordOutcome({ id: lead.id, caller: user.name, outcome, note: String(body.note ?? '').slice(0, 2000), callbackAt, email });

    let report: 'sent' | 'failed' | 'no-website' | undefined;
    if (outcome === 'wants_report') {
      // The site is read now, while the caller moves on; a company without a
      // website gets no report and the team prepares a proposal instead.
      if (!lead.website) report = 'no-website';
      else {
        try {
          const result = await audit(lead.website);
          const domain = lead.website.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
          const intro =
            `Dobrý den,\n\njak jsme se domluvili po telefonu, posílám rozbor webu ${domain}. Najdete v něm celkové skóre, ` +
            `kontrolu bod po bodu a u každé věci i to, jak ji opravit. Kdybyste k čemukoli měli otázku, stačí na tento e-mail odpovědět.\n\n${OUTREACH.name}`;
          const sent = await sendEmail({
            from: OUTREACH.from,
            to: email,
            subject: `Rozbor webu ${domain} — ${result.score}/100 a co zlepšit`,
            html: buildEmailHtml(result, { intro }),
          });
          report = sent.success ? 'sent' : 'failed';
          if (sent.success) await markReportSent(lead.id);
        } catch {
          report = 'failed';
        }
      }
    }

    if (outcome === 'wants_report' || outcome === 'meeting') {
      const at = callbackAt ? new Date(callbackAt * 1000).toLocaleString('cs-CZ', { timeZone: 'Europe/Prague', weekday: 'long', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const what = outcome === 'meeting' ? `KONZULTACE domluvena na ${at}` : report === 'sent' ? 'chce rozbor (odeslán)' : 'chce rozbor (NEODEŠEL, pošlete ručně)';
      const who = `${lead.company || lead.website || lead.phone} · ${lead.phone}${email ? ` · ${email}` : ''}`;
      await Promise.allSettled([
        sendTelegramText(`📞 <b>Zájem z volání</b>\n${esc(who)}\n${esc(what)}\nVolal(a): ${esc(user.name)}${body.note ? `\nPoznámka: ${esc(String(body.note).slice(0, 300))}` : ''}`),
        sendEmail({
          to: EMAIL_CONFIG.adminEmail,
          subject: `📞 Zájem z volání: ${lead.company || lead.website || lead.phone}`,
          html: `<p><strong>${esc(who)}</strong></p><p>${esc(what)}. Volal(a) ${esc(user.name)}.</p>${body.note ? `<p>Poznámka: ${esc(String(body.note))}</p>` : ''}`,
        }),
      ]);
    }
    return NextResponse.json({ success: true, report });
  }

  return NextResponse.json({ success: false, error: 'Neznámá akce' }, { status: 400 });
}
