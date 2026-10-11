# Task 006 — Evžen: kontrola Kroku 1

**Datum:** 2026-10-08
**Verdikt: SCHVALENO**

## Checklist

| # | Bod | Stav | Detail |
|---|-----|------|--------|
| 1 | Next.js App Router, TS strict, Tailwind, src/ | OK | Next.js 16.4.0, `"strict": true` v tsconfig.json, Tailwind v4, src/ adresář existuje |
| 2 | CLAUDE.md a docs/ zkopírovány | OK | CLAUDE.md v kořeni, docs/ s 5 soubory + design-predloha/ (8 HTML) |
| 3 | 13 Tailwind barevných tokenů | OK | bg, surface, line, line-strong, track, ink, muted, accent, accent-tint, accent-ink, accent-deep, urgent, urgent-tint, urgent-ink — hex hodnoty odpovídají design.md |
| 4 | IBM Plex Sans (400,500,600) + Mono (500) | OK | layout.tsx: next/font/google, variable --font-sans / --font-mono, subsets latin + latin-ext |
| 5 | Supabase CLI — supabase/ | OK | config.toml (project_id: zenuly), migrations/ a tests/ existují (prázdné, v pořádku pro Krok 1) |
| 6 | .env.example | OK | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY |
| 7 | Supabase klienty | OK | client.ts (browser/createBrowserClient), server.ts (SSR/createServerClient s cookies), admin.ts (service role + server-only guard) |
| 8 | README | OK | Stack, lokální spuštění (npm install, .env, npm run dev), Supabase příkazy, odkazy na docs |
| 9 | npm run dev | OK | Server na portu 3098, `next build` prochází bez chyb |
| 10 | Písmo a barvy na stránce | OK | Kompilovaný CSS: --font-sans = "IBM Plex Sans", všech 13 barev v @layer theme, stránka se renderuje |

## Font self-reference bug

OPRAVENO. globals.css neobsahuje `--font-sans: var(--font-sans)` ani `--font-mono: var(--font-mono)`.
Self-reference v kompilovaném CSS (řádky 291-292) pochází z Tailwind v4 interně — kaskáda funguje správně díky next/font CSS třídám na `<html>`.

## Drobná pozorování (neopravovat, jen pro info)

- `LayoutProps<"/">` v layout.tsx — funguje, ale je to Next.js 16 generovaný typ
- Zaoblení v @theme: card 15px, btn 13px — design.md říká 14-16 a 12-14 px, implementátor zvolil střed, OK
- Supabase config.toml je výchozí ze `supabase init`, v pořádku pro Krok 1
