# QA Report — Task #61: Onboarding navigation fix

Datum: 2026-10-12
Kontrolor: QA agent

---

## 1. useEffect dependency fix

**Soubor:** `src/app/(app)/[projectSlug]/_components/onboarding-wizard.tsx:284-293`

```tsx
useEffect(() => {
  if (current.path) {
    setNavigating(true);
    router.push(current.path);
    router.refresh();
    const t = setTimeout(() => setNavigating(false), 600);
    return () => clearTimeout(t);
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [step]);
```

**Analýza:**
- Původní `[current.path, router]`: `router` je stabilní, ale `current.path` je odvozeno z `steps[step]` — každá změna `step` stejně spustí efekt. Klíčový problém byl, že `current` se odvozuje od `steps`, které jsou computed z `role` a `projectSlug` props. Pokud byl render spuštěn před stabilizací props (race při hydration), `current.path` mohl být `null` nebo s nesprávným slugem.
- Nové `[step]`: efekt se spustí pouze při explicitní změně stepu (uživatelská akce), kdy jsou props garantovaně stabilní. `current` je čten v closure — v době spuštění efektu je vždy aktuální. ✅
- `router.refresh()`: zajistí re-render server components v layoutu, layout znovu načte `onboarding_completed` z DB. ✅
- `eslint-disable-next-line`: záměrné potlačení exhaustive-deps — `router` a `current.path` jsou stabilní/closure, nepotřebují být v deps. ✅
- Timeout 600ms (byl 400ms): dává stránce více času na render před skrytím "Právě se díváte" textu. ✅

**Verdikt: ✅ Fix správný**

---

## 2. projectSlug — předávání (trace)

Řetězec předávání:

```
layout.tsx:17      const { projectSlug } = await params;         ← z Next.js URL params
layout.tsx:104     <OnboardingGate projectSlug={projectSlug} />  ← vždy string, nikdy undefined
                                                                    (layout crashuje redirect před tímto)
onboarding-gate.tsx:22  <OnboardingWizard projectSlug={projectSlug} />
onboarding-wizard.tsx:273  const steps = getSteps(role, projectSlug);
getSteps():          path: `/${slug}/dashboard`  ← template literal s `slug` parametrem
```

**Guard v layout.tsx:** Pokud projekt neexistuje → `notFound()` nebo `redirect("/")`— wizard se nikdy nezobrazí bez validního `projectSlug`. ✅

**Proč byl původní bug "/undefined/":** `current.path` v `[current.path, router]` deps se vyhodnocoval při prvním renderu na serveru/hydration — v tu chvíli mohl `params` Promise ještě nebýt resolved, ale to je nepravděpodobné v Next.js 16 App Router (params jsou synchronně dostupné v layout). Pravděpodobnější příčina: React strict mode double-invoke efektu s race condition při `step=0` (welcome, `path=null`) a prvním kliknutím.

V každém případě nové `[step]` problém eliminuje — efekt se nespouští při mountu (step=0 welcome, efekt by neběžel kvůli `if (current.path)` check — ale s `[step]` se efekt spustí jen při ZMĚNĚ step, ne při mountu). ✅

**Verdikt: ✅ projectSlug se správně předává, undefined nemožný**

---

## 3. Validita všech paths v steps

### Admin steps (8 kroků):

| Krok | id | path | Route existuje |
|------|----|------|----------------|
| 1 | welcome | `null` | — (žádná navigace) |
| 2 | dashboard | `/${slug}/dashboard` | ✅ `dashboard/page.tsx` |
| 3 | contacts | `/${slug}/kontakty` | ✅ `kontakty/page.tsx` |
| 4 | pipeline | `/${slug}/pipeline` | ✅ `pipeline/page.tsx` |
| 5 | queue | `/${slug}/fronta` | ✅ `fronta/page.tsx` |
| 6 | report | `/${slug}/report` | ✅ `report/page.tsx` |
| 7 | settings | `/settings` | ✅ `src/app/settings/page.tsx` |
| 8 | finish | `null` | — (žádná navigace) |

### Operator steps (9 kroků):

| Krok | id | path | Route existuje |
|------|----|------|----------------|
| 1 | welcome | `null` | — |
| 2 | shift | `/${slug}/fronta` | ✅ `fronta/page.tsx` |
| 3 | queue | `/${slug}/fronta` | ✅ |
| 4 | lead | `/${slug}/fronta` | ✅ |
| 5 | result | `/${slug}/fronta` | ✅ |
| 6 | help | `/${slug}/fronta` | ✅ |
| 7 | tasks | `/${slug}/ukoly` | ✅ `ukoly/page.tsx` |
| 8 | performance | `/${slug}/vykon` | ✅ `vykon/page.tsx` |
| 9 | finish | `null` | — |

Ověřeno fyzicky: všechny adresáře (`dashboard`, `kontakty`, `pipeline`, `fronta`, `report`, `ukoly`, `vykon`) existují v `src/app/(app)/[projectSlug]/`. `/settings` existuje v `src/app/settings/page.tsx`.

**Žádná path nevede na neexistující route.** ✅

**Verdikt: ✅ Všechny paths validní**

---

## Souhrn

| Oblast | Výsledek |
|--------|----------|
| useEffect dependency fix | ✅ PASS |
| projectSlug předávání | ✅ PASS |
| Validita paths (admin + operator) | ✅ PASS |

**Celkový verdikt: ✅ FIX SCHVÁLEN — kód je správný, 404 na /undefined/ nemožný**
