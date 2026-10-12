"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { completeOnboarding } from "@/app/actions/onboarding";

type Step = {
  target: string; // data-onboarding value
  title: string;
  text: string;
  position: "top" | "bottom" | "left" | "right";
  fallbackText?: string; // shown if target element not found
};

const STEPS: Step[] = [
  {
    target: "shift-start",
    title: "Začni směnu",
    text: 'Ťukni sem pro začátek směny. Počítá se ti čas a hovory. Na přestávku dej „Pauza".',
    position: "bottom",
    fallbackText:
      'Nahoře najdeš tlačítko „Začít směnu". Ťukni na něj, aby se ti počítaly hovory a čas.',
  },
  {
    target: "queue-list",
    title: "Fronta leadů",
    text: "Tady jsou leady seřazené za tebe. Vždy ber prvního shora, nic nevybírej.",
    position: "right",
    fallbackText:
      "V levém panelu uvidíš frontu leadů. Jsou seřazené podle priority — vždy ber první.",
  },
  {
    target: "first-lead",
    title: "Otevři lead",
    text: "Ťukni na lead. Otevře se ti karta s informacemi o firmě a háčkem pro hovor.",
    position: "right",
    fallbackText:
      "Klikni na první lead v seznamu. Otevře se karta s detaily firmy.",
  },
  {
    target: "hook-section",
    title: "Přečti si háček",
    text: "Háček je tvá první věta v hovoru. Je připravený speciálně pro tuto firmu — použij ho.",
    position: "bottom",
    fallbackText:
      'Na kartě leadu najdeš sekci „Háček" — je to první věta, kterou začneš hovor.',
  },
  {
    target: "help-button",
    title: "Nápověda během hovoru",
    text: 'Klikni na „?" kdykoliv potřebuješ callscript nebo nápovědu. Najdeš tam postup krok za krokem.',
    position: "left",
    fallbackText:
      'Vpravo dole najdeš tlačítko „?" — otevře se ti callscript a nápověda.',
  },
  {
    target: "objections",
    title: "Námitky klienta",
    text: 'Klient má námitku? Ťukni na odpovídající chip a přečti odpověď. Po druhém jasném „ne" poděkuj a ukonči.',
    position: "bottom",
    fallbackText:
      "Pod kartou leadu najdeš nejčastější námitky. Ťukni na jednu a zobrazí se ti odpověď.",
  },
  {
    target: "outcome-panel",
    title: "Zapiš výsledek",
    text: "Po hovoru zvol, jak skončil. CRM samo naplánuje další krok — callback, e-mail nebo předání majiteli.",
    position: "left",
    fallbackText:
      "V pravém panelu najdeš tlačítka pro zápis výsledku hovoru. Zvol, jak hovor dopadl.",
  },
  {
    target: "save-button",
    title: "Uložit a další",
    text: 'Ťukni „Uložit a další lead". Hotovo! Fronta ti automaticky nabídne dalšího.',
    position: "top",
    fallbackText:
      'Na konci zápisu ťukni „Uložit a další lead" — CRM ti samo přiřadí dalšího.',
  },
];

function getTooltipStyle(
  rect: DOMRect,
  position: Step["position"]
): React.CSSProperties {
  const GAP = 12;
  const style: React.CSSProperties = { position: "fixed" };

  switch (position) {
    case "bottom":
      style.top = rect.bottom + GAP;
      style.left = rect.left + rect.width / 2;
      style.transform = "translateX(-50%)";
      break;
    case "top":
      style.bottom = window.innerHeight - rect.top + GAP;
      style.left = rect.left + rect.width / 2;
      style.transform = "translateX(-50%)";
      break;
    case "left":
      style.top = rect.top + rect.height / 2;
      style.right = window.innerWidth - rect.left + GAP;
      style.transform = "translateY(-50%)";
      break;
    case "right":
      style.top = rect.top + rect.height / 2;
      style.left = rect.right + GAP;
      style.transform = "translateY(-50%)";
      break;
  }

  return style;
}

function arrowClass(position: Step["position"]): string {
  // Arrow points TOWARD the target, opposite of tooltip position
  switch (position) {
    case "bottom":
      return "absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-surface";
    case "top":
      return "absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-surface";
    case "left":
      return "absolute top-1/2 -right-2 -translate-y-1/2 w-0 h-0 border-t-8 border-b-8 border-l-8 border-transparent border-l-surface";
    case "right":
      return "absolute top-1/2 -left-2 -translate-y-1/2 w-0 h-0 border-t-8 border-b-8 border-r-8 border-transparent border-r-surface";
  }
}

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Find and measure target element
  const measureTarget = useCallback(() => {
    const el = document.querySelector(
      `[data-onboarding="${current.target}"]`
    );
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      // Scroll into view if needed
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } else {
      setTargetRect(null);
    }
  }, [current.target]);

  useEffect(() => {
    // Delay measurement to let DOM settle
    const timer = setTimeout(measureTarget, 200);
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [measureTarget]);

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

  // Overlay with cutout for target element
  const overlayStyle: React.CSSProperties = targetRect
    ? {
        boxShadow: `0 0 0 9999px rgba(0,0,0,0.6)`,
        position: "fixed",
        top: targetRect.top - 6,
        left: targetRect.left - 6,
        width: targetRect.width + 12,
        height: targetRect.height + 12,
        borderRadius: 12,
        zIndex: 51,
        pointerEvents: "none",
      }
    : {};

  // Fallback mode: no target found, show centered modal
  const isFallback = !targetRect;

  return (
    <>
      {/* Full overlay background */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50"
        style={{ backgroundColor: isFallback ? "rgba(0,0,0,0.6)" : "transparent" }}
      />

      {/* Cutout highlight */}
      {!isFallback && <div style={overlayStyle} />}

      {/* Tooltip or centered card */}
      {isFallback ? (
        /* Fallback: centered modal like old wizard */
        <div className="fixed inset-0 z-[52] flex items-center justify-center">
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
              {current.fallbackText ?? current.text}
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
      ) : (
        /* Positioned tooltip near target */
        <div
          className="z-[52] max-w-sm w-full"
          style={getTooltipStyle(targetRect, current.position)}
        >
          <div className="relative bg-surface border border-accent/30 rounded-xl shadow-lg p-5">
            <div className={arrowClass(current.position)} />

            {/* Progress */}
            <div className="flex gap-1 mb-3">
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
            <h2 className="text-[16px] font-semibold text-text mt-1 mb-2">
              {current.title}
            </h2>
            <p className="text-[13px] text-muted leading-relaxed mb-4">
              {current.text}
            </p>

            <div className="flex items-center gap-2">
              {step > 0 && (
                <button
                  type="button"
                  onClick={() => setStep(step - 1)}
                  className="px-3 h-10 rounded-lg border border-line text-[13px] font-medium text-muted hover:text-text transition-colors min-h-[44px]"
                >
                  Zpět
                </button>
              )}
              <button
                type="button"
                onClick={isLast ? handleFinish : handleNext}
                disabled={saving}
                className="flex-1 h-10 bg-accent text-white rounded-lg font-semibold text-[14px] hover:bg-accent/90 transition-colors disabled:opacity-50 min-h-[44px]"
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
              className="mt-2 w-full text-center text-[12px] text-muted hover:text-text transition-colors min-h-[44px]"
            >
              Přeskočit průvodce
            </button>
          </div>
        </div>
      )}
    </>
  );
}
