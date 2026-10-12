# QA Report — Task #34: Pokročilý interaktivní onboarding pro operátory

Datum: 2026-10-12
Kontrolor: QA agent

---

## 1. SIMPLIFY — Kvalita kódu

**Soubor:** `src/app/(app)/[projectSlug]/_components/onboarding-wizard.tsx`

### Co je dobré:
- STEPS pole jako konstantní datová struktura — čisté, snadno rozšiřitelné
- `measureTarget` + `useCallback` správně memoizováno
- `useEffect` cleanup handler odstraňuje event listenery a timer — bez memory leaků
- `fetchIdRef` pattern NENÍ potřeba zde (jeden měřicí efekt, ne race condition) — správné
- `handleFinish` a `handleSkip` jsou fakticky identické — OK, záměrně oddělené pro budoucí divergenci
- `completeOnboarding()` voláno v obou cestách (finish + skip) ✅
- Fallback modal pro případ, že target element není nalezen — defensivní design ✅
- `getTooltipStyle` a `arrowClass` jsou čisté pure funkce bez side effects

### Drobná poznámka (nízká závažnost):
- `handleFinish` a `handleSkip` jsou identické. Lze sloučit do jedné funkce `handleComplete`, ale není to chyba — jedná se o záměr pro budoucí UX rozlišení.

**Verdikt: ✅ PASS**

---

## 2. DEBUG — Build a lint

```
npm run build  → ✅ PASS (no errors)
npm run lint   → ✅ PASS (no warnings in onboarding-wizard.tsx)
```

Build proběhl čistě. Žádné TypeScript chyby, žádné lint warnings.

**Verdikt: ✅ PASS**

---

## 3. REVERZNÍ KONTROLA — Plnění požadavků

### Požadavky ze zadání:
> „Průvodce pro operátorku při prvním přihlášení — interaktivní, ukazuje prvky UI, 8 kroků, fallback modal pokud element není viditelný, ukládá dokončení onboardingu."

### Ověření:

| Požadavek | Stav | Detail |
|-----------|------|--------|
| 8 kroků průvodce | ✅ | STEPS má 8 položek |
| shift-start | ✅ | `data-onboarding="shift-start"` → shift-bar.tsx:97 |
| queue-list | ✅ | `data-onboarding="queue-list"` → queue-list.tsx:97 |
| first-lead | ✅ | `data-onboarding="first-lead"` → queue-list.tsx:117 (podmíněně) |
| hook-section | ✅ | `data-onboarding="hook-section"` → lead-card.tsx:102 |
| help-button | ✅ | `data-onboarding="help-button"` → help-sheet.tsx:90 |
| objections | ✅ | `data-onboarding="objections"` → objection-chips.tsx:28 |
| outcome-panel | ✅ | `data-onboarding="outcome-panel"` → outcome-panel.tsx:246 |
| save-button | ✅ | `data-onboarding="save-button"` → outcome-panel.tsx:448 |
| Fallback modal | ✅ | `isFallback` branch s centrovaným modalem |
| Box-shadow cutout | ✅ | `boxShadow: 0 0 0 9999px rgba(0,0,0,0.6)` na highlight elementu |
| CSS šipky k cíli | ✅ | `arrowClass()` generuje CSS border trojúhelníky |
| completeOnboarding() při finish | ✅ | `handleFinish` volá `completeOnboarding()` |
| completeOnboarding() při skip | ✅ | `handleSkip` volá `completeOnboarding()` |
| Progress bar | ✅ | Pruh kroků v obou větvích (tooltip i modal) |
| Scrollování na target | ✅ | `el.scrollIntoView({ behavior: "smooth" })` |
| Responzivita | ✅ | `max-w-sm`, `min-h-[44px]` dotykové cíle |

### Potenciální problém — mobilní zobrazení kroku 6 (objections):

`objection-chips.tsx` má třídu `hidden xl:block` — na obrazovkách menších než 1280px je element skrytý.
`getBoundingClientRect()` na skrytém elementu (`display: none`) vrací nulový DOMRect.
Výsledek: krok 6 (Námitky klienta) se na mobilních/tabletových zařízeních vždy zobrazí jako fallback modal.

**Závažnost: NÍZKÁ** — fallback modal funguje správně a zobrazuje `fallbackText`. Uživatel průvodce dokončí bez chyby. Je to záměrné chování pro elementy, které nejsou na malých obrazovkách viditelné.

**Verdikt: ✅ PASS s poznámkou**

---

## Souhrn

| Typ kontroly | Výsledek |
|---|---|
| SIMPLIFY | ✅ PASS |
| DEBUG | ✅ PASS |
| REVERZNÍ KONTROLA | ✅ PASS |

**Celkový verdikt: ✅ SCHVÁLENO**

Jedna poznámka nízké závažnosti: krok 6 (objections) vždy zobrazí fallback modal na zařízeních < 1280px šířky kvůli `hidden xl:block` na cílovém elementu. Fallback text je správně nastaven, průvodce funguje i tak.
