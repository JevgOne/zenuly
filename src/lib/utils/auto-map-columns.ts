const FIELD_ALIASES: Record<string, string[]> = {
  company: ["firma", "firmy", "company", "název", "nazev", "name", "název firmy", "nazev firmy", "company name"],
  phone: ["telefon", "tel", "phone", "mobil", "číslo", "cislo", "phone number"],
  phone_source: ["zdroj čísla", "zdroj cisla", "phone source", "zdroj telefonu"],
  contact_person: ["kontakt", "kontaktní osoba", "kontaktni osoba", "contact", "jméno", "jmeno", "contact person"],
  email: ["email", "e-mail", "mail", "e-mailová adresa"],
  website: ["web", "website", "www", "url", "webová stránka"],
  city: ["město", "mesto", "city", "obec", "místo"],
  ico: ["ičo", "ico", "ič", "ic", "identifikační číslo"],
  lead_source: ["zdroj", "zdroj leadu", "lead source", "odkud"],
  priority: ["priorita", "priority", "důležitost"],
  findings: ["findings", "nálezy", "nalezy", "rozbor", "důvody", "duvody", "reasons"],
  hook_text: ["háček", "hacek", "hook", "proč voláme", "proc volame", "důvod hovoru", "duvod hovoru"],
  hook_source: ["zdroj háčku", "zdroj hacku", "hook source"],
};

/**
 * Auto-map CSV/Excel column headers to lead fields.
 * Returns a mapping of field name → header name.
 */
export function autoMapColumns(
  headers: string[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const header of headers) {
      if (used.has(header)) continue;
      const normalized = header.toLowerCase().trim();
      if (aliases.some((a) => a === normalized)) {
        mapping[field] = header;
        used.add(header);
        break;
      }
    }
  }

  return mapping;
}

export const LEAD_FIELDS = Object.keys(FIELD_ALIASES);
export const REQUIRED_FIELDS = ["company", "phone", "phone_source"];
