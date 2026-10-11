"use client";

import { useState, useCallback } from "react";
import { completeOnboarding } from "@/app/actions/onboarding";

const STEPS = [
  {
    title: "Začni směnu",
    text: 'Ťukni na „Začít směnu". Počítá se ti čas a hovory. Na přestávku dej „Pauza".',
  },
  {
    title: "Volej odshora",
    text: 'Fronta „Volat teď" je seřazená za tebe. Vždy ber první lead, nic nevybírej.',
  },
  {
    title: "Přečti si háček",
    text: "Na kartě je jedna věc o webu firmy a první věta. Tou začni hovor.",
  },
  {
    title: "Zapiš výsledek",
    text: 'Po hovoru ťukni, jak skončil. CRM samo naplánuje, co dál. Pak „Uložit a další lead".',
  },
];

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleNext = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  }, [step]);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    try {
      await completeOnboarding();
      onComplete();
    } catch {
      // Silently fail — user can still use the app
      onComplete();
    }
  }, [onComplete]);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface border border-line rounded-xl shadow-lg max-w-md w-full mx-4 overflow-hidden">
        {/* Progress */}
        <div className="flex gap-1 p-4 pb-0">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-accent" : "bg-line"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
            Krok {step + 1} ze {STEPS.length}
          </span>
          <h2 className="text-lg font-semibold text-text mt-1 mb-3">
            {current.title}
          </h2>
          <p className="text-[15px] text-muted leading-relaxed">
            {current.text}
          </p>
        </div>

        {/* Actions */}
        <div className="p-4 pt-0 flex gap-3">
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              className="px-4 h-11 rounded-lg border border-line text-[14px] font-medium text-muted hover:text-text transition-colors min-h-[44px]"
            >
              Zpět
            </button>
          )}
          <button
            type="button"
            onClick={isLast ? handleFinish : handleNext}
            disabled={saving}
            className="flex-1 h-11 bg-accent text-white rounded-lg font-semibold text-[15px] hover:bg-accent/90 transition-colors disabled:opacity-50 min-h-[44px]"
          >
            {saving
              ? "Ukládám…"
              : isLast
                ? "Rozumím, začínám"
                : "Dál"}
          </button>
        </div>
      </div>
    </div>
  );
}
