"use client";

import { useState, useCallback } from "react";
import { getLeadCard, type LeadCardData } from "@/app/actions/leads";
import { QueueList } from "./queue-list";
import { ShiftBar } from "./shift-bar";
import { LeadCard } from "./lead-card";
import { OutcomePanel } from "./outcome-panel";
import { ObjectionChips } from "./objection-chips";
import { HelpSheet } from "./help-sheet";

type LostReason = { id: string; name: string };

export function CallingLayout({
  projectId,
  callerName,
  callsPerHour,
  lostReasons,
}: {
  projectId: string;
  callerName: string;
  callsPerHour: number;
  lostReasons: LostReason[];
}) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadCardData | null>(null);
  const [loadingLead, setLoadingLead] = useState(false);
  const [showOutcome, setShowOutcome] = useState(false);

  const loadLead = useCallback(async (leadId: string) => {
    setLoadingLead(true);
    try {
      const data = await getLeadCard(leadId);
      setLead(data);
      setShowOutcome(false);
    } catch {
      setLead(null);
    } finally {
      setLoadingLead(false);
    }
  }, []);

  const handleSelectLead = useCallback(
    (leadId: string) => {
      setSelectedLeadId(leadId);
      loadLead(leadId);
    },
    [loadLead]
  );

  const handleOutcomeSaved = useCallback(() => {
    setLead(null);
    setSelectedLeadId(null);
    setShowOutcome(false);
    // Reload queue
    const reload = (window as unknown as Record<string, unknown>).__reloadQueue;
    if (typeof reload === "function") (reload as () => void)();
  }, []);

  // Mobile back handler
  const handleBack = useCallback(() => {
    setLead(null);
    setSelectedLeadId(null);
    setShowOutcome(false);
  }, []);

  return (
    <div className="h-[calc(100vh-56px-78px)] lg:h-[calc(100vh-56px)]">
      {/* Desktop: 3 columns */}
      <div className="hidden xl:grid xl:grid-cols-[minmax(280px,360px)_1fr_minmax(300px,400px)] h-full max-w-[1600px] mx-auto">
        {/* Queue */}
        <aside className="border-r border-line overflow-y-auto">
          <ShiftBar projectId={projectId} callsPerHour={callsPerHour} />
          <QueueList
            projectId={projectId}
            selectedLeadId={selectedLeadId}
            onSelectLead={handleSelectLead}
          />
        </aside>

        {/* Lead card */}
        <main className="overflow-y-auto p-6">
          {loadingLead ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : lead ? (
            <div className="space-y-4 max-w-2xl">
              <LeadCard lead={lead} callerName={callerName} />
              <ObjectionChips
                company={lead.company_name}
                website={lead.website}
                findings={lead.findings}
                callerName={callerName}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted text-[15px]">
                Vyberte lead z fronty vlevo.
              </p>
            </div>
          )}
        </main>

        {/* Outcome panel */}
        <aside className="border-l border-line overflow-y-auto p-4">
          {lead ? (
            <div className="sticky top-0">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block mb-4">
                Výsledek hovoru
              </span>
              <OutcomePanel
                projectId={projectId}
                leadId={lead.id}
                leadEmail={lead.email}
                attemptCount={lead.attempt_count}
                maxAttempts={lead.max_attempts}
                lostReasons={lostReasons}
                onSaved={handleOutcomeSaved}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted text-[13px]">
                Vyberte lead pro zápis výsledku.
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* Tablet: 2 columns */}
      <div className="hidden md:grid md:grid-cols-[380px_1fr] xl:hidden h-full">
        <aside className="border-r border-line overflow-y-auto">
          <ShiftBar projectId={projectId} callsPerHour={callsPerHour} />
          <QueueList
            projectId={projectId}
            selectedLeadId={selectedLeadId}
            onSelectLead={handleSelectLead}
          />
        </aside>

        <main className="overflow-y-auto p-6">
          {loadingLead ? (
            <div className="flex justify-center py-12">
              <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : lead ? (
            <div className="space-y-6 max-w-2xl">
              <LeadCard lead={lead} callerName={callerName} />
              <div className="border-t border-line pt-6">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block mb-4">
                  Výsledek hovoru
                </span>
                <OutcomePanel
                  projectId={projectId}
                  leadId={lead.id}
                  leadEmail={lead.email}
                  attemptCount={lead.attempt_count}
                  maxAttempts={lead.max_attempts}
                  lostReasons={lostReasons}
                  onSaved={handleOutcomeSaved}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted text-[15px]">
                Vyberte lead z fronty vlevo.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* Mobile: stacked pages */}
      <div className="md:hidden h-full">
        {!lead ? (
          /* Queue page */
          <div className="h-full overflow-y-auto">
            <ShiftBar projectId={projectId} callsPerHour={callsPerHour} />
            <QueueList
              projectId={projectId}
              selectedLeadId={selectedLeadId}
              onSelectLead={handleSelectLead}
            />
          </div>
        ) : showOutcome ? (
          /* Outcome sheet */
          <div className="h-full overflow-y-auto">
            <div className="p-4">
              <button
                type="button"
                onClick={() => setShowOutcome(false)}
                className="flex items-center gap-1.5 text-[14px] text-accent font-medium mb-4 min-h-[44px]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M10 3L5 8l5 5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Zpět
              </button>
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block mb-4">
                Výsledek hovoru
              </span>
              <OutcomePanel
                projectId={projectId}
                leadId={lead.id}
                leadEmail={lead.email}
                attemptCount={lead.attempt_count}
                maxAttempts={lead.max_attempts}
                lostReasons={lostReasons}
                onSaved={handleOutcomeSaved}
              />
            </div>
          </div>
        ) : (
          /* Lead card page */
          <div className="h-full overflow-y-auto pb-24">
            <div className="p-4">
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1.5 text-[14px] text-accent font-medium mb-4 min-h-[44px]"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M10 3L5 8l5 5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Fronta
              </button>
              <LeadCard
                lead={lead}
                callerName={callerName}
                isMobile
                onOpenOutcome={() => setShowOutcome(true)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Help button — fixed bottom-right, above bottom-nav on mobile */}
      <div className="fixed bottom-20 lg:bottom-4 right-4 z-40">
        <HelpSheet />
      </div>

    </div>
  );
}
