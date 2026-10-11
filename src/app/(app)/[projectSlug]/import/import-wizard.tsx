"use client";

import { useState, useCallback } from "react";
import { parseFile, type ParsedFile } from "@/lib/utils/parse-file";
import { autoMapColumns } from "@/lib/utils/auto-map-columns";
import { importLeads, type ImportRow, type ImportResult } from "@/app/actions/import-leads";
import { FileUpload } from "./file-upload";
import { ColumnMapper } from "./column-mapper";
import { ImportResultView } from "./import-result";

type Step = "upload" | "mapping" | "processing" | "result";

export function ImportWizard({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const [step, setStep] = useState<Step>("upload");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const data = await parseFile(file);
      setParsed(data);
      setFileName(file.name);
      const autoMapped = autoMapColumns(data.headers);
      setMapping(autoMapped);
      setStep("mapping");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chyba při čtení souboru.");
    }
  }, []);

  const handleImport = useCallback(
    async (
      columnMapping: Record<string, string>,
      globalPhoneSource: string | null
    ) => {
      if (!parsed) return;
      setStep("processing");
      setError(null);

      try {
        // Map parsed rows to ImportRow using column mapping
        const rows: ImportRow[] = parsed.rows.map((row) => ({
          company: row[columnMapping.company] ?? "",
          phone: row[columnMapping.phone] ?? "",
          phone_source:
            columnMapping.phone_source
              ? row[columnMapping.phone_source] ?? globalPhoneSource ?? "databaze"
              : globalPhoneSource ?? "databaze",
          contact_person: columnMapping.contact_person
            ? row[columnMapping.contact_person]
            : undefined,
          email: columnMapping.email ? row[columnMapping.email] : undefined,
          website: columnMapping.website
            ? row[columnMapping.website]
            : undefined,
          city: columnMapping.city ? row[columnMapping.city] : undefined,
          ico: columnMapping.ico ? row[columnMapping.ico] : undefined,
          lead_source: columnMapping.lead_source
            ? row[columnMapping.lead_source]
            : undefined,
          priority: columnMapping.priority
            ? Number(row[columnMapping.priority]) || undefined
            : undefined,
          findings: columnMapping.findings
            ? row[columnMapping.findings]
            : undefined,
          hook_text: columnMapping.hook_text
            ? row[columnMapping.hook_text]
            : undefined,
          hook_source: columnMapping.hook_source
            ? row[columnMapping.hook_source]
            : undefined,
        }));

        const res = await importLeads(projectId, rows);
        setResult(res);
        setStep("result");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Chyba při importu."
        );
        setStep("mapping");
      }
    },
    [parsed, projectId]
  );

  const handleReset = useCallback(() => {
    setParsed(null);
    setMapping({});
    setFileName("");
    setResult(null);
    setError(null);
    setStep("upload");
  }, []);

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6 text-sm text-muted">
        <StepBadge label="1. Soubor" active={step === "upload"} done={step !== "upload"} />
        <span>→</span>
        <StepBadge
          label="2. Mapování"
          active={step === "mapping"}
          done={step === "processing" || step === "result"}
        />
        <span>→</span>
        <StepBadge
          label="3. Výsledek"
          active={step === "processing" || step === "result"}
          done={step === "result"}
        />
      </div>

      {error && (
        <div className="bg-urgent-soft text-urgent text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {step === "upload" && <FileUpload onFile={handleFile} />}

      {step === "upload" && parsed && fileName && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          <span className="text-text font-medium">{fileName}</span>
          <span className="text-muted">{parsed.rows.length} řádků</span>
        </div>
      )}

      {step === "mapping" && parsed && (
        <ColumnMapper
          headers={parsed.headers}
          rows={parsed.rows}
          initialMapping={mapping}
          onImport={handleImport}
          onBack={handleReset}
        />
      )}

      {step === "processing" && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="h-8 w-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted">Importuji leady...</p>
        </div>
      )}

      {step === "result" && result && (
        <ImportResultView
          result={result}
          onReset={handleReset}
          projectSlug={projectSlug}
        />
      )}
    </div>
  );
}

function StepBadge({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs ${
        active
          ? "bg-accent text-white font-medium"
          : done
            ? "text-accent"
            : "text-muted"
      }`}
    >
      {label}
    </span>
  );
}
