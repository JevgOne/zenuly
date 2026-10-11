"use client";

import { buildScript } from "@/lib/callscript";

export function FirstSentence({
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
  const script = buildScript(
    { company, website: website ?? "", reasons: findings ?? "" },
    callerName
  );
  const introStep = script.steps[0];
  const reasonStep = script.steps[1];

  return (
    <div className="rounded-lg border border-line bg-surface p-4 space-y-4">
      {/* Step 1: Intro */}
      <div>
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-2 block">
          {introStep.title}
        </span>
        <p className="text-[15px] leading-relaxed text-text">
          &bdquo;{introStep.say}&ldquo;
        </p>
        {introStep.hint && (
          <p className="text-[13px] text-muted mt-2">{introStep.hint}</p>
        )}
      </div>

      {/* Step 2: Why you're calling (finding) */}
      {reasonStep && (
        <div className="border-t border-line pt-4">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-accent mb-2 block">
            {reasonStep.title}
          </span>
          <p className="text-[15px] leading-relaxed text-text">
            &bdquo;{reasonStep.say}&ldquo;
          </p>
          {reasonStep.hint && (
            <p className="text-[13px] text-muted mt-2">{reasonStep.hint}</p>
          )}
        </div>
      )}
    </div>
  );
}
