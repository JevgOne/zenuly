"use client";

import { useState, useCallback } from "react";
import { completeOnboarding } from "@/app/actions/onboarding";

type Step = {
  title: string;
  text: string;
};

const STEPS: Step[] = [
  {
    title: "Začni směnu",
    text: 'Nahoře najdeš tlačítko „Začít směnu". Ťukni na něj, aby se ti počítaly hovory a čas. Na přestávku dej „Pauza".',
  },
  {
    title: "Fronta leadů",
    text: "V levém panelu uvidíš frontu leadů. Jsou seřazené podle priority — vždy ber prvního shora, nic nevybírej.",
  },
  {
    title: "Otevři lead",
    text: "Klikni na první lead v seznamu. Otevře se karta s detaily firmy a háčkem pro hovor.",
  },
  {
    title: "Přečti si háček",
    text: 'Na kartě leadu najdeš sekci „Háček" — je to první věta, kterou začneš hovor. Je připravená speciálně pro tuto firmu.',
  },
  {
    title: "Nápověda během hovoru",
    text: 'Vpravo dole najdeš tlačítko „?" — otevře se ti callscript a nápověda. Najdeš tam postup krok za krokem.',
  },
  {
    title: "Námitky klienta",
    text: 'Pod kartou leadu najdeš nejčastější námitky. Ťukni na jednu a zobrazí se ti odpověď. Po druhém jasném „ne" poděkuj a ukonči.',
  },
  {
    title: "Zapiš výsledek",
    text: "V pravém panelu najdeš tlačítka pro zápis výsledku hovoru. CRM samo naplánuje další krok — callback, e-mail nebo předání majiteli.",
  },
  {
    title: "Uložit a další",
    text: '„Uložit a další lead" — hotovo! Fronta ti automaticky nabídne dalšího. Takto pokračuješ celou směnu.',
  },
];

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleFinish = useCallback(async () => {
    setSaving(true);
    try {
      await completeOnboarding();
      onComplete();
    } catch {
      onComplete();
    }
  }, [onComplete]);

  const handleSkip = useCallback(async () => {
    setSaving(true);
    try {
      await completeOnboarding();
      onComplete();
    } catch {
      onComplete();
    }
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-surface border border-accent/30 rounded-xl shadow-lg max-w-sm w-full mx-4 p-6">
        {/* Progress */}
        <div className="flex gap-1 mb-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-accent" : "bg-line"
              }`}
            />
          ))}
        </div>

        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted">
          Krok {step + 1} z {STEPS.length}
        </span>
        <h2 className="text-lg font-semibold text-text mt-1 mb-3">
          {current.title}
        </h2>
        <p className="text-[14px] text-muted leading-relaxed mb-5">
          {current.text}
        </p>

        <div className="flex items-center gap-3">
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
            onClick={isLast ? handleFinish : () => setStep(step + 1)}
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

        <button
          type="button"
          onClick={handleSkip}
          disabled={saving}
          className="mt-3 w-full text-center text-[13px] text-muted hover:text-text transition-colors min-h-[44px]"
        >
          Přeskočit průvodce
        </button>
      </div>
    </div>
  );
}
