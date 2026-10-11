# Krok 4: Prihlaseni a role — detailni plan

## Prehled
Implementovat autentizaci (email+heslo), 2FA pro admina, spravu uzivatelu, prepinac projektu. Operator po prihlaseni vidi jen svuj projekt.

## Stav projektu
- Next.js 16.4.0 (pouziva `proxy.ts`, NE middleware.ts)
- Supabase klienti hotovi: server.ts, client.ts, admin.ts
- DB schema hotove: profiles, projects, project_members (s RLS)
- Layout: IBM Plex fonty, design tokeny

---

## CAST A: PROXY (autentizace sessions)

### Soubor: `src/proxy.ts`

Next.js 16 pouziva `proxy.ts` (ne middleware.ts). Export musi byt `export function proxy`, BEZ `export default`.

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const PUBLIC_ROUTES = ['/login', '/auth/callback', '/auth/confirm']

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Vytvorit response
  let response = NextResponse.next({ request })

  // Vytvorit Supabase klienta s cookie handling
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Obnovit session (DULEZITE — musi se volat vzdy)
  const { data: { user } } = await supabase.auth.getUser()

  // Verejne routy — povolit bez prihlaseni
  if (PUBLIC_ROUTES.some(r => pathname.startsWith(r))) {
    // Pokud je prihlaseny a jde na /login, presmerovat na /
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }

  // Chranene routy — presmerovat na login
  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
```

**DULEZITE:** `proxy.ts` v Next.js 16:
- Soubor v `src/proxy.ts`
- `export function proxy` (NE export default)
- Funkce MUSI byt async (kvuli `supabase.auth.getUser()`)

---

## CAST B: AUTH CALLBACK

### Soubor: `src/app/auth/callback/route.ts`

Pro potvrzeni emailu, magic linku, OAuth callback.

```typescript
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Chyba — presmerovat na login s chybou
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
```

### Soubor: `src/app/auth/confirm/route.ts`

Pro potvrzeni emailove adresy (email verification).

```typescript
import { createClient } from '@/lib/supabase/server'
import { type EmailOtpType } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      return NextResponse.redirect(`${origin}/login?verified=true`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=verification_failed`)
}
```

---

## CAST C: PRIHLASOVACI STRANKA

### Soubor: `src/app/login/page.tsx`

Server Component wrapper.

### Soubor: `src/app/login/login-form.tsx`

Client Component (`'use client'`) — formulare prihlaseni.

**Design (z design.md tokenu):**
- Stranka: `bg-bg`, centrovany obsah
- Karta: `bg-surface border border-line rounded-card p-8 max-w-sm`
- Nadpis: "Prihlaseni" (24px, 600)
- Vstupy: email, heslo — `border border-line-strong rounded-btn px-3 h-11 font-sans text-ink`
- Tlacitko: "Prihlasit se" — `bg-accent text-white rounded-btn h-12 font-semibold`
- Chybova hlaska: `text-urgent text-sm`

**Funkcionalita:**
1. Email + heslo formular
2. `supabase.auth.signInWithPassword({ email, password })`
3. Po uspesnem prihlaseni: `router.push('/')` nebo `next` param
4. Chybove stavy: spatne heslo, neexistujici ucet, neovereny email
5. Zobrazit "Email overen" toast pokud `?verified=true`

**ZADNA registrace** — operatory pridava admin (viz Cast E).

---

## CAST D: ODHLASENI

### Server Action: `src/app/actions/auth.ts`

```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
```

---

## CAST E: 2FA PRO ADMINA

### Supabase MFA (TOTP)

Supabase ma built-in podporu pro TOTP (Time-based One-Time Password) pres `supabase.auth.mfa`.

**Flow:**
1. Admin zapne 2FA v nastaveni profilu
2. `supabase.auth.mfa.enroll({ factorType: 'totp' })` — vrati QR kod
3. Admin naskenuje QR v auth app (Google Authenticator, Authy, ...)
4. `supabase.auth.mfa.challengeAndVerify({ factorId, code })` — overeni
5. Pri kazdem prihlaseni admina: po email+heslo se zobrazi 2FA formular
6. `supabase.auth.mfa.challenge({ factorId })` -> `supabase.auth.mfa.verify({ factorId, challengeId, code })`

### Soubory:

**`src/app/login/mfa-form.tsx`** — Client Component
- Zobrazi se po uspesnem email+heslo prihlaseni POKUD ma uzivatel enrollovany factor
- Vstup pro 6-mistny kod
- Overeni pres `supabase.auth.mfa.challengeAndVerify()`

**`src/app/settings/mfa-setup.tsx`** — Client Component
- Jen pro admina (v nastaveni profilu)
- Zapnuti/vypnuti 2FA
- QR kod pro naskeneni
- Overeni prvniho kodu

**Detekce zda uzivatel ma MFA:**
```typescript
const { data: factors } = await supabase.auth.mfa.listFactors()
const hasTOTP = factors?.totp?.some(f => f.status === 'verified')
```

**Login flow s MFA:**
1. `signInWithPassword()` — uspech
2. Zkontrolovat `mfa.listFactors()` — ma verified TOTP?
3. ANO -> zobrazit MFA formular -> `challengeAndVerify()` -> presmerovat
4. NE -> presmerovat rovnou

### RLS s MFA (volitelne, doporuceno):
V proxy.ts overit AAL (Authenticator Assurance Level):
```typescript
const { data: { user } } = await supabase.auth.getUser()
if (user) {
  // Zkontrolovat AAL pro admina
  const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aalData?.currentLevel === 'aal1' && aalData?.nextLevel === 'aal2') {
    // Uzivatel ma MFA ale jeste neoveril -> presmerovat na MFA
    return NextResponse.redirect(new URL('/login/mfa', request.url))
  }
}
```

---

## CAST F: SPRAVA UZIVATELU (JEN ADMIN)

### Route group: `src/app/(admin)/admin/users/`

**DULEZITE:** Admin sekce musi byt chranena — operator se na ni nedostane. Kontrola v layoutu nebo v proxy.ts.

### Stranky:

**`src/app/(admin)/admin/users/page.tsx`** — Seznam uzivatelu
- Server Component
- Nacist vsechny profiles + jejich project_members
- Tabulka: Jmeno, Email, Role, Projekty, Akce
- Tlacitko "Pozvat operatora"

**`src/app/(admin)/admin/users/invite-form.tsx`** — Client Component
- Dialog/modal pro pozvani
- Vstupy: jmeno, email, projekt(y)
- Pouzit `supabase.auth.admin.createUser()` z admin klienta (service role)
- NEBO lepe: `supabase.auth.admin.inviteUserByEmail()` — posle pozvankovy email

### Server Action: `src/app/actions/users.ts`

```typescript
'use server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export async function inviteOperator(formData: FormData) {
  // 1. Overit ze volajici je admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (profile?.role !== 'admin') throw new Error('Forbidden')

  // 2. Vytvorit uzivatele pres admin API
  const admin = createAdminClient()
  const email = formData.get('email') as string
  const fullName = formData.get('full_name') as string
  const projectIds = formData.getAll('project_ids') as string[]

  const { data: newUser, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,  // automaticky overit email
    user_metadata: { full_name: fullName, role: 'operator' },
    // Vygenerovat nahodne heslo — admin ho sdelí osobne nebo pres email
  })

  if (error) throw error

  // 3. Priradit k projektum
  for (const projectId of projectIds) {
    await admin.from('project_members').insert({
      project_id: projectId,
      profile_id: newUser.user.id,
    })
  }

  // 4. Nastavit heslo — admin ho posle operatorovi
  // VARIANTA A: Vygenerovat heslo a zobrazit adminovi
  // VARIANTA B: Poslat invitation email s linkem na nastaveni hesla
  //   await admin.auth.admin.inviteUserByEmail(email)
  // Doporucuji VARIANTU B (bezpecnejsi)
}

export async function assignToProject(profileId: string, projectId: string) {
  // Overit admin...
  const admin = createAdminClient()
  await admin.from('project_members').insert({
    project_id: projectId,
    profile_id: profileId,
  })
}

export async function removeFromProject(profileId: string, projectId: string) {
  const admin = createAdminClient()
  await admin.from('project_members').delete()
    .eq('project_id', projectId)
    .eq('profile_id', profileId)
}
```

---

## CAST G: PREPINAC PROJEKTU

### Design (z predloh):

**Mobil (01-mobil-fronta.html):**
- Pill tlacitko vlevo nahore: accent tecka (8px) + nazev projektu + chevron dolu
- `h-11 px-3.5 border border-line rounded-pill bg-surface font-semibold text-[15px]`
- Po tapnuti: dropdown/bottom-sheet se seznamem projektu

**Pocitac (07-pocitac.html):**
- Pill tlacitko v headeru: accent tecka + nazev projektu
- `h-10 px-3.5 border border-line rounded-pill bg-bg font-semibold text-sm`
- Po kliknuti: dropdown se seznamem

### Implementace:

**`src/components/project-switcher.tsx`** — Client Component
- Nacte projekty uzivatele (z project_members)
- Aktualni projekt v URL nebo cookie
- Dropdown s projekty
- Po prepnuti: `router.push()` nebo nastavit cookie + refresh

**Ulozeni aktualniho projektu:**
- VARIANTA A: URL segment `/[projectSlug]/...` — ciste, ale slozitejsi routing
- VARIANTA B: Cookie `current_project_id` — jednodussi
- **DOPORUCUJI VARIANTU A** (`/[projectSlug]/`) — je cistsi, funguje s bookmarky, a operator ma typicky jen 1 projekt

### Route struktura:

```
src/app/
  login/
    page.tsx              — prihlaseni
    mfa-form.tsx          — 2FA formular
  (app)/
    [projectSlug]/        — dynamicky segment projektu
      layout.tsx          — hlavni layout s headerem, navigaci, prepinac
      page.tsx            — redirect na /fronta nebo default
      fronta/
        page.tsx          — (Krok 7)
      ...
  (admin)/
    admin/
      layout.tsx          — overeni admin role
      users/
        page.tsx          — sprava uzivatelu
```

**Pozn:** Pouziti route groups `(app)` a `(admin)` pro odlisne layouty.

### `src/app/(app)/[projectSlug]/layout.tsx`

```typescript
// Server Component
// 1. Nacist uzivatele
// 2. Nacist profil (role)
// 3. Overit ze uzivatel je clenem projektu s timto slugem
// 4. Pokud neni -> 404 nebo redirect
// 5. Renderovat header s prepinacam projektu, navigaci, avatar
// 6. Poskytnout project context pres React context nebo props
```

### Context provider:

**`src/lib/contexts/project-context.tsx`** — poskytnout aktualni projekt do komponent
```typescript
'use client'
import { createContext, useContext } from 'react'

type ProjectContext = {
  projectId: string
  projectSlug: string
  projectName: string
  userRole: 'admin' | 'operator'
}

const ProjectCtx = createContext<ProjectContext | null>(null)
export const useProject = () => {
  const ctx = useContext(ProjectCtx)
  if (!ctx) throw new Error('useProject must be used within ProjectProvider')
  return ctx
}
export const ProjectProvider = ProjectCtx.Provider
```

---

## CAST H: PRVNI PRIHLASENI — REDIRECT LOGIKA

Po prihlaseni:
1. Nacist profil uzivatele (role, onboarded)
2. Nacist projekty uzivatele
3. Pokud ma 1 projekt -> `/weblyx/` (jeho slug)
4. Pokud ma vic projektu -> `/` s vyberem projektu
5. Pokud neni clen zadneho projektu -> "Nemáte přiřazený projekt, kontaktujte administrátora"
6. Pokud `onboarded = false` -> pruvodce (Krok 7, ted jen flag)

### `src/app/(app)/page.tsx` nebo redirect v proxy

```typescript
// Po prihlaseni: nacist projekty uzivatele
// Pokud 1 projekt -> redirect na /[slug]/
// Pokud vice -> zobrazit vyber
// Pokud 0 -> "Kontaktujte administratora"
```

---

## CAST I: HEADER A NAVIGACE (zaklad)

Zakladni header pro Krok 4 — plna navigace prijde v Kroku 7, ale zaklad musi byt ted.

### Pocitac (>= 1280px):
```
[Prepinac projektu] [Fronta] [Ukoly] [Kalendar] [Pipeline*] [Vykon]  ...flex...  [Hovory X/Y] [Pauza] [Avatar PK]
```
*Pipeline jen pro admina

### Mobil (< 768px):
```
Hlavicka: [Prepinac projektu]  [Pauza] [Avatar]
Spodni nav: [Fronta] [Ukoly] [Kalendar] [Vykon]
```

### Soubory:
- `src/components/app-header.tsx` — horni lista (server + client parts)
- `src/components/bottom-nav.tsx` — spodni navigace pro mobil (client)
- `src/components/user-menu.tsx` — avatar s dropdown (odhlaseni, nastaveni) (client)

**Pro Krok 4 staci zakladni verze** — plne pocitadlo hovoru, smeny atd. prijdou v Kroku 7 a 11.

---

## PORADI IMPLEMENTACE

1. **proxy.ts** — session refresh, ochrana rout, redirect neprihlasenychx
2. **Auth callback + confirm routy** — `/auth/callback`, `/auth/confirm`
3. **Login stranka** — email+heslo formular, chybove stavy
4. **Sign out action** — `/actions/auth.ts`
5. **MFA** — enroll, challenge, verify; MFA formular v loginu; nastaveni v profilu
6. **Route struktura** — `(app)/[projectSlug]/`, `(admin)/admin/`
7. **Project context** — provider, useProject hook
8. **Project switcher** — dropdown/bottom-sheet
9. **App layout** — header, navigace, avatar, prepinac
10. **Sprava uzivatelu** — pozvani operatora, prirazeni k projektu
11. **Redirect po prihlaseni** — na spravny projekt
12. **Overeni** — lint, build, prihlaseni admin + operator

## KRITERIUM HOTOVO

- Admin se prihlasi s email+heslo a vidi vsechny projekty
- Operator se prihlasi a vidi jen svuj projekt
- Admin muze zapnout 2FA a prihlasit se s nim
- Admin muze pozvat operatora a priradit k projektu
- Prepinac projektu funguje
- Neprihlaseny uzivatel je presmerovan na /login
- `npm run lint` a `npm run build` prochazi

## DULEZITE POZNAMKY PRO IMPLEMENTATORA

1. **Next.js 16 = proxy.ts**: Soubor `src/proxy.ts`, export `function proxy` (BEZ default). Overeno v pameti — middleware.ts NEFUNGUJE v Next.js 16.
2. **Service role key JEN na serveru**: `createAdminClient()` pouziva `import 'server-only'`. Nikdy neimportovat v client components.
3. **Operator nema registraci**: Vsechny ucty vytvari admin pres `auth.admin.createUser()` nebo `inviteUserByEmail()`.
4. **Hesla**: Pri pozvani operatora bud vygenerovat heslo a sdelit osobne, nebo pouzit invitation email s linkem na nastaveni hesla. Druha varianta je bezpecnejsi.
5. **RLS uz funguje**: Profily, projekty, project_members maji RLS z Kroku 2. Netreba resit viditelnost na urovni kodu — DB to resi.
6. **Onboarded flag**: V Kroku 4 jen nastavit flag. Pruvodce prvnim prihlasenim se implementuje v Kroku 7.
7. **Admin route ochrana**: `(admin)/admin/layout.tsx` musi overit `role = 'admin'`. Pokud operator zkusi pristoupit, redirect na /.
8. **Design tokeny**: Pouzivat hotove Tailwind tokeny z Kroku 1 (bg-surface, text-ink, border-line, bg-accent, rounded-card, rounded-btn, rounded-pill atd.).
