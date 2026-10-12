# QA Report — Kompletní kontrola (2026-10-12)

Kontrolor: QA agent

---

## 1. Onboarding Wizard (Task #58)

**Soubory:** `onboarding-wizard.tsx`, `onboarding-gate.tsx`, `layout.tsx`

### Admin / manager kroky:
- welcome → dashboard → contacts → pipeline → queue → report → settings → finish
- Celkem 8 kroků ✅

### Operator kroky:
- welcome → shift → queue → lead → result → help → tasks → performance → finish
- Celkem 9 kroků ✅

### router.push navigace:
- Každý krok s `path !== null` volá `router.push(current.path)` v `useEffect` ✅
- `onboarding-wizard.tsx:287` — `router.push(current.path)` ✅

### Progress bar:
- Rendering: `steps.map((_, i) => ...)` — výplň `bg-accent` pro `i <= step`, `bg-line` pro ostatní
- **DROBNÁ CHYBA:** `onboarding-wizard.tsx:353-358` — podmínka je `i < step ? "bg-accent" : i === step ? "bg-accent" : "bg-line"` — obě větve pro `i < step` i `i === step` dávají `bg-accent`. To je funkčně správné (aktuální + hotové kroky jsou vyplněné), jen zbytečná duplicita. ✅ FUNKČNĚ OK

### Přeskočit průvodce:
- `handleSkip` voláno z tlačítka `onboarding-wizard.tsx:420-427` ✅
- `handleSkip` volá `completeOnboarding()` a pak `onComplete()` — `onboarding-wizard.tsx:316-324` ✅

### completeOnboarding volání:
- `handleFinish` (krok Finish → "Začít pracovat"): `onboarding-wizard.tsx:306-314` ✅
- `handleSkip` ("Přeskočit průvodce"): `onboarding-wizard.tsx:316-324` ✅

### OnboardingGate:
- `onboarding-gate.tsx:15` — `useState(!onboardingCompleted)` ✅
- Layout předává `profile.onboarding_completed ?? false` ✅
- `layout.tsx:28` — dotaz `onboarding_completed` v profiles ✅

**Verdikt: ✅ PASS**

---

## 2. Kalendář fix — profile_id

**Soubor:** `src/app/(app)/[projectSlug]/kalendar/page.tsx`

```
.eq("profile_id", user.id)  ← řádek 25
```

Používá `profile_id` (správně) ✅ — ne `user_id`.

**Verdikt: ✅ PASS**

---

## 3. Bottom Nav

**Soubor:** `src/components/bottom-nav.tsx`

### Admin vidí (ADMIN_NAV řádky 16-22):
- Dashboard ✅
- Kontakty ✅
- Pipeline ✅
- Report ✅
- Více ✅ (rozbalovací menu s Fronta, Úkoly, Import, Export hodin, Výkon, Kalendář)

### Operator vidí (OPERATOR_NAV řádky 9-14):
- Fronta ✅
- Úkoly ✅
- Kalendář ✅
- Výkon ✅

### Podmínka role:
- `bottom-nav.tsx:137` — `isAdmin = role === "admin" || role === "manager"` ✅ (manager dostane admin nav)

**Verdikt: ✅ PASS**

---

## 4. Login / Register

### login-form.tsx:
- Resend verification button: `login-form.tsx:163-182` — zobrazuje se pokud `showResend && !resendSent` ✅
- `showResend` se nastavuje při `"Email not confirmed"` (řádek 40) i `"Invalid login"` (řádek 41-45) ✅
- `resendSent` se nastaví na `true` po odeslání ✅ — button zmizí, ukáže se potvrzovací zpráva ✅
- Error handling: správný, 3 větve (`Email not confirmed`, `Invalid login`, fallback) ✅

### register-form.tsx:
- Resend button: **NENÍ** — ale register form nemusí mít resend, user dostane e-mail hned po registraci a zobrazí se success state s instrukcemi ✅
- Error handling: `already registered`, `Password` (min 6 znaků), fallback ✅
- Po úspěšné registraci se zobrazí informační blok se Zpět na přihlášení ✅

**Verdikt: ✅ PASS**

---

## 5. Admin Users

### Mazání uživatele:
- `user-actions.tsx:186-199` — tlačítko Smazat s `confirm()` dialogem ✅
- `users.ts:88-113` — `deleteUser()`: removes from project_members, deletes profile, deletes auth.users ✅
- Guard: nelze smazat vlastní účet (`users.ts:90-92`) ✅
- Tlačítko Smazat se nezobrazuje pro admin uživatele (`user-actions.tsx:182`) ✅

### Přiřazení projektu:
- `user-actions.tsx:35-47` — `handleAssign()` → `assignToProject()` ✅
- `users.ts:52-60` — insert do `project_members` ✅

### Změna role:
- `user-actions.tsx:49-59` — `handleRoleChange()` → `changeProjectRole()` ✅
- `users.ts:73-86` — update `project_members.role` ✅

### Zpět tlačítko nahoře:
- `admin/users/page.tsx:53-61` — Link "Zpět" je nahoře PŘED `<h1>` ✅

**Verdikt: ✅ PASS**

---

## 6. Kontakty — link na detail

**Soubor:** `src/app/(app)/[projectSlug]/kontakty/contacts-view.tsx`

- `contacts-view.tsx:70-73` — `ContactCardItem` renderuje `<Link href={\`/${projectSlug}/kontakty/${contact.id}\`}>` ✅
- Link vede na kontakt detail, ne na frontu ✅

**Verdikt: ✅ PASS**

---

## 7. Zpět tlačítka — přehled

| Stránka | Soubor | Umístění | Stav |
|---------|--------|----------|------|
| Admin users | `admin/users/page.tsx:53` | Nad `<h1>` | ✅ |
| Settings | `settings/page.tsx:34` | Nad `<h1>` | ✅ |
| Export hodin | `export-hodin/page.tsx:40` | Nad `<h1>` | ✅ |
| Import | `import/page.tsx:61` | Nad `<h1>` | ✅ |
| Kontakty detail | `kontakty/[leadId]/page.tsx:71` | Nad `<h1>` | ✅ |

**Verdikt: ✅ PASS**

---

## 8. Build

```
npm run build → ✅ PASS
```

Žádné TypeScript chyby, žádné lint errory. Všechny stránky zkompilované.

**Verdikt: ✅ PASS**

---

## Souhrn

| Oblast | Výsledek |
|--------|----------|
| Onboarding wizard | ✅ PASS |
| Kalendář profile_id | ✅ PASS |
| Bottom nav role | ✅ PASS |
| Login/Register | ✅ PASS |
| Admin users | ✅ PASS |
| Kontakty link | ✅ PASS |
| Zpět tlačítka | ✅ PASS |
| Build | ✅ PASS |

**Celkový verdikt: ✅ VŠE SCHVÁLENO — žádné chyby**

### Drobná poznámka (není chyba):
- `onboarding-wizard.tsx:353-358` — progress bar podmínka `i < step ? "bg-accent" : i === step ? "bg-accent" : "bg-line"` je funkčně správná, ale redundantní — lze zjednodušit na `i <= step ? "bg-accent" : "bg-line"`. Není to bug, pouze styl kódu.
