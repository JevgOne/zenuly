# Krok 1: Zalozeni Next.js projektu Weblyx CRM

## Prehled
Zalozit Next.js projekt v `/Users/zen/zenuly/`, nakonfigurovat stack (App Router, TypeScript strict, Tailwind, Supabase), nastavit design tokeny a pripravit zakladni strukturu.

## Predpoklady
- Adresar `/Users/zen/zenuly/` existuje (prazdny)
- Podklady v `/Users/zen/Downloads/weblyx-crm-podklady/`
- Node.js a npm nainstalovany

---

## Kroky implementace

### 1. Zkopirovat podklady do projektu
- Zkopirovat `CLAUDE.md` z `/Users/zen/Downloads/weblyx-crm-podklady/CLAUDE.md` do `/Users/zen/zenuly/CLAUDE.md`
- Zkopirovat cely adresar `docs/` z `/Users/zen/Downloads/weblyx-crm-podklady/docs/` do `/Users/zen/zenuly/docs/`
- Toto musi byt PRVNI krok, protoze CLAUDE.md rika "Pred prvnim promptem musi byt v repozitari CLAUDE.md a slozka docs/"

### 2. Inicializovat Next.js projekt
Spustit v `/Users/zen/zenuly/`:
```bash
npx create-next-app@latest . --app --typescript --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack --use-npm
```
Parametry:
- `--app` = App Router
- `--typescript` = TypeScript
- `--tailwind` = Tailwind CSS
- `--eslint` = ESLint
- `--src-dir` = pouzit `src/` adresar
- `--import-alias "@/*"` = import alias
- `.` = do aktualniho adresare (zenuly/)

### 3. Nastavit TypeScript strict mode
V `tsconfig.json` overit/nastavit:
```json
{
  "compilerOptions": {
    "strict": true
  }
}
```
(create-next-app uz typicky nastavi strict: true, ale overit)

### 4. Nainstalovat IBM Plex fonty
```bash
npm install @fontsource/ibm-plex-sans @fontsource/ibm-plex-mono
```
NEBO lepe pouzit `next/font/google` (zero-layout-shift, automaticky optimalizovane):
```typescript
// src/app/layout.tsx
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'

const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['500'],
  variable: '--font-mono',
  display: 'swap',
})
```

### 5. Nakonfigurovat Tailwind s design tokeny
V `tailwind.config.ts` (nebo CSS config pokud Tailwind v4):

**DULEZITE:** Zkontrolovat verzi Tailwind — Next.js 15+ pouziva Tailwind v4 s CSS-based konfiguraci (`@theme` v CSS), NE `tailwind.config.ts`.

#### Pokud Tailwind v4 (pravdepodobne):
V `src/app/globals.css` pridat:
```css
@import "tailwindcss";

@theme {
  /* Barvy */
  --color-bg: #F6F5F1;
  --color-surface: #FDFDFB;
  --color-line: #E4E2DC;
  --color-line-strong: #C9C6BE;
  --color-track: #ECEAE4;
  --color-ink: #16181D;
  --color-muted: #5E6168;
  --color-accent: #2449C9;
  --color-accent-tint: #E8ECFA;
  --color-accent-ink: #1B3699;
  --color-accent-deep: #12245F;
  --color-urgent: #A3410E;
  --color-urgent-tint: #FBEDE4;
  --color-urgent-ink: #7A3410;

  /* Pismo */
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);

  /* Zaobleni */
  --radius-card: 15px;    /* karty 14-16px */
  --radius-btn: 13px;     /* tlacitka 12-14px */
  --radius-tag: 8px;      /* stitky */
  --radius-pill: 9999px;  /* pill tlacitka */
}
```

#### Pokud Tailwind v3 (mene pravdepodobne):
V `tailwind.config.ts`:
```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: '#F6F5F1',
        surface: '#FDFDFB',
        line: { DEFAULT: '#E4E2DC', strong: '#C9C6BE' },
        track: '#ECEAE4',
        ink: '#16181D',
        muted: '#5E6168',
        accent: { DEFAULT: '#2449C9', tint: '#E8ECFA', ink: '#1B3699', deep: '#12245F' },
        urgent: { DEFAULT: '#A3410E', tint: '#FBEDE4', ink: '#7A3410' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'IBM Plex Sans', 'sans-serif'],
        mono: ['var(--font-mono)', 'IBM Plex Mono', 'monospace'],
      },
      borderRadius: {
        card: '15px',
        btn: '13px',
        tag: '8px',
        pill: '9999px',
      },
    },
  },
  plugins: [],
}
export default config
```

### 6. Nastavit layout s fonty a zakladnim stylem
V `src/app/layout.tsx`:
```typescript
import type { Metadata } from 'next'
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const plexSans = IBM_Plex_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Weblyx CRM',
  description: 'Interni CRM pro callcentrum Weblyxu',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="cs" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body className="bg-bg text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
```

### 7. Vytvorit uvodní stranku
V `src/app/page.tsx` — jednoducha stranka ukazujici spravne fonty a barvy:
```typescript
export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="bg-surface border border-line rounded-card p-8 max-w-md w-full mx-4">
        <h1 className="text-2xl font-semibold mb-2">Weblyx CRM</h1>
        <p className="text-muted mb-4">Interni CRM pro callcentrum</p>
        <p className="font-mono text-sm text-accent">v0.1.0</p>
      </div>
    </main>
  )
}
```

### 8. Nainstalovat Supabase klienty
```bash
npm install @supabase/supabase-js @supabase/ssr
```

### 9. Vytvorit .env.example a .env.local
`.env.example`:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

`.env.local` (kopie, s placeholder hodnotami — uzivatel doplni):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Pridat `.env.local` do `.gitignore` (create-next-app uz typicky ma).

### 10. Vytvorit Supabase klienty
Podle doporuceni @supabase/ssr pro Next.js App Router:

`src/lib/supabase/server.ts` — pro Server Components a Server Actions:
```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch { /* Server Component — read-only */ }
        },
      },
    }
  )
}
```

`src/lib/supabase/client.ts` — pro Client Components:
```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

`src/lib/supabase/admin.ts` — pro server-only admin operace (service role):
```typescript
import { createClient } from '@supabase/supabase-js'
import 'server-only'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
```
Pozn: `import 'server-only'` zajisti, ze se admin klient nikdy nedostane do bundlu prohlizece.
Nainstalovat: `npm install server-only`

### 11. Inicializovat Supabase CLI
```bash
npx supabase init
```
To vytvori adresar `supabase/` s `config.toml`.

Vytvorit adresare pro migrace a testy:
```bash
mkdir -p supabase/migrations supabase/tests
```

### 12. Napsat README.md
Kratke README s instrukcemi:
```markdown
# Weblyx CRM

Interni CRM pro callcentrum Weblyxu.

## Spusteni lokalne

1. Naklonuj repozitar
2. `npm install`
3. Zkopiruj `.env.example` do `.env.local` a doplni Supabase klice
4. `npm run dev`
5. Otevri http://localhost:3000

## Supabase

- Migrace: `supabase/migrations/`
- Testy: `supabase/tests/`
- Lokalni vyvoj: `npx supabase start`

## Stack

- Next.js (App Router, TypeScript strict, Tailwind)
- Supabase (Postgres, Auth, RLS)
- Nasazeni: Vercel, domena zenuly.cz
```

### 13. Inicializovat Git
```bash
cd /Users/zen/zenuly
git init
git add .
git commit -m "chore: init Next.js project with Tailwind, Supabase, design tokens"
```

### 14. Overeni (Hotovo, kdyz)
```bash
npm run lint
npm run build
npm run dev  # stranka bezi na localhost:3000
```
- Stranka ma spravne pismo (IBM Plex Sans/Mono)
- Stranka ma spravne barvy (bg #F6F5F1, surface #FDFDFB, ink #16181D, accent #2449C9)
- Aplikace se pripravi na pripojeni k Supabase (klienti existuji, env vars pripraveny)

---

## Dulezite poznamky pro implementatora

1. **Poradi**: Nejdriv zkopiruj CLAUDE.md a docs/, potom teprve `create-next-app` (aby se neprepsal pripadny obsah). POZOR: create-next-app NEFUNGUJE do neprazdneho adresare — je treba nejdriv zalozit projekt do zenuly/, pak zkopirovat CLAUDE.md a docs/ dovnitr.
2. **Tailwind verze**: Zkontroluj jaka verze Tailwind se nainstaluje. Next.js 15+ muze pouzivat Tailwind v4 (CSS-based config pres `@theme`). Pokud ano, pouzij CSS pristup. Pokud v3, pouzij `tailwind.config.ts`.
3. **Fonty**: Pouzij `next/font/google` (ne @fontsource), protoze Next.js optimalizuje fonty automaticky.
4. **server-only**: Nainstaluj balik `server-only` pro admin klienta Supabase.
5. **Jazyk UI je cestina**: Texty v UI pis cesky, kod anglicky.
6. **Nepridavej fake data**: Uvodni stranka nema ukazkova cisla, jen text.
7. **Verze balicku**: Pouzij `@latest` pro create-next-app, at mame nejnovejsi Next.js.

## Poznatky z HTML predloh (overeni design tokenu)

Prozkoumal jsem vsech 8 HTML predloh. Potvrzuji, ze design tokeny v planu presne odpovidaji predloham:

**Potvrzene hodnoty z predloh:**
- Pozadi body: `#F6F5F1` (bg) — overeno ve vsech souborech
- Karty/panely: `#FDFDFB` (surface) s borderem `#E4E2DC` (line) — overeno
- Font: `'IBM Plex Sans', system-ui, sans-serif` — pouzito vsude
- Mono font: `'IBM Plex Mono', monospace` — pouzito pro cisla, casy, klavesy
- Zaobleni karet: `border-radius: 14px–16px` — overeno (14px lead karty, 16px velke panely)
- Zaobleni tlacitka pill: `border-radius: 22px` (plne kulata, 44px vyska)
- Progress bar: vyska 6px, zaobleni 3px, pozadi `#ECEAE4` (track), vyplneni `#2449C9` (accent)
- Nadpis obrazovky: 24–28px, font-weight 600, letter-spacing -0.01em
- Sekce nadpis: 12px, font-weight 600, letter-spacing 0.06em, uppercase
- Text: 15–16px, popisky 13px
- Dotykovy cil: min 44px (overeno u tlacitek v hlavicce)
- Propadly callback: pozadi `#FBEDE4` (urgent-tint), border `#F1D9C6`, text `#7A3410` (urgent-ink), badge `#A3410E` (urgent)
- Vybrany stav: border 1.5px `#2449C9` (accent), pozadi `#E8ECFA` (accent-tint)
- Priorita vysoka: tecka 8x8px background `#2449C9`; bezna: border 1.5px `#C9C6BE`
- Klavesy v zapisu (pocitac): Plex Mono 12px, pozadi `#ECEAE4` (track), zaobleni 4px

**Breakpointy z predloh:**
- Mobil: 390px sire (predlohy 01–05)
- Pocitac: 1440px sire, max-width 1600px (predloha 07)
- Tablet: neni v predloze velikostne, ale dokumentovano v design.md jako 768–1279px

**Dalsi barva nalezena v predlohach (NENI v design.md):**
- `#F1D9C6` — border propadleho callbacku (pouzita v 01-mobil-fronta.html a 07-pocitac.html). Doporucuji pridat jako `urgent-line` token, nebo ji implementator pouzije primo.
- `#8A8D94` — barva chevron sipky na lead kartach (pouzita v 01-mobil-fronta.html). Sekundarni, neni treba token.

**Navigace:**
- Mobil: spodni navigace 78px, 4 sloupce (Fronta, Ukoly, Kalendar, Vykon)
- Pocitac: horni lista s tab navigaci (Fronta, Ukoly, Kalendar, Pipeline, Vykon) — Pipeline je navic oproti mobilu
