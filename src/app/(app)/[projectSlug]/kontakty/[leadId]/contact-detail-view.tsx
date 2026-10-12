"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ContactDetail,
  assignLeadOwner,
  changeLeadStage,
} from "@/app/actions/contacts";
import { reasonsFor } from "@/lib/callscript";

type Operator = { id: string; name: string };
type Stage = { id: string; name: string; key: string; type: string };

function trustColor(score: number): string {
  if (score >= 60) return "text-green-600";
  if (score >= 30) return "text-amber-500";
  return "text-urgent";
}

function trustBg(score: number): string {
  if (score >= 60) return "bg-green-500";
  if (score >= 30) return "bg-amber-400";
  return "bg-urgent";
}

function trustLabel(score: number): string {
  if (score >= 70) return "Vysoká";
  if (score >= 50) return "Dobrá";
  if (score >= 30) return "Střední";
  return "Nízká";
}

function stageColor(type: string): string {
  if (type === "won") return "bg-green-100 text-green-700 border-green-200";
  if (type === "lost") return "bg-urgent-soft text-urgent border-urgent/20";
  return "bg-accent-soft text-accent border-accent/20";
}

function priorityBadge(p: number): { label: string; cls: string } {
  if (p === 3) return { label: "Vysoká", cls: "bg-urgent-soft text-urgent" };
  if (p === 1) return { label: "Nízká", cls: "bg-bg text-muted" };
  return { label: "Střední", cls: "bg-amber-50 text-amber-600" };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Prague",
  });
}

function formatPhone(phone: string): string {
  const clean = phone.replace(/\s/g, "");
  if (clean.length === 13 && clean.startsWith("+420")) {
    const num = clean.slice(4);
    return `+420 ${num.slice(0, 3)} ${num.slice(3, 6)} ${num.slice(6)}`;
  }
  return phone;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `před ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `před ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `před ${days} d`;
  const months = Math.floor(days / 30);
  return `před ${months} měs`;
}

function TrustScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const r = 15.5;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className="text-line"
        />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={`${circumference}`}
          strokeDashoffset={`${offset}`}
          strokeLinecap="round"
          className={trustColor(score)}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center text-[12px] font-bold ${trustColor(score)}`}
      >
        {score}
      </span>
    </div>
  );
}

function outcomeColor(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("konzultace") || lower.includes("domluveno")) return "bg-green-500";
  if (lower.includes("callback") || lower.includes("zavolat")) return "bg-amber-400";
  if (lower.includes("email") || lower.includes("report")) return "bg-blue-400";
  if (lower.includes("nezájem") || lower.includes("nepovedlo")) return "bg-urgent";
  return "bg-muted/40";
}

export function ContactDetailView({
  contact,
  projectSlug,
  operators,
  stages,
}: {
  contact: ContactDetail;
  projectSlug: string;
  operators: Operator[];
  stages: Stage[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showAssign, setShowAssign] = useState(false);
  const [showStage, setShowStage] = useState(false);

  const priority = priorityBadge(contact.priority);

  // Build hook sentence from findings
  const hookSentence = (() => {
    const source = contact.findings ?? contact.hook_text;
    if (!source) return null;
    const reasons = reasonsFor(source);
    if (reasons.length === 0) return contact.hook_text;
    const domain = contact.website
      ? contact.website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "")
      : null;
    const noSite = !domain || /nemá web|jen profil na sociální síti/.test(source);
    const found = reasons.map((r) => r.say).join(" a ");
    return {
      text: noSite
        ? `Hledal jsem vaši firmu na internetu a všiml jsem si, že ${found}.`
        : `Díval jsem se na váš web ${domain} a všiml jsem si, že ${found}.`,
      impact: reasons[0]?.impact ?? null,
    };
  })();

  function handleAssign(operatorId: string | null) {
    startTransition(async () => {
      await assignLeadOwner(contact.id, operatorId);
      setShowAssign(false);
      router.refresh();
    });
  }

  function handleStageChange(stageId: string) {
    startTransition(async () => {
      await changeLeadStage(contact.id, stageId);
      setShowStage(false);
      router.refresh();
    });
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Back link */}
      <Link
        href={`/${projectSlug}/kontakty`}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-text transition-colors mb-5"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Kontakty
      </Link>

      {/* ===== HEADER ===== */}
      <div className="bg-surface border border-line rounded-xl p-5 mb-4">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          {/* Left: Company info */}
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-xl sm:text-2xl font-semibold text-text leading-tight">
                {contact.company}
              </h1>
              <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide border ${stageColor(contact.stage_type)}`}>
                {contact.stage_name}
              </span>
              <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${priority.cls}`}>
                {priority.label}
              </span>
            </div>
            {contact.contact_person && (
              <p className="text-[14px] text-muted">{contact.contact_person}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[13px] text-muted">
              {contact.city && (
                <span className="flex items-center gap-1">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5a3.25 3.25 0 013.25 3.25c0 2.437-3.25 6.75-3.25 6.75S3.25 7.187 3.25 4.75A3.25 3.25 0 016.5 1.5z" stroke="currentColor" strokeWidth="1.1"/><circle cx="6.5" cy="4.75" r="1.25" stroke="currentColor" strokeWidth="1.1"/></svg>
                  {contact.city}
                </span>
              )}
              {contact.ico && (
                <span className="font-mono">IČO {contact.ico}</span>
              )}
              {contact.lead_source && (
                <span>Zdroj: {contact.lead_source}</span>
              )}
            </div>
          </div>

          {/* Right: Trust score */}
          <div className="flex items-center gap-3 shrink-0">
            <TrustScoreRing score={contact.trust_score} size={52} />
            <div>
              <p className={`text-[13px] font-semibold ${trustColor(contact.trust_score)}`}>
                {trustLabel(contact.trust_score)}
              </p>
              <p className="text-[11px] text-muted">Trust score</p>
            </div>
          </div>
        </div>

        {/* Completeness bar */}
        <div className="mt-4">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[11px] font-medium text-muted">Vyplněnost profilu</span>
            <span className="text-[11px] font-mono text-text">{contact.completeness_pct} %</span>
          </div>
          <div className="h-1.5 bg-bg rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${trustBg(contact.completeness_pct)}`}
              style={{ width: `${contact.completeness_pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* ===== ACTION BAR ===== */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Call button */}
        <a
          href={`tel:${contact.phone.replace(/\s/g, "")}`}
          className="inline-flex items-center gap-2 h-10 px-4 bg-accent text-white rounded-lg text-[13px] font-semibold hover:bg-accent/90 transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M6 2.8H4a1.2 1.2 0 00-1.2 1.2v.8a8.8 8.8 0 008.8 8.8h.8A1.2 1.2 0 0013.6 12.4v-1.9a.8.8 0 00-.54-.76l-2.24-.75a.8.8 0 00-.86.28l-.67.84a7.2 7.2 0 01-3.4-3.4l.84-.67a.8.8 0 00.28-.86L6.24 3.34A.8.8 0 005.48 2.8H6z" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          {formatPhone(contact.phone)}
        </a>

        {/* Assign operator */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowAssign(!showAssign); setShowStage(false); }}
            disabled={isPending}
            className="inline-flex items-center gap-2 h-10 px-4 border border-line rounded-lg text-[13px] font-medium text-text hover:border-accent/40 transition-colors bg-surface"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="3" stroke="currentColor" strokeWidth="1.2"/><path d="M2 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            {contact.owner_name ?? "Nepřiřazeno"}
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {showAssign && (
            <div className="absolute top-full left-0 mt-1 bg-surface border border-line rounded-lg shadow-lg z-20 min-w-[200px] py-1">
              <button
                type="button"
                onClick={() => handleAssign(null)}
                className="w-full text-left px-3 py-2 text-[13px] text-muted hover:bg-bg transition-colors"
              >
                Odebrat operátora
              </button>
              {operators.map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => handleAssign(op.id)}
                  className={`w-full text-left px-3 py-2 text-[13px] hover:bg-bg transition-colors ${
                    contact.owner_id === op.id ? "text-accent font-medium" : "text-text"
                  }`}
                >
                  {op.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Change stage */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setShowStage(!showStage); setShowAssign(false); }}
            disabled={isPending}
            className="inline-flex items-center gap-2 h-10 px-4 border border-line rounded-lg text-[13px] font-medium text-text hover:border-accent/40 transition-colors bg-surface"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 5h10M2 9h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            Změnit fázi
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 4l2 2 2-2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          {showStage && (
            <div className="absolute top-full left-0 mt-1 bg-surface border border-line rounded-lg shadow-lg z-20 min-w-[200px] py-1">
              {stages.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleStageChange(s.id)}
                  className={`w-full text-left px-3 py-2 text-[13px] hover:bg-bg transition-colors ${
                    contact.stage_id === s.id ? "text-accent font-medium" : "text-text"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Email link */}
        {contact.email && (
          <a
            href={`mailto:${contact.email}`}
            className="inline-flex items-center gap-2 h-10 px-4 border border-line rounded-lg text-[13px] font-medium text-text hover:border-accent/40 transition-colors bg-surface"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.75" y="3.5" width="10.5" height="7" rx="1" stroke="currentColor" strokeWidth="1.1"/><path d="M2 4l5 3.5L12 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
            E-mail
          </a>
        )}

        {/* Website link */}
        {contact.website && (
          <a
            href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-10 px-4 border border-line rounded-lg text-[13px] font-medium text-text hover:border-accent/40 transition-colors bg-surface"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.1"/><path d="M2 7h10M7 2c1.5 1.5 2 3 2 5s-.5 3.5-2 5M7 2c-1.5 1.5-2 3-2 5s.5 3.5 2 5" stroke="currentColor" strokeWidth="1.1"/></svg>
            Web
          </a>
        )}
      </div>

      {/* ===== MAIN CONTENT GRID ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Hook / Callscript */}
          {hookSentence && (
            <div className="bg-accent-soft border border-accent/20 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-accent">
                  <path d="M8 1.5l1.76 3.57 3.94.57-2.85 2.78.67 3.93L8 10.5l-3.52 1.85.67-3.93L2.3 5.64l3.94-.57L8 1.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                </svg>
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-accent">
                  Háček pro otevření
                </span>
              </div>
              <p className="text-[15px] leading-relaxed text-accent font-medium">
                {typeof hookSentence === "string" ? hookSentence : hookSentence.text}
              </p>
              {typeof hookSentence !== "string" && hookSentence.impact && (
                <p className="text-[13px] text-accent/70 mt-2 leading-relaxed">
                  {hookSentence.impact}
                </p>
              )}
            </div>
          )}

          {/* Call history timeline */}
          <div className="bg-surface border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[14px] font-semibold text-text">
                Historie hovorů
              </h2>
              <span className="text-[12px] font-mono text-muted bg-bg px-2 py-0.5 rounded">
                {contact.total_calls}
              </span>
            </div>
            {contact.calls.length === 0 ? (
              <p className="text-[13px] text-muted py-4 text-center">
                Zatím žádné hovory.
              </p>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-line" />
                <div className="space-y-0">
                  {contact.calls.map((call, i) => (
                    <div key={call.id} className="relative flex gap-3 pb-4 last:pb-0">
                      {/* Dot */}
                      <div className={`relative z-10 mt-1.5 w-[15px] h-[15px] rounded-full border-2 border-surface ${outcomeColor(call.outcome_name)} shrink-0`} />
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                          <span className="text-[14px] font-medium text-text">
                            {call.outcome_name}
                          </span>
                          <span className="text-[12px] text-muted">
                            {call.operator_name}
                          </span>
                          <span className="text-[11px] text-muted ml-auto font-mono">
                            {formatDate(call.created_at)}
                          </span>
                        </div>
                        {call.note && (
                          <p className="text-[13px] text-muted mt-1 leading-relaxed">
                            {call.note}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right column (1/3) — sidebar */}
        <div className="space-y-4">
          {/* Contact info card */}
          <div className="bg-surface border border-line rounded-xl p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-3">
              Kontaktní údaje
            </h2>
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-muted mt-0.5 shrink-0"><path d="M5.625 2.813h-1.5a1.125 1.125 0 00-1.125 1.124v.75a8.25 8.25 0 008.25 8.25h.75a1.125 1.125 0 001.125-1.124v-1.788a.75.75 0 00-.51-.712l-2.1-.7a.75.75 0 00-.81.264l-.63.787a6.75 6.75 0 01-3.18-3.18l.787-.63a.75.75 0 00.264-.81l-.7-2.1a.75.75 0 00-.712-.51h.091z" stroke="currentColor" strokeWidth="1.1"/></svg>
                <div className="min-w-0">
                  <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="text-[14px] text-accent font-medium hover:underline">
                    {formatPhone(contact.phone)}
                  </a>
                  <p className="text-[11px] text-muted">{contact.phone_source}</p>
                </div>
              </div>

              {contact.email && (
                <div className="flex items-start gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-muted mt-0.5 shrink-0"><rect x="1.875" y="3.75" width="11.25" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.1"/><path d="M2.143 4.286l5.357 3.75 5.357-3.75" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  <a href={`mailto:${contact.email}`} className="text-[14px] text-accent hover:underline truncate">
                    {contact.email}
                  </a>
                </div>
              )}

              {contact.website && (
                <div className="flex items-start gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-muted mt-0.5 shrink-0"><circle cx="7.5" cy="7.5" r="5.25" stroke="currentColor" strokeWidth="1.1"/><path d="M2.25 7.5h10.5M7.5 2.25c1.5 1.5 2.25 3.25 2.25 5.25s-.75 3.75-2.25 5.25M7.5 2.25C6 3.75 5.25 5.5 5.25 7.5S6 11.25 7.5 12.75" stroke="currentColor" strokeWidth="1.1"/></svg>
                  <a
                    href={contact.website.startsWith("http") ? contact.website : `https://${contact.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[14px] text-accent hover:underline truncate"
                  >
                    {contact.website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "")}
                  </a>
                </div>
              )}

              {contact.city && (
                <div className="flex items-start gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-muted mt-0.5 shrink-0"><path d="M7.5 1.875a3.75 3.75 0 013.75 3.75c0 2.813-3.75 7.5-3.75 7.5s-3.75-4.687-3.75-7.5a3.75 3.75 0 013.75-3.75z" stroke="currentColor" strokeWidth="1.1"/><circle cx="7.5" cy="5.625" r="1.25" stroke="currentColor" strokeWidth="1.1"/></svg>
                  <span className="text-[14px] text-text">{contact.city}</span>
                </div>
              )}

              {contact.ico && (
                <div className="flex items-start gap-2.5">
                  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="text-muted mt-0.5 shrink-0"><rect x="2.5" y="2.5" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.1"/><path d="M5 5h5M5 7.5h3.5M5 10h4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
                  <span className="text-[14px] text-text font-mono">{contact.ico}</span>
                </div>
              )}
            </div>
          </div>

          {/* Pipeline info card */}
          <div className="bg-surface border border-line rounded-xl p-5">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted mb-3">
              Pipeline
            </h2>
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-muted">Fáze</dt>
                <dd className={`font-medium px-2 py-0.5 rounded text-[12px] ${stageColor(contact.stage_type)}`}>
                  {contact.stage_name}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Priorita</dt>
                <dd className={`font-medium px-2 py-0.5 rounded text-[12px] ${priority.cls}`}>
                  {priority.label}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Pokusů</dt>
                <dd className="text-text font-mono">{contact.attempt_count}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Operátor</dt>
                <dd className="text-text">{contact.owner_name ?? "\u2014"}</dd>
              </div>
              {contact.next_action_at && (
                <div className="flex justify-between">
                  <dt className="text-muted">Další akce</dt>
                  <dd className="text-text text-right">
                    <span className="block">{contact.next_action_type === "call" ? "Zavolat" : contact.next_action_type === "meeting" ? "Schůzka" : contact.next_action_type ?? "\u2014"}</span>
                    <span className="text-[11px] text-muted">{formatDate(contact.next_action_at)}</span>
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted">Zdroj</dt>
                <dd className="text-text">{contact.lead_source ?? "\u2014"}</dd>
              </div>
              <div className="border-t border-line pt-2 flex justify-between">
                <dt className="text-muted">Vytvořen</dt>
                <dd className="text-[12px] text-muted font-mono">{formatDate(contact.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Aktualizován</dt>
                <dd className="text-[12px] text-muted font-mono">{formatRelativeTime(contact.updated_at)}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
