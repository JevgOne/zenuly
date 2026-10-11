import "server-only";
import type { ReportData } from "@/app/actions/report";

function formatCzechDateEmail(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const days = [
    "ned\u011ble",
    "pond\u011bl\u00ed",
    "\u00fater\u00fd",
    "st\u0159eda",
    "\u010dtvrtek",
    "p\u00e1tek",
    "sobota",
  ];
  return `${days[d.getDay()]} ${d.getDate()}. ${d.getMonth() + 1}.`;
}

export function renderReportEmail(report: ReportData): {
  subject: string;
  html: string;
} {
  const subject = `${report.project_name}: ${report.total_meetings} konzultac\u00ed ze ${report.total_calls} hovor\u016f \u2014 ${formatCzechDateEmail(report.date)}`;

  const o = report.outcomes;

  const kpis = [
    {
      label: "Hovory",
      value: report.total_calls,
      sub: `${report.avg_calls_per_hour}/h \u00b7 c\u00edl ${report.target_per_hour}`,
    },
    {
      label: "Dovol\u00e1no",
      value: report.total_reached,
      sub: `${report.reached_pct} % hovor\u016f`,
    },
    {
      label: "Konzultace",
      value: report.total_meetings,
      sub: `${report.total_reached > 0 ? Math.round((report.total_meetings / report.total_reached) * 100) : 0} % dovolan\u00fdch`,
      accent: true,
    },
    {
      label: "Prezentace",
      value: o.decks,
      sub:
        report.overdue_decks > 0
          ? `${report.overdue_decks} po term\u00ednu`
          : "OK",
      urgent: report.overdue_decks > 0,
    },
    {
      label: "Nab\u00eddky",
      value: o.offers,
      sub:
        report.overdue_offers > 0
          ? `${report.overdue_offers} po term\u00ednu`
          : "OK",
      urgent: report.overdue_offers > 0,
    },
    {
      label: "Nem\u00e1 z\u00e1jem",
      value: o.not_interested,
      sub: `${report.not_interested_pct} % dovolan\u00fdch`,
    },
  ];

  const kpiCells = kpis
    .map((k) => {
      const bg = k.accent ? "#E8ECFA" : "#FDFDFB";
      const border = k.accent ? "2px solid #2449C9" : "1px solid #E4E2DC";
      const labelColor = k.accent ? "#1B3699" : "#5E6168";
      const valueColor = k.accent ? "#12245F" : "#16181D";
      const subColor = k.urgent ? "#A3410E" : labelColor;
      return `<td style="padding:8px;width:33%">
        <div style="padding:16px;background:${bg};border:${border};border-radius:12px">
          <div style="font-size:13px;color:${labelColor}">${k.label}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:28px;font-weight:500;color:${valueColor};margin:4px 0">${k.value}</div>
          <div style="font-size:13px;color:${subColor}">${k.sub}</div>
        </div>
      </td>`;
    });

  const maxLostCount = report.lost_reasons[0]?.count ?? 1;
  const lostBars = report.lost_reasons
    .slice(0, 6)
    .map((r, i) => {
      const pct = Math.round((r.count / maxLostCount) * 100);
      const barColor = i === 0 ? "#2449C9" : "#8A8D94";
      return `<tr>
        <td style="padding:4px 0;font-size:14px;width:140px">${r.reason_name}</td>
        <td style="padding:4px 8px">
          <div style="height:10px;border-radius:5px;background:#ECEAE4">
            <div style="width:${pct}%;height:10px;border-radius:5px;background:${barColor}"></div>
          </div>
        </td>
        <td style="padding:4px 0;font-family:'IBM Plex Mono',monospace;text-align:right;width:40px;font-size:14px">${r.count}</td>
      </tr>`;
    })
    .join("");

  const opRows = report.operators
    .map((op) => {
      const cphStyle = op.below_target ? "color:#A3410E" : "";
      const cphText = op.below_target
        ? `${op.calls_per_hour} pod c\u00edlem`
        : `${op.calls_per_hour}`;
      return `<tr>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;font-weight:500">${op.operator_name}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;text-align:right;font-family:'IBM Plex Mono',monospace">${op.hours.toFixed(1).replace(".", ",")}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;text-align:right;font-family:'IBM Plex Mono',monospace">${op.calls}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;text-align:right;font-family:'IBM Plex Mono',monospace;${cphStyle}">${cphText}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;text-align:right;font-family:'IBM Plex Mono',monospace">${op.reached}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #ECEAE4;text-align:right;font-family:'IBM Plex Mono',monospace">${op.meetings}</td>
      </tr>`;
    })
    .join("");

  const funnelMax = report.funnel.reached || 1;
  const funnelLevels = [
    { label: "Dovol\u00e1no", value: report.funnel.reached },
    { label: "Z\u00e1jem", value: report.funnel.interest },
    { label: "Konzultace", value: report.funnel.meetings },
  ];
  const funnelBars = funnelLevels
    .map((f, i) => {
      const pct = Math.max(Math.round((f.value / funnelMax) * 100), 2);
      const color = i === 2 ? "#2449C9" : "#8A8D94";
      return `<tr>
        <td style="padding:6px 0">
          <div style="font-size:14px;margin-bottom:4px">
            <span>${f.label}</span>
            <span style="font-family:'IBM Plex Mono',monospace;float:right">${f.value}</span>
          </div>
          <div style="height:12px;border-radius:6px;background:${color};width:${pct}%"></div>
        </td>
      </tr>`;
    })
    .join("");

  const overdueParts: string[] = [];
  if (report.overdue_decks > 0)
    overdueParts.push(`${report.overdue_decks} prezentace po term\u00ednu`);
  if (report.overdue_callbacks > 0)
    overdueParts.push(
      `${report.overdue_callbacks} propadl\u00e9 callbacky`
    );
  const overdueText =
    overdueParts.length > 0
      ? `Nedod\u011blky: ${overdueParts.join(", ")}.`
      : "";

  const html = `<!DOCTYPE html>
<html lang="cs">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#F6F5F1;font-family:'IBM Plex Sans',Arial,sans-serif;color:#16181D">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F6F5F1">
<tr><td align="center" style="padding:32px 16px">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- Header -->
  <tr><td style="padding-bottom:24px">
    <div style="font-size:13px;color:#5E6168;margin-bottom:4px">Denn\u00ed report \u00b7 ${formatCzechDateEmail(report.date)}</div>
    <div style="font-size:24px;font-weight:600;line-height:1.2">${report.project_name} dnes: ${report.total_meetings} konzultac\u00ed ze ${report.total_calls} hovor\u016f</div>
  </td></tr>

  <!-- KPI Grid (2x3) -->
  <tr><td>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>${kpiCells[0]}${kpiCells[1]}${kpiCells[2]}</tr>
      <tr>${kpiCells[3]}${kpiCells[4]}${kpiCells[5]}</tr>
    </table>
  </td></tr>

  <!-- Spacer -->
  <tr><td style="padding:16px 0"></td></tr>

  ${
    report.lost_reasons.length > 0
      ? `<!-- Lost reasons -->
  <tr><td style="padding:20px;background:#FDFDFB;border:1px solid #E4E2DC;border-radius:12px;margin-bottom:16px">
    <div style="font-size:18px;font-weight:600;margin-bottom:12px">Pro\u010d odm\u00edtli</div>
    <table width="100%" cellpadding="0" cellspacing="0">${lostBars}</table>
  </td></tr>
  <tr><td style="padding:8px 0"></td></tr>`
      : ""
  }

  ${
    report.operators.length > 0
      ? `<!-- Operators -->
  <tr><td style="padding:20px;background:#FDFDFB;border:1px solid #E4E2DC;border-radius:12px">
    <div style="font-size:18px;font-weight:600;margin-bottom:12px">Oper\u00e1to\u0159i</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
      <tr style="color:#5E6168">
        <th style="padding:8px;text-align:left;font-weight:500;border-bottom:1px solid #E4E2DC">Oper\u00e1tor</th>
        <th style="padding:8px;text-align:right;font-weight:500;border-bottom:1px solid #E4E2DC">Hodiny</th>
        <th style="padding:8px;text-align:right;font-weight:500;border-bottom:1px solid #E4E2DC">Hovory</th>
        <th style="padding:8px;text-align:right;font-weight:500;border-bottom:1px solid #E4E2DC">Za hodinu</th>
        <th style="padding:8px;text-align:right;font-weight:500;border-bottom:1px solid #E4E2DC">Dovol\u00e1no</th>
        <th style="padding:8px;text-align:right;font-weight:500;border-bottom:1px solid #E4E2DC">Konzultace</th>
      </tr>
      ${opRows}
    </table>
  </td></tr>
  <tr><td style="padding:8px 0"></td></tr>`
      : ""
  }

  <!-- Funnel -->
  <tr><td style="padding:20px;background:#FDFDFB;border:1px solid #E4E2DC;border-radius:12px">
    <div style="font-size:18px;font-weight:600;margin-bottom:12px">Kde hovory padaj\u00ed</div>
    <table width="100%" cellpadding="0" cellspacing="0">${funnelBars}</table>
    ${overdueText ? `<div style="font-size:13px;color:#5E6168;margin-top:8px">${overdueText}</div>` : ""}
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 0 0;text-align:center;font-size:12px;color:#5E6168">
    Odesl\u00e1no z <a href="https://zenuly.cz" style="color:#2449C9">Zenuly CRM</a>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html };
}
