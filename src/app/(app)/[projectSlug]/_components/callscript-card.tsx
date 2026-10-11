"use client";

import { reasonsFor } from "@/lib/callscript";

export function CallscriptCard({
  hookText,
  hookSource,
  findings,
}: {
  hookText: string | null;
  hookSource: string | null;
  findings: string | null;
}) {
  const hasHook = !!hookText;
  const reasons = findings ? reasonsFor(findings) : [];

  // Generate display text
  let displayText: string;
  let sourceLabel: string;

  if (hasHook) {
    displayText = hookText!;
    sourceLabel = hookSource === "ai_audit" ? "AI audit" : hookSource ?? "import";
  } else if (reasons.length > 0) {
    displayText = reasons[0].say + ". " + reasons[0].impact;
    sourceLabel = "findings";
  } else {
    displayText = `Audit webu nemáme. Začni: „Volám kvůli vašemu webu, mám pro vás jednu věc…"`;
    sourceLabel = "fallback";
  }

  return (
    <div className="rounded-lg bg-accent-soft p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-accent">
          Háček pro otevření
        </span>
        {sourceLabel !== "fallback" && (
          <span className="text-[11px] font-medium bg-surface text-muted px-2 py-0.5 rounded">
            {sourceLabel}
          </span>
        )}
      </div>
      <p className="text-[15px] leading-relaxed text-accent font-medium">
        {displayText}
      </p>
      {reasons.length > 1 && (
        <p className="text-[13px] text-accent/80 mt-2">
          {reasons[1].say}. {reasons[1].impact}
        </p>
      )}
    </div>
  );
}
