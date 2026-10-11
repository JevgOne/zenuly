"use client";

import { useState, useCallback, useEffect } from "react";
import { recordOutcome } from "@/app/actions/calls";
import { SlotPicker } from "./slot-picker";

type OutcomeDef = {
  key: string;
  name: string;
  group: string;
  shortcut: number;
};

const OUTCOMES: OutcomeDef[] = [
  { key: "meeting", name: "Konzultace", group: "interest", shortcut: 1 },
  { key: "offer", name: "Nabídka", group: "interest", shortcut: 2 },
  { key: "deck", name: "Prezentace", group: "interest", shortcut: 3 },
  { key: "report", name: "Rozbor", group: "interest", shortcut: 4 },
  { key: "later", name: "Jindy", group: "retry", shortcut: 5 },
  { key: "no_answer", name: "Nevzal to", group: "retry", shortcut: 6 },
  { key: "busy", name: "Obsazeno", group: "retry", shortcut: 7 },
  { key: "not_interested", name: "Nemá zájem", group: "end", shortcut: 8 },
  { key: "wrong_number", name: "Špatné číslo", group: "end", shortcut: 9 },
  { key: "defunct", name: "Firma nefunguje", group: "end", shortcut: 0 },
];

const GROUP_LABELS: Record<string, string> = {
  interest: "Zájem",
  retry: "Zkusit znovu",
  end: "Konec",
};

const EFFECT_TEXTS: Record<string, string> = {
  meeting:
    "Lead přejde na majitele, schůzka se zapíše do jeho kalendáře a operátor ho už nevolá.",
  offer: "Nabídka odejde e-mailem a za 3 dny přijde callback.",
  deck: "Prezentace odejde e-mailem a za 2 dny přijde callback.",
  report: "Rozbor webu odejde e-mailem a za 2 dny přijde callback.",
  later:
    "Lead zmizí z fronty a vrátí se přesně v čas, který klient řekl – i za měsíc.",
  no_answer: "Další pokus zítra v jinou denní dobu.",
  busy: "Lead se vrátí do fronty za 30 minut.",
  not_interested:
    "Fáze Ztraceno. Znovu oslovit za 6 měsíců, pokud nechce na seznam Nevolat.",
  wrong_number: "Fáze Ztraceno, lead jde ke kontrole majiteli.",
  defunct: "Lead se vyřadí. Firma je označena jako nefungující.",
};

const QUICK_OPTIONS = [
  { label: "za 2 h", value: "2h" },
  { label: "zítra 9:00", value: "tomorrow_9" },
  { label: "za týden", value: "1w" },
  { label: "za měsíc", value: "1m" },
  { label: "za 3 měsíce", value: "3m" },
  { label: "vlastní…", value: "custom" },
];

function quickOptionToDate(value: string): string {
  const now = new Date();
  switch (value) {
    case "2h":
      return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    case "tomorrow_9": {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d.toISOString();
    }
    case "1w":
      return new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000
      ).toISOString();
    case "1m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() + 1);
      return d.toISOString();
    }
    case "3m": {
      const d = new Date(now);
      d.setMonth(d.getMonth() + 3);
      return d.toISOString();
    }
    default:
      return "";
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(
    Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function OutcomePanel({
  projectId,
  leadId,
  leadEmail,
  attemptCount,
  maxAttempts,
  lostReasons,
  onSaved,
}: {
  projectId: string;
  leadId: string;
  leadEmail: string | null;
  attemptCount: number;
  maxAttempts: number;
  lostReasons: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState(leadEmail ?? "");
  const [timeSlot, setTimeSlot] = useState("");
  const [callbackAt, setCallbackAt] = useState("");
  const [quickOption, setQuickOption] = useState<string | null>(null);
  const [showCustomDate, setShowCustomDate] = useState(false);
  const [postponeReason, setPostponeReason] = useState("");
  const [lostReasonId, setLostReasonId] = useState("");
  const [addToDnc, setAddToDnc] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Dynamic effect text for no_answer
  const effectText = selected
    ? selected === "no_answer"
      ? (() => {
          const remaining = Math.max(0, maxAttempts - attemptCount - 1);
          if (remaining === 0) return "Poslední pokus. Příště se lead uzavře.";
          const word =
            remaining === 1 ? "pokus" : remaining <= 4 ? "pokusy" : "pokusů";
          return `Další pokus zítra v jinou denní dobu. Zbývá ${remaining} ${word}.`;
        })()
      : EFFECT_TEXTS[selected] ?? ""
    : "";

  // Whether reason field is required for "later" (>= 7 days)
  const needsPostponeReason =
    selected === "later" &&
    callbackAt &&
    daysBetween(new Date(), new Date(callbackAt)) >= 7;

  // Can submit?
  const canSubmit = (() => {
    if (!selected || saving) return false;
    if (selected === "meeting" && !timeSlot) return false;
    if ((selected === "offer" || selected === "deck") && !email.includes("@"))
      return false;
    if (selected === "report" && (!email.includes("@") || !consent))
      return false;
    if (selected === "later" && !callbackAt) return false;
    if (selected === "not_interested" && !lostReasonId) return false;
    if (needsPostponeReason && !postponeReason.trim()) return false;
    return true;
  })();

  const handleSelect = useCallback(
    (key: string) => {
      setSelected(key === selected ? null : key);
      setError("");
    },
    [selected]
  );

  const handleQuickOption = useCallback((value: string) => {
    if (value === "custom") {
      setShowCustomDate(true);
      setQuickOption("custom");
      return;
    }
    setQuickOption(value);
    setShowCustomDate(false);
    setCallbackAt(quickOptionToDate(value));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selected || !canSubmit) return;
    setSaving(true);
    setError("");
    try {
      await recordOutcome({
        leadId,
        outcomeKey: selected,
        note: note || undefined,
        callbackAt: callbackAt || undefined,
        email: email || undefined,
        timeSlot: timeSlot || undefined,
        lostReasonId: lostReasonId || undefined,
        addToDnc,
        postponeReason: postponeReason || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Uložení se nepovedlo.");
    } finally {
      setSaving(false);
    }
  }, [
    selected,
    canSubmit,
    leadId,
    note,
    callbackAt,
    email,
    timeSlot,
    lostReasonId,
    addToDnc,
    postponeReason,
    onSaved,
  ]);

  // Keyboard shortcuts (desktop)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT"
      )
        return;

      const num = parseInt(e.key);
      if (num >= 0 && num <= 9) {
        e.preventDefault();
        const outcome = OUTCOMES.find((o) => o.shortcut === num);
        if (outcome) handleSelect(outcome.key);
      }
      if (e.key === "Enter" && canSubmit) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSelected(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSelect, handleSubmit, canSubmit]);

  const groups = ["interest", "retry", "end"] as const;

  return (
    <div className="space-y-4">
      {/* Note textarea */}
      <div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="Poznámka: co řekli, s kým jste mluvili…"
          className="w-full border border-input-border rounded-lg px-3 py-2.5 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors resize-none"
        />
      </div>

      {/* Outcome buttons by group */}
      {groups.map((group) => (
        <div key={group}>
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block mb-2">
            {GROUP_LABELS[group]}
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3 gap-2">
            {OUTCOMES.filter((o) => o.group === group).map((outcome) => {
              const isSelected = selected === outcome.key;
              let btnClass =
                "relative flex items-center justify-center gap-2 rounded-lg px-4 h-11 text-[14px] font-medium transition-all min-h-[44px]";

              if (isSelected) {
                if (group === "interest")
                  btnClass +=
                    " border-[1.5px] border-accent bg-accent-soft text-accent font-semibold";
                else if (group === "end")
                  btnClass +=
                    " border-[1.5px] border-urgent bg-urgent-soft text-urgent font-semibold";
                else
                  btnClass +=
                    " border-[1.5px] border-accent bg-accent-soft text-accent font-semibold";
              } else {
                btnClass += " border border-line bg-surface text-text";
              }

              return (
                <button
                  key={outcome.key}
                  type="button"
                  onClick={() => handleSelect(outcome.key)}
                  className={btnClass}
                >
                  {outcome.name}
                  <span className="hidden xl:inline-flex absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 items-center justify-center rounded bg-bg text-[12px] font-mono text-muted">
                    {outcome.shortcut}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Effect text */}
      {effectText && (
        <p className="text-[13px] text-muted bg-bg rounded-lg px-3 py-2.5">
          {effectText}
        </p>
      )}

      {/* Conditional forms */}
      {selected === "meeting" && (
        <div className="space-y-3 border border-line rounded-lg p-4">
          <label className="text-[13px] font-medium text-muted block">
            Termín konzultace
          </label>
          <SlotPicker
            projectId={projectId}
            onSelect={(isoTime) => setTimeSlot(isoTime)}
            selected={timeSlot}
          />
        </div>
      )}

      {(selected === "offer" || selected === "deck") && (
        <div className="space-y-3 border border-line rounded-lg p-4">
          <label className="text-[13px] font-medium text-muted block">
            E-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="firma@email.cz"
            className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
          />
        </div>
      )}

      {selected === "report" && (
        <div className="space-y-3 border border-line rounded-lg p-4">
          <label className="text-[13px] font-medium text-muted block">
            E-mail
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="firma@email.cz"
            className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
          />
          <label className="flex items-center gap-2 text-[13px] text-text cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="w-4 h-4 rounded border-input-border text-accent"
            />
            Klient výslovně souhlasil s odesláním rozboru
          </label>
        </div>
      )}

      {selected === "later" && (
        <div className="space-y-3 border border-line rounded-lg p-4">
          <label className="text-[13px] font-medium text-muted block">
            Zavolat znovu
          </label>
          <div className="flex flex-wrap gap-2">
            {QUICK_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleQuickOption(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                  quickOption === opt.value
                    ? "bg-accent text-white"
                    : "bg-bg text-text hover:bg-line"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {showCustomDate && (
            <input
              type="datetime-local"
              value={callbackAt.slice(0, 16)}
              onChange={(e) => setCallbackAt(new Date(e.target.value).toISOString())}
              className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
            />
          )}
          {needsPostponeReason && (
            <div>
              <label className="text-[13px] font-medium text-muted block mb-1">
                Důvod odložení
              </label>
              <input
                type="text"
                value={postponeReason}
                onChange={(e) => setPostponeReason(e.target.value)}
                placeholder="Proč voláte za tak dlouho?"
                className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
              />
            </div>
          )}
        </div>
      )}

      {selected === "not_interested" && (
        <div className="space-y-3 border border-line rounded-lg p-4">
          <label className="text-[13px] font-medium text-muted block">
            Důvod ztráty
          </label>
          <select
            value={lostReasonId}
            onChange={(e) => setLostReasonId(e.target.value)}
            className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
          >
            <option value="">Vyberte důvod…</option>
            {lostReasons.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[13px] text-text cursor-pointer">
            <input
              type="checkbox"
              checked={addToDnc}
              onChange={(e) => setAddToDnc(e.target.checked)}
              className="w-4 h-4 rounded border-input-border text-accent"
            />
            Nevolat – přidat na seznam
          </label>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-urgent text-[13px] font-medium">{error}</p>
      )}

      {/* Submit */}
      <div className="flex gap-3 items-center">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex-1 h-[52px] bg-accent text-white rounded-lg font-semibold text-[15px] hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? "Ukládám…" : "Uložit a další lead"}
          <span className="hidden xl:inline-flex px-1.5 py-0.5 rounded bg-white/20 text-[12px] font-mono">
            Enter
          </span>
        </button>
        {/* Voice note placeholder */}
        <button
          type="button"
          disabled
          title="Připravujeme"
          className="w-[52px] h-[52px] rounded-lg border border-line bg-bg flex items-center justify-center text-muted opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path
              d="M10 2.5v10M6.5 7.5v5a3.5 3.5 0 007 0v-5M10 15v2.5M7.5 17.5h5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
