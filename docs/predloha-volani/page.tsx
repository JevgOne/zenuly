"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, Phone, PhoneForwarded, Upload } from "lucide-react";
import { useAdminAuth } from "@/app/admin/_components/AdminAuthProvider";

/**
 * The call list and the script, for the people phoning companies with a weak
 * website.
 *
 * One company at a time: its number, what is wrong with its site, what to say,
 * and one button per way the call can end. Recording the outcome brings the
 * next company. Whoever runs the team also sees the import and what came of
 * the calls.
 */
type Outcome = "no_answer" | "callback" | "not_interested" | "wants_report" | "meeting" | "wrong_number" | "do_not_call";

interface Lead {
  id: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  area: string;
  address: string;
  reasons: string;
  outcome: Outcome | null;
  note: string;
  attempts: number;
  calledAt: number | null;
  calledBy: string;
  callbackAt: number | null;
  reportSentAt: number | null;
}

interface Script {
  goal: string;
  rules: string[];
  steps: { title: string; say: string; hint?: string }[];
  objections: { they: string; you: string }[];
}

interface Info {
  caller: string;
  canManage: boolean;
  outcomes: Record<Outcome, string>;
  stats: {
    total: number;
    waiting: number;
    callbacks: number;
    noAnswer: number;
    interested: number;
    closed: number;
    mineToday: number;
    today: { caller: string; calls: number; interested: number }[];
  };
  list?: Lead[];
}

type ListFilter = "interested" | "callbacks" | "called";

const card = "wbx-card p-[22px]";
const muted = { color: "var(--a-muted)" };
const field =
  "w-full rounded-lg border px-3 py-2 text-[15px] outline-none focus:border-[color:var(--a-brand)]";
const fieldStyle = { borderColor: "var(--a-border)", background: "var(--a-bg)", color: "var(--a-ink)" };
const when = (unix: number | null) =>
  unix ? new Date(unix * 1000).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
const site = (url: string) => url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
/** Tomorrow at nine, as the default for "call back later". */
const tomorrow = () => {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(9, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export default function CallsPage() {
  const { user } = useAdminAuth();
  const [info, setInfo] = useState<Info | null>(null);
  const [lead, setLead] = useState<Lead | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [empty, setEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [callbackAt, setCallbackAt] = useState(tomorrow());
  const [meetingAt, setMeetingAt] = useState(tomorrow());
  const [listFilter, setListFilter] = useState<ListFilter | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async (filter: ListFilter | null = null) => {
    const response = await fetch(`/api/admin/calls${filter ? `?list=${filter}` : ""}`, { cache: "no-store" });
    const data = await response.json();
    if (data.success) setInfo(data);
  }, []);

  useEffect(() => {
    if (user) load(listFilter);
  }, [user, load, listFilter]);

  const post = async (body: Record<string, unknown>) => {
    const response = await fetch("/api/admin/calls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.json();
  };

  const nextLead = async () => {
    setBusy(true);
    setMessage("");
    try {
      const data = await post({ action: "next" });
      setLead(data.lead ?? null);
      setScript(data.script ?? null);
      setEmpty(!data.lead);
      setNote("");
      setEmail(data.lead?.email ?? "");
      setConsent(false);
      setCallbackAt(tomorrow());
      setMeetingAt(tomorrow());
    } finally {
      setBusy(false);
    }
  };

  const finish = async (outcome: Outcome) => {
    if (!lead) return;
    if (outcome === "wants_report" && (!email.includes("@") || !consent)) {
      setMessage("Zadejte e-mail a potvrďte, že se zasláním souhlasili.");
      return;
    }
    if (outcome === "do_not_call" && !window.confirm("Opravdu označit jako „Nevolat“? Firmě už nikdo od nás nezavolá.")) return;
    setBusy(true);
    setMessage("");
    try {
      const data = await post({
        action: "outcome",
        id: lead.id,
        outcome,
        note,
        email: outcome === "wants_report" || outcome === "meeting" ? email : "",
        callbackAt:
          outcome === "callback" ? new Date(callbackAt).toISOString() : outcome === "meeting" ? new Date(meetingAt).toISOString() : undefined,
      });
      if (!data.success) {
        setMessage(data.error ?? "Uložení se nepovedlo.");
        return;
      }
      if (data.report === "sent") setMessage(`Rozbor odešel na ${email}.`);
      if (data.report === "failed") setMessage("Výsledek je uložen, ale rozbor se nepodařilo odeslat. Vedení o tom ví.");
      if (data.report === "no-website") setMessage("Firma nemá web, rozbor není z čeho udělat. Vedení připraví návrh.");
      await Promise.all([load(listFilter), nextLead()]);
    } finally {
      setBusy(false);
    }
  };

  const importCsv = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const data = await post({ action: "import", csv: await file.text() });
        window.alert(
          data.success
            ? `Přidáno k obvolání: ${data.imported}\nUž v seznamu: ${data.duplicates}\nBez telefonu: ${data.withoutPhone}`
            : `Import se nepovedl: ${data.error}`
        );
        await load(listFilter);
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  if (!user || !info) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin" style={muted} />
      </div>
    );
  }

  const s = info.stats;
  const tiles: [string, number][] = [
    ["K zavolání", s.waiting],
    ["Zavolat později", s.callbacks],
    ["Nezvedli", s.noAnswer],
    ["Zájem", s.interested],
    ["Moje hovory dnes", s.mineToday],
  ];
  const button = "rounded-lg border px-4 py-2.5 text-[14px] font-bold disabled:opacity-50";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {tiles.map(([label, value]) => (
          <div key={label} className="wbx-card px-5 py-4">
            <p className="text-[13px] font-medium" style={muted}>{label}</p>
            <p className="mt-1 text-[26px] font-extrabold" style={{ color: "var(--a-ink)" }}>{value}</p>
          </div>
        ))}
      </div>

      {message && (
        <p className="rounded-lg border px-4 py-3 text-[14px] font-medium" style={{ borderColor: "var(--a-brand)", color: "var(--a-ink)" }}>
          {message}
        </p>
      )}

      {!lead ? (
        <div className={`${card} text-center`}>
          <p className="text-[17px] font-bold" style={{ color: "var(--a-ink)" }}>
            {empty ? "Teď není komu volat." : `Dobrý den, ${info.caller.split(" ")[0]}.`}
          </p>
          <p className="mt-1 text-[14px]" style={muted}>
            {empty
              ? "Seznam je prázdný nebo všechny zbylé firmy čekají na pozdější zavolání."
              : "Systém vám dá jednu firmu, její číslo a skript. Po hovoru zapíšete výsledek a dostanete další."}
          </p>
          <button
            type="button"
            onClick={nextLead}
            disabled={busy}
            className="mt-5 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-[15px] font-bold text-white disabled:opacity-60"
            style={{ background: "var(--a-ink)" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneForwarded className="h-4 w-4" />}
            {empty ? "Zkusit znovu" : "Začít volat"}
          </button>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <div className="space-y-5">
            {/* Who to call */}
            <div className={card}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[22px] font-extrabold" style={{ color: "var(--a-ink)" }}>
                    {lead.company || site(lead.website) || "Firma bez názvu"}
                  </p>
                  <p className="mt-1 text-[14px]" style={muted}>
                    {[lead.address, lead.area].filter(Boolean).join(" · ") || "Adresa není v seznamu"}
                  </p>
                  {lead.website && (
                    <a
                      href={/^https?:/.test(lead.website) ? lead.website : `https://${lead.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-bold"
                      style={{ color: "var(--a-brand)" }}
                    >
                      {site(lead.website)} <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
                <a
                  href={`tel:${lead.phone.replace(/\s/g, "")}`}
                  className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[20px] font-extrabold text-white"
                  style={{ background: "var(--a-brand)" }}
                >
                  <Phone className="h-5 w-5" />
                  {lead.phone}
                </a>
              </div>

              {lead.reasons && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {lead.reasons.split("|").map((r) => (
                    <span key={r} className="rounded-full border px-3 py-1 text-[12px] font-bold" style={{ borderColor: "var(--a-border)", color: "var(--a-ink)" }}>
                      {r.trim()}
                    </span>
                  ))}
                </div>
              )}

              {lead.attempts > 0 && (
                <p className="mt-4 rounded-lg px-3 py-2 text-[13px]" style={{ background: "var(--a-bg)", color: "var(--a-ink)" }}>
                  Už {lead.attempts}× voláno{lead.calledBy ? ` (${lead.calledBy}, ${when(lead.calledAt)})` : ""}
                  {lead.note ? `: ${lead.note}` : "."}
                </p>
              )}
            </div>

            {/* What to say */}
            {script && (
              <div className={card}>
                <p className="text-[13px] font-bold uppercase tracking-wide" style={muted}>Skript hovoru</p>
                <p className="mt-2 rounded-lg px-3 py-2 text-[14px] font-bold" style={{ background: "var(--a-bg)", color: "var(--a-ink)" }}>
                  Cíl: {script.goal}
                </p>
                <ol className="mt-3 space-y-4">
                  {script.steps.map((step, i) => (
                    <li key={step.title} className="flex gap-3">
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                        style={{ background: "var(--a-brand)" }}
                      >
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-[12px] font-bold uppercase tracking-wide" style={muted}>{step.title}</p>
                        <p className="mt-0.5 text-[16px] font-medium leading-relaxed" style={{ color: "var(--a-ink)" }}>„{step.say}“</p>
                        {step.hint && <p className="mt-1 text-[13px]" style={muted}>{step.hint}</p>}
                      </div>
                    </li>
                  ))}
                </ol>

                <details open className="mt-5 rounded-lg border px-4 py-3" style={{ borderColor: "var(--a-border)" }}>
                  <summary className="cursor-pointer text-[14px] font-bold" style={{ color: "var(--a-ink)" }}>Co říct na námitky ({script.objections.length})</summary>
                  <dl className="mt-3 space-y-3">
                    {script.objections.map((o) => (
                      <div key={o.they}>
                        <dt className="text-[13px] font-bold" style={muted}>{o.they}</dt>
                        <dd className="text-[15px] font-medium" style={{ color: "var(--a-ink)" }}>„{o.you}“</dd>
                      </div>
                    ))}
                  </dl>
                </details>

                <details className="mt-3 rounded-lg border px-4 py-3" style={{ borderColor: "var(--a-border)" }}>
                  <summary className="cursor-pointer text-[14px] font-bold" style={{ color: "var(--a-ink)" }}>Pravidla volání</summary>
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px]" style={{ color: "var(--a-ink)" }}>
                    {script.rules.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                </details>
              </div>
            )}
          </div>

          {/* How it ended */}
          <div className={`${card} h-fit space-y-4 lg:sticky lg:top-4`}>
            <p className="text-[13px] font-bold uppercase tracking-wide" style={muted}>Výsledek hovoru</p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Poznámka: co řekli, s kým jste mluvili…"
              className={field}
              style={fieldStyle}
            />

            <div className="rounded-lg border-2 p-3" style={{ borderColor: "var(--a-brand)" }}>
              <p className="text-[13px] font-bold" style={{ color: "var(--a-ink)" }}>Domluvena konzultace s Jevgenijem</p>
              <input type="datetime-local" value={meetingAt} onChange={(e) => setMeetingAt(e.target.value)} className={`${field} mt-2`} style={fieldStyle} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail pro potvrzení (nepovinné)" className={`${field} mt-2`} style={fieldStyle} />
              <button type="button" onClick={() => finish("meeting")} disabled={busy} className={`${button} mt-3 w-full text-white`} style={{ background: "var(--a-brand)", borderColor: "var(--a-brand)" }}>
                Uložit konzultaci a pokračovat
              </button>
            </div>

            <div className="rounded-lg border p-3" style={{ borderColor: "var(--a-border)" }}>
              <p className="text-[13px] font-bold" style={{ color: "var(--a-ink)" }}>Konzultaci nechce, ale chce rozbor e-mailem</p>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jejich@email.cz" className={`${field} mt-2`} style={fieldStyle} />
              <label className="mt-2 flex items-start gap-2 text-[13px]" style={{ color: "var(--a-ink)" }}>
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
                Výslovně řekli, že jim rozbor můžu na tuhle adresu poslat.
              </label>
              <button type="button" onClick={() => finish("wants_report")} disabled={busy || !consent} className={`${button} mt-3 w-full`} style={{ borderColor: "var(--a-brand)", color: "var(--a-brand)" }}>
                Odeslat rozbor a pokračovat
              </button>
            </div>

            <div className="rounded-lg border p-3" style={{ borderColor: "var(--a-border)" }}>
              <p className="text-[13px] font-bold" style={{ color: "var(--a-ink)" }}>Zavolat později</p>
              <input type="datetime-local" value={callbackAt} onChange={(e) => setCallbackAt(e.target.value)} className={`${field} mt-2`} style={fieldStyle} />
              <button type="button" onClick={() => finish("callback")} disabled={busy} className={`${button} mt-2 w-full`} style={{ borderColor: "var(--a-border)", color: "var(--a-ink)" }}>
                Uložit a pokračovat
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["no_answer", "not_interested", "wrong_number", "do_not_call"] as Outcome[]).map((o) => (
                <button key={o} type="button" onClick={() => finish(o)} disabled={busy} className={button} style={{ borderColor: "var(--a-border)", color: o === "do_not_call" ? "#b91c1c" : "var(--a-ink)" }}>
                  {info.outcomes[o]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* For whoever runs the team */}
      {info.canManage && (
        <div className={card}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[17px] font-bold" style={{ color: "var(--a-ink)" }}>Přehled pro vedení</p>
              <p className="mt-1 text-[13px]" style={muted}>
                V seznamu {s.total} firem · uzavřeno bez zájmu {s.closed}
                {s.today.length > 0 && ` · dnes: ${s.today.map((t) => `${t.caller} ${t.calls} hovorů (${t.interested} se zájmem)`).join(", ")}`}
              </p>
            </div>
            <button type="button" onClick={importCsv} disabled={busy} className={`${button} inline-flex items-center gap-2`} style={{ borderColor: "var(--a-border)", color: "var(--a-ink)" }}>
              <Upload className="h-4 w-4" /> Nahrát firmy (CSV)
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["interested", "Se zájmem"],
                ["callbacks", "Zavolat později"],
                ["called", "Všechny odvolané"],
              ] as [ListFilter, string][]
            ).map(([key, label]) => (
              <button key={key} type="button" onClick={() => setListFilter(listFilter === key ? null : key)} className="wbx-filter" data-active={listFilter === key}>
                {label}
              </button>
            ))}
          </div>

          {listFilter && (
            <div className="mt-4 overflow-x-auto">
              {!info.list?.length ? (
                <p className="py-6 text-center text-sm font-medium" style={muted}>Zatím tu nic není.</p>
              ) : (
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="text-left" style={muted}>
                      <th className="p-2 font-bold">Firma</th>
                      <th className="p-2 font-bold">Telefon</th>
                      <th className="p-2 font-bold">Výsledek</th>
                      <th className="p-2 font-bold">Poznámka</th>
                      <th className="p-2 font-bold">Kdo a kdy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {info.list.map((l) => (
                      <tr key={l.id} className="border-t" style={{ borderColor: "var(--a-border-row)" }}>
                        <td className="p-2 font-bold" style={{ color: "var(--a-ink)" }}>
                          {l.company || site(l.website)}
                          {l.email && <span className="block text-[12px] font-medium" style={muted}>{l.email}</span>}
                        </td>
                        <td className="whitespace-nowrap p-2">
                          <a href={`tel:${l.phone.replace(/\s/g, "")}`} style={{ color: "var(--a-brand)" }}>{l.phone}</a>
                        </td>
                        <td className="whitespace-nowrap p-2">
                          {l.outcome ? info.outcomes[l.outcome] : ""}
                          {(l.outcome === "callback" || l.outcome === "meeting") && <span className="block text-[12px]" style={muted}>{when(l.callbackAt)}</span>}
                          {l.reportSentAt && <span className="block text-[12px]" style={muted}>rozbor odeslán</span>}
                        </td>
                        <td className="p-2" style={muted}>{l.note}</td>
                        <td className="whitespace-nowrap p-2" style={muted}>{l.calledBy}<span className="block text-[12px]">{when(l.calledAt)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
