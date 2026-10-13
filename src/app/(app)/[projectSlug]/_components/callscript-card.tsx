"use client";

import { reasonsFor } from "@/lib/callscript";

/**
 * Build a human-readable hook sentence from findings.
 * "Díval jsem se na váš web {domain} a všiml jsem si, že {finding1} a {finding2}."
 */
function buildHookSentence(
  findings: string,
  website: string | null,
): { sentence: string; impact: string } | null {
  const reasons = reasonsFor(findings);
  if (reasons.length === 0) return null;

  const domain = website
    ? website
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/$/, "")
    : null;
  const noSite = !domain || /nemá web|jen profil na sociální síti/.test(findings);

  const found = reasons.map((r) => r.say).join(" a ");

  const sentence = noSite
    ? `Hledal jsem firmy z vašeho oboru ve vašem okolí a ${found}.`
    : `Hledal jsem firmy z vašeho oboru a narazil jsem na váš web ${domain}. Otevřel jsem ho z telefonu a ${found}.`;

  const impact = reasons[0].impact;

  return { sentence, impact };
}

/**
 * Check if text looks like raw technical findings (pipe-separated technical terms).
 */
function isRawFindings(text: string): boolean {
  return /\|/.test(text) && /responziv|HTTPS|HTML|OG tag|tabulk|viewport|PageSpeed/i.test(text);
}

export function CallscriptCard({
  hookText,
  hookSource,
  findings,
  website,
}: {
  hookText: string | null;
  hookSource: string | null;
  findings: string | null;
  website?: string | null;
}) {
  // If hookText exists but is raw technical data, treat it as findings instead
  const effectiveFindings = findings
    ?? (hookText && isRawFindings(hookText) ? hookText : null);
  const effectiveHook = hookText && !isRawFindings(hookText) ? hookText : null;

  const hook = effectiveFindings
    ? buildHookSentence(effectiveFindings, website ?? null)
    : null;

  let displayText: string;
  let impactText: string | null = null;
  let sourceLabel: string;

  if (effectiveHook) {
    // Custom hook text (e.g. from AI audit) — show as-is
    displayText = effectiveHook;
    sourceLabel = hookSource === "ai_audit" ? "AI audit" : hookSource ?? "import";
  } else if (hook) {
    // Generated from findings
    displayText = hook.sentence;
    impactText = hook.impact;
    sourceLabel = hookSource === "ai_audit" ? "AI audit" : "průzkum webu";
  } else {
    displayText =
      "Průzkum webu nemáme. Začni: \u201eHledal jsem firmy z vašeho oboru a narazil jsem na vás\u2026\u201c";
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
      {impactText && (
        <p className="text-[13px] text-accent/80 mt-2">
          {impactText}
        </p>
      )}
    </div>
  );
}
