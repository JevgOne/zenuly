import type { ReportData } from "@/app/actions/report";

type KpiCardProps = {
  label: string;
  value: number;
  subtitle: string;
  accent?: boolean;
  urgentSubtitle?: boolean;
};

function KpiCard({
  label,
  value,
  subtitle,
  accent,
  urgentSubtitle,
}: KpiCardProps) {
  return (
    <div
      className={`p-[18px] rounded-2xl flex flex-col gap-1.5 ${
        accent
          ? "bg-accent-soft border-[1.5px] border-accent"
          : "bg-surface border border-line"
      }`}
    >
      <span
        className={`text-[13px] ${accent ? "text-[#1B3699]" : "text-muted"}`}
      >
        {label}
      </span>
      <span
        className={`font-mono text-[30px] font-medium ${
          accent ? "text-[#12245F]" : "text-text"
        }`}
      >
        {value}
      </span>
      <span
        className={`text-[13px] ${
          urgentSubtitle
            ? "text-urgent"
            : accent
              ? "text-[#1B3699]"
              : "text-muted"
        }`}
      >
        {subtitle}
      </span>
    </div>
  );
}

export function KpiGrid({ report }: { report: ReportData }) {
  const o = report.outcomes;
  const reachedPct = report.reached_pct;
  const notInterestedPct = report.not_interested_pct;

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
      <KpiCard
        label="Hovory"
        value={report.total_calls}
        subtitle={`${report.avg_calls_per_hour} / h · cíl ${report.target_per_hour}`}
      />
      <KpiCard
        label="Dovoláno"
        value={report.total_reached}
        subtitle={`${reachedPct} % hovorů`}
      />
      <KpiCard
        label="Konzultace"
        value={report.total_meetings}
        subtitle={`${report.total_reached > 0 ? Math.round((report.total_meetings / report.total_reached) * 100) : 0} % dovolaných`}
        accent
      />
      <KpiCard
        label="Prezentace odeslány"
        value={o.decks}
        subtitle={
          report.overdue_decks > 0
            ? `${report.overdue_decks} po termínu`
            : "v pořádku"
        }
        urgentSubtitle={report.overdue_decks > 0}
      />
      <KpiCard
        label="Nabídky odeslány"
        value={o.offers}
        subtitle={
          report.overdue_offers > 0
            ? `${report.overdue_offers} po termínu`
            : "v pořádku"
        }
        urgentSubtitle={report.overdue_offers > 0}
      />
      <KpiCard
        label="Nemá zájem"
        value={o.not_interested}
        subtitle={`${notInterestedPct} % dovolaných`}
      />
    </div>
  );
}
