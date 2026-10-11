"use client";

import { useCallback, useRef, useState } from "react";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED = ".csv,.xlsx,.xls";

export function FileUpload({
  onFile,
}: {
  onFile: (file: File) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      setError(null);
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !["csv", "xlsx", "xls"].includes(ext)) {
        setError("Nepodporovaný formát. Použijte CSV nebo Excel (.xlsx, .xls).");
        return;
      }
      if (file.size > MAX_SIZE) {
        setError("Soubor je příliš velký. Maximum je 5 MB.");
        return;
      }
      onFile(file);
    },
    [onFile]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        className={`flex flex-col items-center justify-center gap-3 p-10 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
          dragOver
            ? "border-accent bg-accent-soft"
            : "border-line bg-surface hover:border-accent/50"
        }`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
      >
        <svg
          className="w-10 h-10 text-muted"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>
        <p className="text-sm text-muted text-center">
          Přetáhněte CSV nebo Excel soubor, nebo klikněte pro výběr
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        onChange={onChange}
        className="hidden"
        aria-label="Vybrat soubor pro import"
      />

      <p className="text-xs text-muted mt-2">
        Podporované formáty: CSV, XLSX. Maximální velikost: 5 MB.
      </p>

      {error && (
        <p className="text-sm text-urgent mt-2">{error}</p>
      )}
    </div>
  );
}
