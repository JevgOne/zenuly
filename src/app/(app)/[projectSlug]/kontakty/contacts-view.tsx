"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  getContactsOverview,
  type ContactCard,
} from "@/app/actions/contacts";
import { PageHelpButton } from "@/components/page-help-button";

type Stage = { key: string; name: string; type: string };

const SORT_OPTIONS = [
  { value: "trust_desc", label: "Trust score ↓" },
  { value: "trust_asc", label: "Trust score ↑" },
  { value: "completeness_desc", label: "Vyplněnost ↓" },
  { value: "completeness_asc", label: "Vyplněnost ↑" },
  { value: "activity_desc", label: "Poslední aktivita ↓" },
  { value: "activity_asc", label: "Poslední aktivita ↑" },
  { value: "name_asc", label: "A → Z" },
  { value: "name_desc", label: "Z → A" },
];

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
  if (type === "won") return "bg-green-100 text-green-700";
  if (type === "lost") return "bg-urgent-soft text-urgent";
  return "bg-accent-soft text-accent";
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

function ContactCardItem({
  contact,
  projectSlug,
}: {
  contact: ContactCard;
  projectSlug: string;
}) {
  const score = contact.trust_score;

  return (
    <Link
      href={`/${projectSlug}/kontakty/${contact.id}`}
      className="bg-surface border border-line rounded-xl p-5 flex flex-col gap-3 hover:border-accent/40 hover:shadow-sm transition-all group"
    >
      {/* Header: company + stage badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold text-text truncate group-hover:text-accent transition-colors">
            {contact.company}
          </h3>
          {contact.contact_person && (
            <p className="text-[13px] text-muted truncate mt-0.5">
              {contact.contact_person}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-md text-[11px] font-semibold uppercase tracking-wide ${stageColor(contact.stage_type)}`}
        >
          {contact.stage_name}
        </span>
      </div>

      {/* Trust score */}
      <div className="flex items-center gap-3">
        <div className="relative w-11 h-11 shrink-0">
          <svg viewBox="0 0 36 36" className="w-11 h-11 -rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-bg"
            />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeDasharray={`${score * 0.974} 100`}
              strokeLinecap="round"
              className={trustColor(score)}
            />
          </svg>
          <span
            className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold ${trustColor(score)}`}
          >
            {score}
          </span>
        </div>
        <div className="min-w-0">
          <p className={`text-[13px] font-semibold ${trustColor(score)}`}>
            {trustLabel(score)}
          </p>
          <p className="text-[11px] text-muted">Trust score</p>
        </div>
      </div>

      {/* Completeness bar */}
      <div>
        <div className="flex justify-between items-center mb-1">
          <span className="text-[11px] font-medium text-muted">
            Vyplněnost
          </span>
          <span className="text-[11px] font-mono text-text">
            {contact.completeness_pct} %
          </span>
        </div>
        <div className="h-1.5 bg-bg rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${trustBg(contact.completeness_pct)}`}
            style={{ width: `${contact.completeness_pct}%` }}
          />
        </div>
      </div>

      {/* Contact info */}
      <div className="flex flex-col gap-1 text-[13px]">
        <div className="flex items-center gap-2 text-muted">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
            <path d="M5.25 2.625H3.75a1.125 1.125 0 00-1.125 1.125v.75a8.25 8.25 0 008.25 8.25h.75a1.125 1.125 0 001.125-1.125v-1.785a.75.75 0 00-.51-.712l-2.1-.7a.75.75 0 00-.81.263l-.63.787A6.75 6.75 0 015.57 6.1l.787-.63a.75.75 0 00.263-.81l-.7-2.1a.75.75 0 00-.712-.51H5.25z" stroke="currentColor" strokeWidth="1.1"/>
          </svg>
          <span className="truncate">{contact.phone}</span>
        </div>
        {contact.email && (
          <div className="flex items-center gap-2 text-muted">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="shrink-0">
              <rect x="1.75" y="3.5" width="10.5" height="7" rx="1" stroke="currentColor" strokeWidth="1.1"/>
              <path d="M2 4l5 3.5L12 4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="truncate">{contact.email}</span>
          </div>
        )}
      </div>

      {/* Footer: calls + last activity */}
      <div className="flex items-center justify-between pt-2 border-t border-line/50 text-[11px] text-muted">
        <span>
          {contact.total_calls} {contact.total_calls === 1 ? "hovor" : contact.total_calls < 5 ? "hovory" : "hovorů"}
        </span>
        <span>{formatRelativeTime(contact.last_activity)}</span>
      </div>
    </Link>
  );
}

export function ContactsView({
  projectId,
  projectSlug,
  stages,
}: {
  projectId: string;
  projectSlug: string;
  stages: Stage[];
}) {
  const [contacts, setContacts] = useState<ContactCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [sort, setSort] = useState("trust_desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(
    async (s?: string) => {
      setLoading(true);
      try {
        const result = await getContactsOverview(
          projectId,
          s ?? search,
          stageFilter,
          sort
        );
        setContacts(result.contacts);
        setTotal(result.total);
      } catch {
        setContacts([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [projectId, search, stageFilter, sort]
  );

  useEffect(() => {
    load();
  }, [load]);

  function handleSearchChange(value: string) {
    setSearch(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(value), 300);
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-8">
      <PageHelpButton text="Seznam všech kontaktů v projektu. Můžete filtrovat, řadit a kliknout na kontakt pro detail." />
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-text">Kontakty</h1>
          <p className="text-[13px] text-muted mt-1">
            {total} {total === 1 ? "kontakt" : total < 5 ? "kontakty" : "kontaktů"}
          </p>
        </div>
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Hledat firmu, jméno, email..."
            className="w-full pl-9 pr-3 h-10 border border-input-border rounded-lg text-[14px] bg-surface text-text outline-none focus:border-accent transition-colors"
          />
        </div>

        {/* Stage filter */}
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          className="h-10 border border-input-border rounded-lg px-3 text-[14px] bg-surface text-text outline-none focus:border-accent transition-colors"
        >
          <option value="">Všechny fáze</option>
          {stages.map((s) => (
            <option key={s.key} value={s.key}>
              {s.name}
            </option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="h-10 border border-input-border rounded-lg px-3 text-[14px] bg-surface text-text outline-none focus:border-accent transition-colors"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-[260px] bg-surface border border-line rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="bg-surface border border-line rounded-xl p-12 text-center">
          <p className="text-[15px] text-muted">
            {search || stageFilter
              ? "Žádné kontakty neodpovídají filtru."
              : "V projektu zatím nejsou žádné kontakty."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {contacts.map((c) => (
            <ContactCardItem
              key={c.id}
              contact={c}
              projectSlug={projectSlug}
            />
          ))}
        </div>
      )}
    </div>
  );
}
