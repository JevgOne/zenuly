"use client";

import { useState, useMemo } from "react";
import { LEAD_FIELDS, REQUIRED_FIELDS } from "@/lib/utils/auto-map-columns";

const PHONE_SOURCE_OPTIONS = [
  { value: "web_firmy", label: "Web firmy" },
  { value: "profil_firmy", label: "Profil firmy" },
  { value: "databaze", label: "Databáze" },
  { value: "poptavka", label: "Poptávka" },
  { value: "lead_finder", label: "Lead-finder (automaticky)" },
];

const FIELD_LABELS: Record<string, string> = {
  company: "Firma",
  phone: "Telefon",
  phone_source: "Zdroj čísla",
  contact_person: "Kontaktní osoba",
  email: "E-mail",
  website: "Web",
  city: "Město",
  ico: "IČO",
  lead_source: "Zdroj leadu",
  priority: "Priorita",
  findings: "Nálezy",
  hook_text: "Důvod hovoru",
  hook_source: "Zdroj háčku",
};

type ColumnMapperProps = {
  headers: string[];
  rows: Record<string, string>[];
  initialMapping: Record<string, string>;
  onImport: (
    mapping: Record<string, string>,
    globalPhoneSource: string | null
  ) => void;
  onBack: () => void;
};

export function ColumnMapper({
  headers,
  rows,
  initialMapping,
  onImport,
  onBack,
}: ColumnMapperProps) {
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping);
  const [globalPhoneSource, setGlobalPhoneSource] = useState<string>("databaze");

  const phoneSourceMapped = !!mapping.phone_source;

  const preview = useMemo(() => rows.slice(0, 3), [rows]);

  const getPreview = (header: string) =>
    preview
      .map((r) => r[header])
      .filter(Boolean)
      .slice(0, 3)
      .join(", ");

  // Available headers: those not already mapped to another field
  const usedHeaders = new Set(Object.values(mapping));

  const missingRequired = REQUIRED_FIELDS.filter((f) => {
    if (f === "phone_source") return !phoneSourceMapped && !globalPhoneSource;
    return !mapping[f];
  });

  const canImport = missingRequired.length === 0;

  const requiredFields = LEAD_FIELDS.filter((f) => REQUIRED_FIELDS.includes(f));
  const optionalFields = LEAD_FIELDS.filter((f) => !REQUIRED_FIELDS.includes(f));

  return (
    <div className="space-y-6">
      {/* Required fields */}
      <div>
        <h2 className="text-sm font-semibold text-text mb-3">
          Povinná pole
        </h2>
        <div className="space-y-3">
          {requiredFields.map((field) => (
            <FieldRow
              key={field}
              field={field}
              required
              headers={headers}
              usedHeaders={usedHeaders}
              currentHeader={mapping[field] ?? ""}
              preview={mapping[field] ? getPreview(mapping[field]) : ""}
              onChange={(header) => {
                setMapping((prev) => {
                  const next = { ...prev };
                  if (header) {
                    next[field] = header;
                  } else {
                    delete next[field];
                  }
                  return next;
                });
              }}
            />
          ))}
        </div>
      </div>

      {/* Global phone source selector (if not mapped to a column) */}
      {!phoneSourceMapped && (
        <div className="bg-accent-soft rounded-lg p-4">
          <label className="block text-sm font-medium text-text mb-2">
            Zdroj čísla pro celý import
          </label>
          <p className="text-xs text-muted mb-2">
            Sloupec &bdquo;Zdroj čísla&ldquo; není namapovaný. Vyberte jednu hodnotu pro všechny řádky.
          </p>
          <select
            value={globalPhoneSource}
            onChange={(e) => setGlobalPhoneSource(e.target.value)}
            className="w-full sm:w-64 h-10 px-3 text-sm rounded-md border border-input-border bg-surface text-text"
          >
            {PHONE_SOURCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Optional fields */}
      <div>
        <h2 className="text-sm font-semibold text-text mb-3">
          Volitelná pole
        </h2>
        <div className="space-y-3">
          {optionalFields.map((field) => (
            <FieldRow
              key={field}
              field={field}
              required={false}
              headers={headers}
              usedHeaders={usedHeaders}
              currentHeader={mapping[field] ?? ""}
              preview={mapping[field] ? getPreview(mapping[field]) : ""}
              onChange={(header) => {
                setMapping((prev) => {
                  const next = { ...prev };
                  if (header) {
                    next[field] = header;
                  } else {
                    delete next[field];
                  }
                  return next;
                });
              }}
            />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-line">
        <button
          onClick={onBack}
          className="h-11 px-4 text-sm rounded-md border border-line text-muted hover:text-text transition-colors"
        >
          Zpět
        </button>
        <button
          onClick={() =>
            onImport(mapping, phoneSourceMapped ? null : globalPhoneSource)
          }
          disabled={!canImport}
          className="h-11 px-6 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Importovat {rows.length} leadů
        </button>
        {missingRequired.length > 0 && (
          <p className="text-xs text-urgent">
            Chybí: {missingRequired.map((f) => FIELD_LABELS[f] ?? f).join(", ")}
          </p>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  field,
  required,
  headers,
  usedHeaders,
  currentHeader,
  preview,
  onChange,
}: {
  field: string;
  required: boolean;
  headers: string[];
  usedHeaders: Set<string>;
  currentHeader: string;
  preview: string;
  onChange: (header: string) => void;
}) {
  const label = FIELD_LABELS[field] ?? field;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="w-full sm:w-40 flex items-center gap-1">
        <span className="text-sm text-text">
          {label}
          {required && <span className="text-urgent ml-0.5">*</span>}
        </span>
      </div>
      <div className="flex-1 flex items-center gap-2">
        <span className="text-muted text-sm">→</span>
        <select
          value={currentHeader}
          onChange={(e) => onChange(e.target.value)}
          className={`flex-1 h-10 px-3 text-sm rounded-md border bg-surface text-text ${
            required && !currentHeader
              ? "border-urgent"
              : "border-input-border"
          }`}
        >
          <option value="">— neimportovat —</option>
          {headers.map((h) => (
            <option
              key={h}
              value={h}
              disabled={usedHeaders.has(h) && h !== currentHeader}
            >
              {h}
            </option>
          ))}
        </select>
      </div>
      {preview && (
        <p className="text-xs text-muted truncate max-w-48 hidden sm:block">
          {preview}
        </p>
      )}
    </div>
  );
}
