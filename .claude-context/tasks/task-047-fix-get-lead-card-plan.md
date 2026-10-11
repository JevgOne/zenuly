# Task 047: Fix get_lead_card custom_fields + outcome-panel Czech pluralization

## Bug 1: get_lead_card — custom_fields WHERE uses owner_id instead of project_id

### Problem
In `supabase/migrations/007_queue_shifts_rpcs.sql`, lines 180-184, the `get_lead_card()` function queries `custom_fields` with a broken condition:

```sql
FROM custom_fields cf
WHERE cf.project_id = (v_lead->>'owner_id')::uuid
  OR cf.project_id = (
    SELECT l2.project_id FROM leads l2 WHERE l2.id = p_lead_id
  );
```

The first condition `cf.project_id = (v_lead->>'owner_id')::uuid` compares `project_id` (UUID of the project) with `owner_id` (UUID of the operator). This is logically wrong — these are different entity types. The OR fallback on lines 182-184 saves it by also checking the actual `project_id`, so results are correct but the first condition is nonsensical noise.

### Fix
Create migration `supabase/migrations/010_fix_get_lead_card.sql` with `CREATE OR REPLACE FUNCTION get_lead_card(p_lead_id uuid)`. The entire function body stays the same EXCEPT lines 180-184 become:

```sql
FROM custom_fields cf
WHERE cf.project_id = (
  SELECT l2.project_id FROM leads l2 WHERE l2.id = p_lead_id
);
```

This removes the broken `owner_id` comparison and the unnecessary OR fallback, keeping only the correct single condition.

---

## Bug 2: outcome-panel.tsx — no_answer remaining attempts text

### Problem
In `src/app/(app)/[projectSlug]/_components/outcome-panel.tsx`, line 125:

```tsx
`Další pokus zítra v jinou denní dobu. Zbývají ${maxAttempts - attemptCount - 1} pokusy.`
```

Two issues:
1. **Negative numbers**: If `attemptCount >= maxAttempts - 1`, the result is 0 or negative (e.g., "Zbývají -2 pokusy").
2. **Bad Czech grammar**: "pokusy" is wrong for all values except 2-4. Czech pluralization rules:
   - 1 → "pokus"
   - 2-4 → "pokusy"
   - 0, 5+ → "pokusů"

### Fix
In `src/app/(app)/[projectSlug]/_components/outcome-panel.tsx`:

1. Add a Czech pluralization helper (inline, no separate file):

```tsx
function czPlural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}
```

2. Replace line 125 with:

```tsx
? (() => {
    const remaining = Math.max(0, maxAttempts - attemptCount - 1);
    return remaining > 0
      ? `Další pokus zítra v jinou denní dobu. Zbývá ${remaining} ${czPlural(remaining, "pokus", "pokusy", "pokusů")}.`
      : `Další pokus zítra v jinou denní dobu. Toto je poslední pokus.`;
  })()
```

This fixes both: negative values are clamped, and Czech grammar is correct.

---

## Implementation steps for implementor

### Step 1: Create migration 010
Create file `supabase/migrations/010_fix_get_lead_card.sql`:
- Copy the entire `get_lead_card` function from 007 (lines 108-191)
- Use `CREATE OR REPLACE FUNCTION`
- Fix the WHERE clause as described above
- Add a comment header explaining the fix

### Step 2: Fix outcome-panel.tsx
- Add `czPlural` helper function before the `OutcomePanel` component (after line 85, before line 93)
- Replace the `no_answer` effect text computation on line 125

### Step 3: Push migration
```bash
npx supabase db push
```

### Step 4: Verify
```bash
npm run lint
npm run build
```

---

## Files to modify
1. **NEW**: `supabase/migrations/010_fix_get_lead_card.sql`
2. **EDIT**: `src/app/(app)/[projectSlug]/_components/outcome-panel.tsx` (add czPlural helper + fix line 125)
