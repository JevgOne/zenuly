"use client";

const PRIORITY_LABELS: Record<number, string> = {
  1: "Nízká",
  2: "Běžná",
  3: "Vysoká",
};

const PHONE_SOURCE_LABELS: Record<string, string> = {
  web_firmy: "Web firmy",
  profil_firmy: "Profil firmy",
  databaze: "Databáze",
  poptavka: "Poptávka",
  lead_finder: "Lead Finder",
};

export function LeadDetailsGrid({
  stageName,
  priority,
  phoneSource,
  customData,
}: {
  stageName: string;
  priority: number;
  phoneSource: string;
  customData: Record<string, unknown>;
}) {
  const items = [
    { label: "Fáze", value: stageName },
    {
      label: "Priorita",
      value: (
        <span className="flex items-center gap-1.5">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              priority === 3
                ? "bg-accent"
                : priority === 1
                  ? "border border-line-strong"
                  : "bg-muted/40"
            }`}
          />
          {PRIORITY_LABELS[priority] ?? "Běžná"}
        </span>
      ),
    },
    {
      label: "Zdroj čísla",
      value: PHONE_SOURCE_LABELS[phoneSource] ?? phoneSource,
    },
    {
      label: "Nejčastěji berou",
      value: (customData?.best_time as string) ?? "—",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-px bg-line rounded-lg overflow-hidden">
      {items.map((item) => (
        <div key={item.label} className="bg-surface p-3">
          <span className="text-[11px] font-medium text-muted block mb-0.5">
            {item.label}
          </span>
          <span className="text-[14px] text-text font-medium">{item.value}</span>
        </div>
      ))}
    </div>
  );
}
