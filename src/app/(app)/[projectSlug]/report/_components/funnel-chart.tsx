export function FunnelChart({
  funnel,
  overdueDecks,
  overdueCallbacks,
}: {
  funnel: { reached: number; interest: number; meetings: number };
  overdueDecks: number;
  overdueCallbacks: number;
}) {
  const maxVal = funnel.reached || 1;

  const levels = [
    { label: "Dovol\u00e1no", value: funnel.reached, color: "bg-muted" },
    {
      label: "Z\u00e1jem (podklady nebo konzultace)",
      value: funnel.interest,
      color: "bg-muted",
    },
    { label: "Konzultace", value: funnel.meetings, color: "bg-accent" },
  ];

  const overdueParts: string[] = [];
  if (overdueDecks > 0) {
    overdueParts.push(`${overdueDecks} prezentace po term\u00ednu`);
  }
  if (overdueCallbacks > 0) {
    overdueParts.push(
      `${overdueCallbacks} ${overdueCallbacks === 1 ? "propadl\u00fd callback" : "propadl\u00e9 callbacky"}`
    );
  }
  const overdueText =
    overdueParts.length > 0
      ? `Nedod\u011blky: ${overdueParts.join(", ")}.`
      : null;

  return (
    <div className="flex-[1_1_360px] min-w-0 p-[22px] bg-surface border border-line rounded-2xl flex flex-col gap-[14px]">
      <h2 className="text-lg font-semibold text-text">
        Kde hovory padaj\u00ed
      </h2>
      {levels.map((level) => (
        <div key={level.label} className="flex flex-col gap-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-text">{level.label}</span>
            <span className="font-mono">{level.value}</span>
          </div>
          <div
            className={`h-3 rounded-md ${level.color}`}
            style={{
              width: `${Math.max((level.value / maxVal) * 100, 2)}%`,
            }}
          />
        </div>
      ))}
      {overdueText && (
        <span className="text-[13px] text-muted">{overdueText}</span>
      )}
    </div>
  );
}
