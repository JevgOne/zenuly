"use client";

import { useState } from "react";
import { buildScript } from "@/lib/callscript";

export function ObjectionChips({
  company,
  website,
  findings,
  callerName,
}: {
  company: string;
  website: string | null;
  findings: string | null;
  callerName: string;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const script = buildScript(
    { company, website: website ?? "", reasons: findings ?? "" },
    callerName
  );

  // Show first 5 most common objections as chips
  const chips = script.objections.slice(0, 5);

  return (
    <div className="hidden xl:block">
      <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block mb-2">
        Námitky – ťukni během hovoru
      </span>
      <div className="flex flex-wrap gap-2">
        {chips.map((obj, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setExpanded(expanded === i ? null : i)}
            className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              expanded === i
                ? "bg-accent text-white"
                : "bg-bg text-text border border-line hover:bg-line"
            }`}
          >
            {obj.they.replace(/\.$/, "").slice(0, 25)}
            {obj.they.length > 25 ? "…" : ""}
          </button>
        ))}
      </div>
      {expanded !== null && chips[expanded] && (
        <div className="mt-3 bg-accent-soft rounded-lg p-3">
          <p className="text-[13px] font-medium text-muted mb-1">
            {chips[expanded].they}
          </p>
          <p className="text-[14px] text-accent font-medium">
            &bdquo;{chips[expanded].you}&ldquo;
          </p>
        </div>
      )}
    </div>
  );
}
