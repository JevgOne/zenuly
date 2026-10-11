import * as XLSX from "xlsx";

export type ParsedFile = {
  headers: string[];
  rows: Record<string, string>[];
};

/**
 * Parse CSV or Excel file to structured data.
 * Handles Windows-1250 encoding common in Czech CSV files.
 */
export async function parseFile(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    codepage: 1250,
    raw: false,
  });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Soubor je prázdný.");

  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

  if (raw.length < 2) throw new Error("Soubor musí mít hlavičku a alespoň jeden řádek dat.");

  const headers = raw[0].map((h) => String(h ?? "").trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i];
    if (!row || row.every((c) => !c || String(c).trim() === "")) continue;
    const obj: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = String(row[j] ?? "").trim();
    }
    rows.push(obj);
  }

  return { headers, rows };
}
