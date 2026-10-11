type LostReason = {
  reason_name: string;
  reason_key: string;
  count: number;
};

type LostTrend = {
  reason_name: string;
  reason_key: string;
  count_7d: number;
  pct_7d: number;
};

export function LostReasonsChart({
  reasons,
  trend,
}: {
  reasons: LostReason[];
  trend: LostTrend[];
}) {
  if (reasons.length === 0) {
    return (
      <div className="flex-[999_1_560px] min-w-0 p-[22px] bg-surface border border-line rounded-2xl">
        <h2 className="text-lg font-semibold text-text">
          Pro\u010d odm\u00edtli
        </h2>
        <p className="text-sm text-muted mt-4">Dnes \u017e\u00e1dn\u00e9 ztr\u00e1ty.</p>
      </div>
    );
  }

  const maxCount = reasons[0]?.count ?? 1;
  const topReason = reasons[0];
  const total = reasons.reduce((sum, r) => sum + r.count, 0);
  const topPctToday =
    total > 0 ? Math.round((topReason.count / total) * 100) : 0;

  const topTrend = trend.find((t) => t.reason_key === topReason.reason_key);
  const topPct7d = topTrend?.pct_7d ?? 0;

  let trendText = "";
  if (topTrend && topPct7d !== topPctToday) {
    const direction = topPctToday > topPct7d ? "roste" : "kles\u00e1";
    trendText = `Za 7 dn\u00ed \u201e${topReason.reason_name}\u201c ${direction} z ${topPct7d}\u00a0% na ${topPctToday}\u00a0%.`;
  }

  return (
    <div className="flex-[999_1_560px] min-w-0 p-[22px] bg-surface border border-line rounded-2xl flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-text">
        Pro\u010d odm\u00edtli: \u201e{topReason.reason_name}\u201c je{" "}
        {topPctToday}\u00a0% d\u016fvod\u016f
      </h2>
      <div className="flex flex-col gap-3">
        {reasons.map((r, i) => (
          <div
            key={r.reason_key}
            className="grid grid-cols-[140px_minmax(0,1fr)_40px] items-center gap-3 text-sm"
          >
            <span className="text-text">{r.reason_name}</span>
            <div className="h-2.5 rounded-full bg-bg">
              <div
                className={`h-2.5 rounded-full ${i === 0 ? "bg-accent" : "bg-muted"}`}
                style={{ width: `${(r.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="font-mono text-right text-text">{r.count}</span>
          </div>
        ))}
      </div>
      {trendText && (
        <span className="text-[13px] text-muted">{trendText}</span>
      )}
    </div>
  );
}
