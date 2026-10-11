"use client";

import { useState } from "react";

type CallEntry = {
  id: string;
  outcome_name: string;
  outcome_key: string;
  outcome_group: string;
  operator_name: string;
  note: string | null;
  created_at: string;
};

type EmailEntry = {
  id: string;
  template_key: string;
  subject: string;
  sent_at: string;
  sent_by: string | null;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });
}

const GROUP_COLORS: Record<string, string> = {
  interest: "text-accent",
  retry: "text-muted",
  end: "text-urgent",
};

export function HistoryList({
  calls,
  emails,
}: {
  calls: CallEntry[];
  emails: EmailEntry[];
}) {
  const [tab, setTab] = useState<"calls" | "emails">("calls");
  const hasEmails = emails.length > 0;

  if (calls.length === 0 && emails.length === 0) {
    return (
      <div className="py-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block mb-3">
          Historie
        </span>
        <p className="text-[13px] text-muted">Zatim zadne hovory.</p>
      </div>
    );
  }

  return (
    <div className="py-4">
      {/* Tab header */}
      <div className="flex items-center gap-4 mb-3">
        <button
          type="button"
          onClick={() => setTab("calls")}
          className={`text-[11px] font-bold uppercase tracking-[0.06em] transition-colors ${
            tab === "calls" ? "text-text" : "text-muted hover:text-text"
          }`}
        >
          Hovory ({calls.length})
        </button>
        {hasEmails && (
          <button
            type="button"
            onClick={() => setTab("emails")}
            className={`text-[11px] font-bold uppercase tracking-[0.06em] transition-colors ${
              tab === "emails" ? "text-text" : "text-muted hover:text-text"
            }`}
          >
            E-maily ({emails.length})
          </button>
        )}
      </div>

      {/* Calls tab */}
      {tab === "calls" && (
        <div className="space-y-2">
          {calls.map((call) => (
            <div
              key={call.id}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <span
                  className={`text-[14px] font-medium ${GROUP_COLORS[call.outcome_group] ?? "text-text"}`}
                >
                  {call.outcome_name}
                </span>
                {call.operator_name && (
                  <span className="text-[13px] text-muted ml-1.5">
                    — {call.operator_name}
                  </span>
                )}
                {call.note && (
                  <p className="text-[13px] text-muted mt-0.5 truncate">
                    {call.note}
                  </p>
                )}
              </div>
              <span className="text-[12px] text-muted font-mono whitespace-nowrap shrink-0">
                {formatTime(call.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Emails tab */}
      {tab === "emails" && (
        <div className="space-y-2">
          {emails.map((em) => (
            <div
              key={em.id}
              className="flex items-start justify-between gap-3"
            >
              <div className="min-w-0">
                <span className="text-[14px] font-medium text-text">
                  {em.subject}
                </span>
                {em.sent_by && (
                  <span className="text-[13px] text-muted ml-1.5">
                    — {em.sent_by}
                  </span>
                )}
              </div>
              <span className="text-[12px] text-muted font-mono whitespace-nowrap shrink-0">
                {formatTime(em.sent_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
