# Weblyx CRM

Interní CRM pro callcentrum Weblyxu. Operátorky volají firmám, zapisují výsledek hovoru a systém naplánuje další krok.

## Stack

- **Frontend:** Next.js 16 (App Router), TypeScript strict, Tailwind CSS 4
- **Backend:** Supabase (Postgres, Auth, RLS, Edge Functions)
- **Nasazení:** Vercel, doména zenuly.cz

## Spuštění lokálně

```bash
# 1. Nainstaluj závislosti
npm install

# 2. Nastav proměnné prostředí
cp .env.example .env.local
# Vyplň NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY a SUPABASE_SERVICE_ROLE_KEY

# 3. Spusť vývojový server
npm run dev
```

Aplikace poběží na [http://localhost:3000](http://localhost:3000).

## Supabase

Schéma databáze se spravuje výhradně přes migrace v `supabase/migrations/`.

```bash
npx supabase db push    # Spusť migrace
npx supabase test db    # Spusť testy
```

## Dokumentace

- `CLAUDE.md` – pravidla a zásady projektu
- `docs/specifikace-weblyx.md` – byznys specifikace
- `docs/design.md` – design systém
- `docs/design-predloha/` – 8 HTML předloh obrazovek
- `docs/navod-operatorka.md` – texty nápovědy
- `docs/postup-prompty.md` – postup stavby
