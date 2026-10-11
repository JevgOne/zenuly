"use client";

import type { LeadCardData } from "@/app/actions/leads";
import { CallscriptCard } from "./callscript-card";
import { FirstSentence } from "./first-sentence";
import { LeadDetailsGrid } from "./lead-details-grid";
import { HistoryList } from "./history-list";

function formatPhone(phone: string) {
  // Format +420XXXXXXXXX → +420 XXX XXX XXX
  const clean = phone.replace(/\s/g, "");
  if (clean.length === 13 && clean.startsWith("+420")) {
    const num = clean.slice(4);
    return `+420 ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
  }
  return phone;
}

export function LeadCard({
  lead,
  callerName,
  onOpenOutcome,
  isMobile,
}: {
  lead: LeadCardData;
  callerName: string;
  onOpenOutcome?: () => void;
  isMobile?: boolean;
}) {
  const subtitle = [
    lead.custom_data?.sector as string,
    lead.city,
    lead.contact_person,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      {/* Company header */}
      <div>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-[22px] sm:text-[26px] font-semibold text-text leading-tight">
              {lead.company_name}
            </h1>
            {subtitle && (
              <p className="text-[14px] text-muted mt-1">{subtitle}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted bg-bg px-2.5 py-1 rounded font-medium">
              Pokus {lead.attempt_count} / {lead.max_attempts}
            </span>
          </div>
        </div>

        {/* Call button */}
        <a
          href={`tel:${lead.phone.replace(/\s/g, "")}`}
          className="mt-4 flex items-center justify-center gap-2.5 bg-accent text-white rounded-lg h-14 text-[18px] font-semibold hover:bg-accent/90 transition-colors w-full sm:w-auto sm:px-8 sm:h-12 sm:text-[16px]"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M7.5 3.5H5a1.5 1.5 0 00-1.5 1.5v1a11 11 0 0011 11h1A1.5 1.5 0 0017 15.5v-2.38a1 1 0 00-.68-.95l-2.8-.93a1 1 0 00-1.08.35l-.84 1.05a9 9 0 01-4.24-4.24l1.05-.84a1 1 0 00.35-1.08l-.93-2.8a1 1 0 00-.95-.68H7.5z"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </svg>
          {formatPhone(lead.phone)}
        </a>

        {lead.website && (
          <a
            href={
              lead.website.startsWith("http")
                ? lead.website
                : `https://${lead.website}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent hover:underline"
          >
            {lead.website
              .replace(/^https?:\/\//, "")
              .replace(/^www\./, "")
              .replace(/\/$/, "")}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path
                d="M5.5 3H3.5A1.5 1.5 0 002 4.5v6A1.5 1.5 0 003.5 12h6A1.5 1.5 0 0011 10.5V8.5M8 2h4v4M12 2L6.5 7.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        )}
      </div>

      {/* Callscript hook */}
      <CallscriptCard
        hookText={lead.hook_text}
        hookSource={lead.hook_source}
        findings={lead.findings}
      />

      {/* First sentence */}
      <FirstSentence
        company={lead.company_name}
        website={lead.website}
        findings={lead.findings}
        callerName={callerName}
      />

      {/* Details grid */}
      <LeadDetailsGrid
        stageName={lead.stage_name}
        priority={lead.priority}
        phoneSource={lead.phone_source}
        customData={lead.custom_data}
      />

      {/* History */}
      <HistoryList calls={lead.calls} emails={lead.emails} />

      {/* Mobile CTA */}
      {isMobile && onOpenOutcome && (
        <div className="fixed bottom-[78px] left-0 right-0 p-4 bg-surface border-t border-line z-30">
          <button
            type="button"
            onClick={onOpenOutcome}
            className="w-full h-[52px] bg-accent text-white rounded-lg font-semibold text-[15px] hover:bg-accent/90 transition-colors"
          >
            Zapsat výsledek hovoru
          </button>
        </div>
      )}
    </div>
  );
}
