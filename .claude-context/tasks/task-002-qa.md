# QA Report — Krok 1: Založení projektu Weblyx CRM

**Datum:** 2026-10-08  
**Kontrolor:** kontrolor  
**Projekt:** /Users/zen/zenuly/

---

## 1. SIMPLIFY — zbytečná složitost, duplicity

### globals.css — sebereference CSS proměnné

**PROBLÉM:** V `globals.css` jsou font proměnné definovány jako sebereference:

```css
--font-sans: var(--font-sans);
--font-mono: var(--font-mono);
```

Toto je neplatná CSS konstrukce — proměnná odkazuje sama na sebe, výsledkem je `undefined`. Next.js `next/font/google` sice správně nastavuje `--font-sans` a `--font-mono` na `<html>` elementu přes `className`, ale Tailwind `@theme` blok tyto proměnné přepíše sebereferencí.

**Správné řešení:** V `@theme` bloku font proměnné vynechat — Tailwind automaticky použije CSS proměnnou stejného jména, protože `variable: "--font-sans"` v layout.tsx nastaví `--font-sans` přímo na `<html>`.

### layout.tsx — zbytečné import

`LayoutProps<"/">` je nový Next.js 16 typ — build prošel, OK.

### Ostatní

Kód je přehledný, bez duplicit, bez zbytečné složitosti.

---

## 2. DEBUG — npm run lint, build, dev

| Příkaz | Výsledek |
|--------|----------|
| `npm run lint` | ✅ Prošel bez chyb |
| `npm run build` | ✅ Prošel bez chyb (Turbopack, TypeScript strict) |
| `npm run dev` | Nespouštěno (nevyžaduje se při CI QA, není .env.local s reálnými klíči) |

Build výstup:
- Next.js 16.4.0 (Turbopack)
- TypeScript strict — OK
- 2 statické routes (/, /_not-found)

---

## 3. REVERZNÍ KONTROLA

| Požadavek | Stav | Poznámka |
|-----------|------|----------|
| Next.js (App Router, TypeScript strict, Tailwind, src/) | ✅ | `strict: true` v tsconfig, src/app/ přítomno |
| CLAUDE.md a docs/ zkopírovány | ✅ | Oboje přítomno, docs/ obsahuje design.md, specifikace, postup-prompty, navod-operatorka, design-predloha/ |
| Tailwind tokeny — všech 13 barev z design.md | ✅ | bg, surface, line, line-strong, track, ink, muted, accent, accent-tint, accent-ink, accent-deep, urgent, urgent-tint, urgent-ink = 14 tokenů (urgent-ink navíc = OK) |
| Písma IBM Plex Sans (400,500,600) + IBM Plex Mono (500) | ✅ | layout.tsx: weight ["400","500","600"] + ["500"], latin-ext subset |
| Supabase CLI — supabase/ s migrations/ a tests/ | ✅ | supabase/config.toml, supabase/migrations/, supabase/tests/ přítomny |
| .env.example s 3 proměnnými | ✅ | NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY |
| Supabase klienti (server + browser + admin) | ✅ | src/lib/supabase/{server,client,admin}.ts — správná implementace s @supabase/ssr |
| README | ✅ | Přítomen, popisuje stack, spuštění, supabase příkazy |
| npm run dev běží, správné fonty a barvy | ⚠️ | Build OK; fonty mají potenciální problém (viz SIMPLIFY) |

---

## Shrnutí

**Celkový stav: PASS s jednou výhradou**

### Nalezenou chybu je třeba opravit:

**globals.css — sebereference fontů** (`--font-sans: var(--font-sans)`)

Tato konstrukce způsobuje, že Tailwind `@theme` přepíše font proměnné neplatnou hodnotou. Fonty fungují, pokud `body` má třídu `font-sans` a prohlížeč spadne zpět na CSS proměnnou z `<html>` atributu — ale závisí to na pořadí cascade, nikoli na záměrné definici.

**Oprava (implementátor):** V `globals.css` odstranit řádky 21–22:
```css
/* SMAZAT toto: */
--font-sans: var(--font-sans);
--font-mono: var(--font-mono);
```

Tailwind 4 `@theme` a `next/font` variable systém nepotřebují explicitní přemapování — funguje automaticky.
