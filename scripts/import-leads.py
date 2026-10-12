#!/usr/bin/env python3
"""
Import leads from CSV files into Supabase.
Usage: python3 scripts/import-leads.py
"""

import csv
import json
import os
import re
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone

# Config
SUPABASE_URL = "https://lftzebeptmmyoljyifbe.supabase.co"
SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmdHplYmVwdG1teW9sanlpZmJlIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5MTQ2MjEyMSwiZXhwIjoyMTA3MDM4MTIxfQ.DkYkt3h1TnS5cyw6iqUm3d5wr0tpY1yPNo5PXZZxiW8"
PROJECT_ID = "00000000-0000-0000-0000-000000000001"
STAGE_ID = "a549c8d6-d3f7-43fe-bbc1-816ce5f454ee"  # "new" stage
CSV_DIR = os.path.join(os.path.dirname(__file__), "..", "leady")
BATCH_SIZE = 500

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=ignore-duplicates,return=minimal",
}


def normalize_phone(phone: str) -> str:
    """Normalize phone to E.164 format."""
    digits = re.sub(r"[^\d+]", "", phone.strip())
    if digits.startswith("+420"):
        return digits
    if digits.startswith("420") and len(digits) == 12:
        return f"+{digits}"
    if len(digits) == 9 and digits[0] in "2367":
        return f"+420{digits}"
    return digits


def extract_city(address: str) -> str:
    """Extract city from Czech address like 'Ulice 123, Město'."""
    if not address:
        return ""
    parts = address.split(",")
    if len(parts) >= 2:
        return parts[-1].strip()
    return address.strip()


def extract_kraj(filename: str) -> str:
    """Extract region name from filename."""
    name = os.path.basename(filename).replace("leady-", "").replace(".csv", "")
    kraj_map = {
        "jihocesky": "Jihočeský",
        "jihomoravsky": "Jihomoravský",
        "karlovarsky": "Karlovarský",
        "kralovehradecky": "Královéhradecký",
        "liberecky": "Liberecký",
        "moravskoslezsky": "Moravskoslezský",
        "olomoucky": "Olomoucký",
        "pardubicky": "Pardubický",
        "plzensky": "Plzeňský",
        "stredocesky": "Středočeský",
        "ustecky": "Ústecký",
        "vysocina": "Vysočina",
        "zlinsky": "Zlínský",
    }
    return kraj_map.get(name, name)


def load_csv(filepath: str) -> list[dict]:
    """Load and parse a CSV file, returning list of row dicts."""
    rows = []
    kraj = extract_kraj(filepath)
    with open(filepath, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f, delimiter=";", quotechar='"')
        for row in reader:
            phone = normalize_phone(row.get("telefon", ""))
            if not phone or len(phone) < 9:
                continue

            company = (row.get("firma") or "").strip()
            if not company:
                continue

            score = 0
            try:
                score = int(row.get("skore", "0"))
            except ValueError:
                pass

            city = extract_city(row.get("adresa", ""))

            rows.append({
                "project_id": PROJECT_ID,
                "company": company,
                "phone": phone,
                "email": (row.get("email") or "").strip() or None,
                "website": (row.get("web") or "").strip() or None,
                "city": city or None,
                "hook_text": (row.get("duvody") or "").strip() or None,
                "lead_source": "find-leads",
                "phone_source": "web_firmy",
                "stage_id": STAGE_ID,
                "priority": 3 if score >= 8 else 2 if score >= 5 else 1,
                "is_active": True,
                "custom_data": json.dumps({"kraj": kraj, "skore": score}),
                "imported_at": datetime.now(timezone.utc).isoformat(),
            })

    return rows


def insert_batch(rows: list[dict]) -> tuple[int, int]:
    """Insert a batch of rows via Supabase REST API. Returns (inserted, skipped)."""
    body = json.dumps(rows).encode("utf-8")
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/leads",
        data=body,
        headers=HEADERS,
        method="POST",
    )
    try:
        urllib.request.urlopen(req)
        return len(rows), 0
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="replace")
        # If batch fails due to duplicates with ON CONFLICT, try one-by-one
        if "duplicate" in error_body.lower() or e.code == 409:
            inserted = 0
            skipped = 0
            for row in rows:
                single_body = json.dumps([row]).encode("utf-8")
                single_req = urllib.request.Request(
                    f"{SUPABASE_URL}/rest/v1/leads",
                    data=single_body,
                    headers=HEADERS,
                    method="POST",
                )
                try:
                    urllib.request.urlopen(single_req)
                    inserted += 1
                except urllib.error.HTTPError:
                    skipped += 1
            return inserted, skipped
        else:
            print(f"  ERROR: {e.code} - {error_body[:200]}")
            return 0, len(rows)


def main():
    csv_files = sorted(
        [f for f in os.listdir(CSV_DIR) if f.endswith(".csv")],
    )

    all_rows = []
    for fname in csv_files:
        filepath = os.path.join(CSV_DIR, fname)
        rows = load_csv(filepath)
        print(f"  {fname}: {len(rows)} valid records")
        all_rows.extend(rows)

    # Sort by score descending (higher priority first)
    all_rows.sort(key=lambda r: json.loads(r["custom_data"])["skore"], reverse=True)

    # Deduplicate by phone (keep highest score)
    seen_phones: set[str] = set()
    unique_rows = []
    for row in all_rows:
        if row["phone"] not in seen_phones:
            seen_phones.add(row["phone"])
            unique_rows.append(row)

    print(f"\nTotal: {len(all_rows)} records, {len(unique_rows)} unique phones")
    print(f"Duplicates removed: {len(all_rows) - len(unique_rows)}")
    print(f"Importing in batches of {BATCH_SIZE}...\n")

    total_inserted = 0
    total_skipped = 0

    for i in range(0, len(unique_rows), BATCH_SIZE):
        batch = unique_rows[i : i + BATCH_SIZE]
        batch_num = i // BATCH_SIZE + 1
        total_batches = (len(unique_rows) + BATCH_SIZE - 1) // BATCH_SIZE

        inserted, skipped = insert_batch(batch)
        total_inserted += inserted
        total_skipped += skipped

        print(f"  Batch {batch_num}/{total_batches}: {inserted} inserted, {skipped} skipped")

    print(f"\nDone! Inserted: {total_inserted}, Skipped: {total_skipped}")


if __name__ == "__main__":
    main()
