"use client";

import type { ImportResult } from "@/app/actions/import-leads";

type ImportResultViewProps = {
  result: ImportResult;
  onReset: () => void;
  projectSlug: string;
};

export function ImportResultView({
  result,
  onReset,
  projectSlug,
}: ImportResultViewProps) {
  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Tile label="Importováno" value={result.imported} color="accent" />
        <Tile label="Duplicity" value={result.duplicates} color="muted" />
        <Tile label="Nevolat" value={result.dnc} color="urgent" />
        <Tile label="Neplatný telefon" value={result.invalidPhone} color="urgent" />
      </div>

      {/* Errors */}
      {result.errors.length > 0 && (
        <div className="bg-urgent-soft rounded-lg p-4">
          <h3 className="text-sm font-semibold text-urgent mb-2">
            Chyby ({result.errors.length})
          </h3>
          <ul className="space-y-1">
            {result.errors.map((err, i) => (
              <li key={i} className="text-sm text-text">
                {err}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-4 border-t border-line">
        <button
          onClick={onReset}
          className="h-11 px-4 text-sm font-medium rounded-md bg-accent text-white hover:bg-accent/90 transition-colors"
        >
          Importovat další
        </button>
        <a
          href={`/${projectSlug}/fronta`}
          className="h-11 px-4 flex items-center text-sm rounded-md border border-line text-muted hover:text-text transition-colors"
        >
          Zpět na frontu
        </a>
      </div>
    </div>
  );
}

function Tile({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "accent" | "muted" | "urgent";
}) {
  const colorMap = {
    accent: "text-accent",
    muted: "text-muted",
    urgent: "text-urgent",
  };

  return (
    <div className="bg-surface rounded-lg border border-line p-4 text-center">
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}
