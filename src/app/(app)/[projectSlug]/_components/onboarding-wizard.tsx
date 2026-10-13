"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { completeOnboarding } from "@/app/actions/onboarding";

type OnboardingStep = {
  id: string;
  title: string;
  text: string;
  path: string | null; // null = no navigation (welcome/finish)
  icon: "welcome" | "dashboard" | "contacts" | "pipeline" | "queue" | "report" | "settings" | "shift" | "lead" | "result" | "help" | "tasks" | "performance" | "calendar" | "finish";
};

function getSteps(
  role: "admin" | "manager" | "operator",
  slug: string,
): OnboardingStep[] {
  if (role === "admin" || role === "manager") {
    return [
      {
        id: "welcome",
        title: "Vítejte v Zenuly CRM",
        text: "Provedeme vás celým systémem, abyste věděli kde co najdete. Zabere to jen chvilku.",
        path: null,
        icon: "welcome",
      },
      {
        id: "dashboard",
        title: "Dashboard",
        text: "Váš přehled v reálném čase. Vidíte aktivní operátory, počty hovorů, konverzní poměr a výkon týmu za dnešek. Vše se aktualizuje automaticky.",
        path: `/${slug}/dashboard`,
        icon: "dashboard",
      },
      {
        id: "contacts",
        title: "Kontakty",
        text: "Databáze všech leadů. Můžete vyhledávat podle firmy, telefonu nebo jména. Kliknutím na kartu otevřete detail s historií hovorů a poznámkami.",
        path: `/${slug}/kontakty`,
        icon: "contacts",
      },
      {
        id: "pipeline",
        title: "Pipeline",
        text: "Vizuální přehled kde se leady nacházejí v prodejním procesu. Každý sloupec je fáze — od prvního kontaktu po uzavření obchodu.",
        path: `/${slug}/pipeline`,
        icon: "pipeline",
      },
      {
        id: "queue",
        title: "Fronta",
        text: "Tady operátoři volají. Leady jsou seřazené podle priority — systém automaticky nabízí dalšího leada po dokončení hovoru.",
        path: `/${slug}/fronta`,
        icon: "queue",
      },
      {
        id: "report",
        title: "Report",
        text: "Statistiky a výkazy. Vidíte výkon jednotlivých operátorů, počty hovorů, úspěšnost a export dat pro reporting.",
        path: `/${slug}/report`,
        icon: "report",
      },
      {
        id: "settings",
        title: "Nastavení",
        text: "Správa účtu, propojení kalendáře a konfigurace systému. V administraci najdete správu uživatelů a projektů.",
        path: null,
        icon: "settings",
      },
      {
        id: "finish",
        title: "Jste připraveni!",
        text: "Znáte základy Zenuly CRM. Pokud budete potřebovat pomoct, podívejte se do nastavení nebo kontaktujte podporu. Můžete začít.",
        path: null,
        icon: "finish",
      },
    ];
  }

  // Operator steps
  return [
    {
      id: "welcome",
      title: "Vítejte v Zenuly CRM",
      text: "Provedeme vás celým systémem, abyste věděli co a jak se používá. Zabere to jen chvilku.",
      path: null,
      icon: "welcome",
    },
    {
      id: "shift",
      title: "Začněte směnu",
      text: 'Nahoře najdete tlačítko \u201eZačít směnu\u201c. Ťukněte na něj, aby se vám počítaly hovory a čas. Na přestávku dejte \u201ePauza\u201c.',
      path: `/${slug}/fronta`,
      icon: "shift",
    },
    {
      id: "queue",
      title: "Fronta leadů",
      text: "Tady se volá. Leady jsou seřazené podle priority — vždy berte prvního shora. Systém vám automaticky nabídne dalšího po dokončení hovoru.",
      path: `/${slug}/fronta`,
      icon: "queue",
    },
    {
      id: "lead",
      title: "Karta leadu",
      text: "Klikněte na lead a otevře se karta s detaily firmy, telefonem a háčkem pro hovor. Háček je první věta, kterou začnete hovor — je připravená speciálně pro tuto firmu.",
      path: `/${slug}/fronta`,
      icon: "lead",
    },
    {
      id: "result",
      title: "Výsledek hovoru",
      text: 'Po hovoru zapište výsledek tlačítky v pravém panelu. CRM samo naplánuje další krok \u2014 callback, e-mail nebo předání. Pak klikněte \u201eUložit a další lead\u201c.',
      path: `/${slug}/fronta`,
      icon: "result",
    },
    {
      id: "help",
      title: "Nápověda",
      text: 'Vpravo dole najdete tlačítko \u201e?\u201c \u2014 otevře se callscript a nápověda s postupem krok za krokem. Najdete tam i odpovědi na nejčastější námitky klientů.',
      path: `/${slug}/fronta`,
      icon: "help",
    },
    {
      id: "tasks",
      title: "Úkoly",
      text: "Přehled vašich úkolů — callbacky, follow-upy a další naplánované akce. Systém je vytváří automaticky podle výsledků hovorů.",
      path: `/${slug}/ukoly`,
      icon: "tasks",
    },
    {
      id: "performance",
      title: "Výkon",
      text: "Vaše osobní statistiky — počet hovorů, úspěšnost, průměrná délka a porovnání s cíli. Sledujte svůj pokrok během směny.",
      path: `/${slug}/vykon`,
      icon: "performance",
    },
    {
      id: "finish",
      title: "Jste připraveni!",
      text: "Znáte základy systému. Začněte směnu a systém vás povede. Hodně úspěchů!",
      path: null,
      icon: "finish",
    },
  ];
}

function StepIcon({ icon, className }: { icon: OnboardingStep["icon"]; className?: string }) {
  const cn = className ?? "w-10 h-10";
  switch (icon) {
    case "welcome":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" />
          <path d="M14 20l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "dashboard":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <rect x="6" y="6" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="22" y="6" width="12" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="22" y="16" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="6" y="22" width="12" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "contacts":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="15" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 32c0-5.523 4.477-10 10-10s10 4.477 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "pipeline":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <rect x="4" y="8" width="8" height="24" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="16" y="12" width="8" height="20" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="28" y="16" width="8" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "queue":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <rect x="8" y="8" width="24" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="8" y="17" width="24" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <rect x="8" y="26" width="24" height="6" rx="2" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "report":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <path d="M8 32V12l8 6 8-10 8 8v16H8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      );
    case "settings":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M20 6v4M20 30v4M6 20h4M30 20h4M10.3 10.3l2.8 2.8M26.9 26.9l2.8 2.8M10.3 29.7l2.8-2.8M26.9 13.1l2.8-2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "shift":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.5" />
          <path d="M20 12v8l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "lead":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <rect x="8" y="6" width="24" height="28" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M14 14h12M14 20h8M14 26h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "result":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <path d="M8 8h24v24H8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M14 20l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "help":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.5" />
          <path d="M16 16a4 4 0 014-4h0a4 4 0 014 4c0 2-2 3-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="20" cy="28" r="1" fill="currentColor" />
        </svg>
      );
    case "tasks":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <rect x="8" y="8" width="24" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M14 16l3 3 6-6M14 24l3 3 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "performance":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <path d="M8 32l8-12 6 6 10-16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="32" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <rect x="6" y="10" width="28" height="24" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <path d="M6 18h28M14 6v6M26 6v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "finish":
      return (
        <svg className={cn} viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.5" />
          <path d="M13 20l5 5 9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

export function OnboardingWizard({
  role,
  projectSlug,
  onComplete,
}: {
  role: "admin" | "manager" | "operator";
  projectSlug: string;
  onComplete: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const steps = getSteps(role, projectSlug);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  const current = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;
  const totalSteps = steps.length;

  // navigating = we requested a navigation and URL hasn't arrived yet
  const navigating = pendingPath !== null && pathname !== pendingPath;

  // Trigger navigation on step change
  useEffect(() => {
    if (current.path) {
      setPendingPath(current.path); // eslint-disable-line react-hooks/set-state-in-effect
      router.push(current.path);
    } else {
      setPendingPath(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Clear pendingPath once URL matches (navigation complete)
  useEffect(() => {
    if (pendingPath && pathname === pendingPath) {
      setPendingPath(null); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [pathname, pendingPath]);

  // Fallback: clear after 2s if pathname never matches
  useEffect(() => {
    if (!pendingPath) return;
    const t = setTimeout(() => setPendingPath(null), 2000);
    return () => clearTimeout(t);
  }, [pendingPath]);

  const handleNext = useCallback(() => {
    if (step < totalSteps - 1) {
      setStep(step + 1);
    }
  }, [step, totalSteps]);

  const handlePrev = useCallback(() => {
    if (step > 0) {
      setStep(step - 1);
    }
  }, [step]);

  const handleFinish = useCallback(async () => {
    setSaving(true);
    try {
      await completeOnboarding();
    } catch {
      // continue anyway
    }
    onComplete();
  }, [onComplete]);

  const handleSkip = useCallback(async () => {
    setSaving(true);
    try {
      await completeOnboarding();
    } catch {
      // continue anyway
    }
    onComplete();
  }, [onComplete]);

  // Position: welcome/finish = centered, page steps = bottom overlay
  const isOverlay = current.path !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center pointer-events-none">
      {/* Backdrop - subtle for page steps, full for welcome/finish */}
      <div
        className={`absolute inset-0 pointer-events-auto transition-colors duration-300 ${
          isOverlay ? "bg-black/30" : "bg-black/60"
        }`}
      />

      {/* Card */}
      <div
        className={`relative pointer-events-auto w-full transition-all duration-300 ${
          isOverlay
            ? "max-w-lg mx-4 mb-6 lg:mb-10"
            : "max-w-md mx-4 mb-auto mt-auto"
        }`}
      >
        <div className="bg-surface border border-line rounded-xl shadow-2xl overflow-hidden">
          {/* Progress bar */}
          <div className="flex gap-0.5 px-4 pt-4">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                  i < step
                    ? "bg-accent"
                    : i === step
                      ? "bg-accent"
                      : "bg-line"
                }`}
              />
            ))}
          </div>

          <div className="p-5">
            {/* Step counter */}
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted">
              {step + 1} / {totalSteps}
            </span>

            {/* Icon + Title */}
            <div className="flex items-start gap-3 mt-2 mb-3">
              <div className="text-accent shrink-0 mt-0.5">
                <StepIcon icon={current.icon} className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text leading-tight">
                  {current.title}
                </h2>
                {isOverlay && !navigating && (
                  <span className="text-[11px] text-accent/70 font-medium">
                    Právě se díváte na tuto stránku
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            <p className="text-[14px] text-muted leading-relaxed mb-5">
              {current.text}
            </p>

            {/* Actions */}
            <div className="flex items-center gap-3">
              {!isFirst && (
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={saving}
                  className="px-4 h-11 rounded-lg border border-line text-[14px] font-medium text-muted hover:text-text hover:border-text/20 transition-colors min-h-[44px]"
                >
                  Zpět
                </button>
              )}
              <button
                type="button"
                onClick={isLast ? handleFinish : handleNext}
                disabled={saving || navigating}
                className="flex-1 h-11 bg-accent text-white rounded-lg font-semibold text-[15px] hover:bg-accent/90 transition-colors disabled:opacity-50 min-h-[44px]"
              >
                {saving
                  ? "Ukládám..."
                  : isLast
                    ? "Začít pracovat"
                    : isFirst
                      ? "Pojďme na to"
                      : "Další"}
              </button>
            </div>

            {/* Skip link */}
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
      </div>
    </div>
  );
}
