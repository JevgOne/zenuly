# Krok 9: Konzultace a kalendáře — obecná CalendarProvider API

> Planner, 2026-10-09 (v3 — generic multi-provider)

## Zdroje

- `docs/postup-prompty.md` Krok 9: "Napoj Google Kalendář admina: volné sloty pro výsledek Konzultace, vytvoření události s pozvánkou klientovi, připomínka 1 h předem. Lead se předá adminovi."
- `docs/specifikace-weblyx.md`: outcome `meeting` → `calendar_event: true`, `assign_to_admin: true`, `required_inputs: ["time_slot"]`
- Existující kód: `record_call_outcome` (migrace 004) vrací `{ calendar_event: true, meeting_time: ... }` ale nikdo to zatím nezpracovává.

## Klíčový princip

**Každý uživatel si individuálně napojí svůj kalendář.** Architektura je obecná — CalendarProvider abstrakce, kam se dá přidat jakýkoliv kalendář (Outlook, Apple, Cal.com, ...) bez změny zbytku kódu. Začínáme s Google Calendar a Notion Calendar jako prvními dvěma providery.

V nastavení profilu si uživatel:
1. Vybere typ kalendáře (Google / Notion / ...)
2. Projde propojením (OAuth flow nebo zadá API token)
3. CRM automaticky zapisuje schůzky do jeho kalendáře

Při výsledku "Konzultace" se schůzka zapíše do kalendáře toho, komu se lead předává (admin/manager).

## Hotovo, když

> Domluvená konzultace sama naskočí v kalendáři (ať už Google nebo Notion).

---

## Architektura — obecná CalendarProvider API

### Princip

Jeden interface `CalendarProvider` s libovolným počtem implementací. Celý zbytek CRM (Server Actions, UI, outcome flow) volá jen abstraktní metody — nezná žádné konkrétní API. Přidání nového provideru = 1 soubor + 1 enum hodnota + registrace ve factory.

```
┌──────────────────────────────────────┐
│          CalendarProvider            │
│  ───────────────────────────────     │
│  getBusySlots(range)                 │
│  createEvent(event)                  │
│  deleteEvent(eventId)                │
│  testConnection()                    │
│  static providerName: string         │
│  static setupInstructions: string    │
└──┬──────────┬──────────┬─────────────┘
   │          │          │   ... budoucí
┌──▼────┐ ┌───▼─────┐ ┌──▼──────┐
│Google │ │ Notion  │ │Outlook │ (příklad)
│Calendar│ │Calendar │ │Calendar │
│Provider│ │Provider │ │Provider │
└────────┘ └─────────┘ └─────────┘
```

### Jak přidat nový provider (např. Outlook)

1. Vytvořit `src/lib/calendar/outlook-provider.ts` implementující `CalendarProvider`
2. Přidat `'outlook'` do `calendar_provider_type` enum (ALTER TYPE ... ADD VALUE)
3. Přidat case do `src/lib/calendar/factory.ts`
4. Přidat formulář pro propojení do UI nastavení (jaké credentials potřebuje)
5. Hotovo — žádná změna v outcome flow, calls.ts, slot-picker, ani jinde

### Google Calendar Provider

- **OAuth2 consent flow** — admin propojí Google účet, refresh token se uloží
- **FreeBusy API** pro volné sloty
- **Events API** pro vytvoření události s pozvánkou + připomínkou
- Přímé `fetch` volání (žádný npm googleapis)

### Notion Calendar Provider

**Důležité zjištění:** Notion Calendar nemá vlastní REST API pro vytváření událostí. Je to klient pro Google Calendar. Ale **Notion Database API** umožňuje vytvořit stránku s date property v "Meetings" databázi, která se pak zobrazí v Notion Calendar view.

Přístup:
- Admin vytvoří/vybere Notion databázi "Schůzky" (nebo ji CRM založí automaticky)
- CRM přes **Notion API** (POST /v1/pages) vytvoří stránku s date property
- Tato stránka se zobrazí v Notion Calendar view
- **FreeBusy:** Notion API nepodporuje freebusy — CRM načte existující stránky s datem v rozsahu a odvodí obsazené časy

Autentizace:
- **Notion Internal Integration** — admin vytvoří integraci v Notion, dostane API token
- Token se uloží do DB (jednodušší než OAuth2 — Notion integration tokeny neexpirují)

---

## Část 1: Datový model

### 1.1 Migrace `011_calendar_integration.sql`

```sql
-- =============================================
-- Tabulka: calendar_connections
-- Jeden záznam = jeden uživatel má propojený kalendář
-- Provider je TEXT (ne enum) — snazší přidávání nových providerů
-- Provider-specific credentials jsou v JSONB
-- =============================================
CREATE TABLE calendar_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('google', 'notion')),
                  -- CHECK constraint místo enum — ALTER TABLE stačí pro nový provider,
                  -- žádná migrace s ALTER TYPE

  -- Provider-specific credentials (JSONB — generic pro jakýkoliv provider)
  -- Google: { access_token, refresh_token, expires_at, calendar_id }
  -- Notion: { token, database_id }
  -- Outlook: { access_token, refresh_token, ... }  (budoucí)
  credentials     jsonb NOT NULL DEFAULT '{}',

  -- Common
  is_active       boolean NOT NULL DEFAULT true,
  last_synced_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Jeden uživatel = jeden aktivní kalendář
  UNIQUE (profile_id)
);

CREATE TRIGGER set_updated_at BEFORE UPDATE ON calendar_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: jen vlastník vidí svůj záznam (CRUD)
ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_own ON calendar_connections FOR ALL
  USING (profile_id = auth.uid());

-- Admin může číst všechny (pro debug + čtení tokenu při vytváření události)
CREATE POLICY cc_admin_read ON calendar_connections FOR SELECT
  USING (auth_user_role() = 'admin');

-- =============================================
-- Rozšíření tasks tabulky
-- =============================================
ALTER TABLE tasks ADD COLUMN calendar_event_id text;
ALTER TABLE tasks ADD COLUMN calendar_provider text;
```

**Proč JSONB credentials místo provider-specific sloupců:**
- Přidání nového provideru = žádná migrace pro nové sloupce
- Každý provider definuje vlastní schema credentials v TypeScriptu
- `credentials` je šifrovaný na úrovni Supabase (vault) — citlivá data
- CRM nikdy nepřistupuje k credentials přímo — vždy přes factory + provider class

**Proč TEXT s CHECK místo ENUM:**
- `ALTER TABLE calendar_connections DROP CONSTRAINT ...; ADD CONSTRAINT ... CHECK (provider IN ('google', 'notion', 'outlook'))` — jednodušší než `ALTER TYPE ... ADD VALUE` (které nejde v transakci)
- Přidání provideru = 1 řádek v migraci

---

## Část 2: CalendarProvider interface

### 2.1 `src/lib/calendar/types.ts`

```typescript
export type CalendarSlot = {
  start: string;   // ISO 8601
  end: string;     // ISO 8601
};

export type CalendarEvent = {
  summary: string;
  description: string;
  start: string;
  end: string;
  attendeeEmail?: string;
  reminderMinutes?: number;
};

export type CalendarEventResult = {
  eventId: string;
  provider: string;
  link?: string;       // URL na událost (Google link / Notion page URL)
};

/**
 * Generic calendar provider interface.
 * Each provider (Google, Notion, Outlook, ...) implements this.
 * The rest of the CRM never touches provider-specific APIs.
 */
export interface CalendarProvider {
  /** Human-readable name for UI (e.g., "Google Calendar") */
  readonly displayName: string;

  /** Test connection — throws if invalid */
  testConnection(): Promise<void>;

  /** Get busy slots in a time range */
  getBusySlots(timeMin: string, timeMax: string): Promise<CalendarSlot[]>;

  /** Create a calendar event, return event ID */
  createEvent(event: CalendarEvent): Promise<CalendarEventResult>;

  /** Delete a calendar event by ID */
  deleteEvent(eventId: string): Promise<void>;
}

/**
 * Provider registry entry — defines what a provider needs for setup.
 * Used by the settings UI to render the correct form.
 */
export type ProviderMeta = {
  key: string;               // 'google' | 'notion' | ...
  displayName: string;       // "Google Calendar"
  authType: 'oauth' | 'token';   // OAuth flow vs. manual token input
  setupInstructions: string;  // Markdown instructions for user
  credentialFields?: {        // For 'token' auth type — what fields to show
    key: string;
    label: string;
    placeholder: string;
    type: 'text' | 'password';
  }[];
};
```

### 2.2 `src/lib/calendar/factory.ts`

```typescript
import type { CalendarProvider, ProviderMeta } from './types';
import { GoogleCalendarProvider, GOOGLE_META } from './google-provider';
import { NotionCalendarProvider, NOTION_META } from './notion-provider';

/**
 * Registry of all available calendar providers.
 * To add a new provider:
 * 1. Create provider file (e.g., outlook-provider.ts)
 * 2. Import and register here
 * 3. Update CHECK constraint in DB migration
 */
const PROVIDER_REGISTRY: Record<string, {
  meta: ProviderMeta;
  create: (credentials: Record<string, unknown>) => CalendarProvider;
}> = {
  google: {
    meta: GOOGLE_META,
    create: (creds) => new GoogleCalendarProvider(creds as any),
  },
  notion: {
    meta: NOTION_META,
    create: (creds) => new NotionCalendarProvider(creds as any),
  },
  // Přidání nového provideru: prostě přidat sem
  // outlook: { meta: OUTLOOK_META, create: (creds) => new OutlookCalendarProvider(creds as any) },
};

/** Create a provider instance from a DB connection record */
export function createCalendarProvider(
  provider: string,
  credentials: Record<string, unknown>
): CalendarProvider {
  const entry = PROVIDER_REGISTRY[provider];
  if (!entry) throw new Error(`Unknown calendar provider: ${provider}`);
  return entry.create(credentials);
}

/** Get list of all available providers (for settings UI) */
export function getAvailableProviders(): ProviderMeta[] {
  return Object.values(PROVIDER_REGISTRY).map(e => e.meta);
}
```

---

## Část 3: Google Calendar Provider

### 3.1 `src/lib/calendar/google-provider.ts`

Přímé REST volání přes `fetch` (žádný npm `googleapis`):

```typescript
import type { ProviderMeta } from './types';

export const GOOGLE_META: ProviderMeta = {
  key: 'google',
  displayName: 'Google Calendar',
  authType: 'oauth',
  setupInstructions: 'Klikněte na "Propojit" a přihlaste se ke svému Google účtu. CRM získá přístup k vašemu kalendáři pro čtení obsazenosti a vytváření schůzek.',
};

export class GoogleCalendarProvider implements CalendarProvider {
  readonly displayName = 'Google Calendar';
  private accessToken: string;
  private refreshToken: string;
  private expiresAt: string;
  private calendarId: string;

  constructor(config: { access_token: string; refresh_token: string; expires_at: string; calendar_id?: string }) {
    this.accessToken = config.access_token;
    this.refreshToken = config.refresh_token;
    this.expiresAt = config.expires_at;
    this.calendarId = config.calendar_id ?? 'primary';
  }

  private async ensureValidToken(): Promise<string> {
    if (new Date(this.expiresAt) > new Date()) return this.accessToken;
    // POST https://oauth2.googleapis.com/token
    // grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
    // Update DB with new access_token + expires_at
    ...
  }

  async testConnection(): Promise<void> {
    const token = await this.ensureValidToken();
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${this.calendarId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Google Calendar connection failed');
  }

  async getBusySlots(timeMin: string, timeMax: string): Promise<CalendarSlot[]> {
    const token = await this.ensureValidToken();
    // POST https://www.googleapis.com/calendar/v3/freeBusy
    // body: { timeMin, timeMax, items: [{ id: this.calendarId }] }
    // Return busy periods
    ...
  }

  async createEvent(event: CalendarEvent): Promise<CalendarEventResult> {
    const token = await this.ensureValidToken();
    // POST https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events
    // body: { summary, description, start: { dateTime }, end: { dateTime },
    //         attendees: [{ email }], reminders: { overrides: [{ method: 'popup', minutes }] },
    //         sendUpdates: 'all' }
    // Return { eventId, provider: 'google', link: htmlLink }
    ...
  }

  async deleteEvent(eventId: string): Promise<void> {
    const token = await this.ensureValidToken();
    // DELETE https://www.googleapis.com/calendar/v3/calendars/{calendarId}/events/{eventId}
    ...
  }
}
```

### 3.2 OAuth flow routes

`src/app/api/auth/google-calendar/route.ts` — generuje OAuth URL:
```
https://accounts.google.com/o/oauth2/v2/auth?
  client_id=...&redirect_uri=...&response_type=code&
  scope=https://www.googleapis.com/auth/calendar&
  access_type=offline&prompt=consent
```

`src/app/api/auth/google-calendar/callback/route.ts` — vymění code za tokeny, uloží do `calendar_connections`.

### 3.3 Environment variables

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_REDIRECT_URI=https://zenuly.cz/api/auth/google-calendar/callback
```

---

## Část 4: Notion Calendar Provider

### 4.1 Jak to funguje

Notion Calendar zobrazuje stránky z Notion databáze, které mají date property. CRM vytvoří stránku v databázi "Schůzky" → zobrazí se v Notion Calendar view.

**FreeBusy ekvivalent:** Query Notion databázi za existující stránky s datem v požadovaném rozsahu → odvodit obsazené časy.

### 4.2 `src/lib/calendar/notion-provider.ts`

```typescript
import type { ProviderMeta } from './types';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export const NOTION_META: ProviderMeta = {
  key: 'notion',
  displayName: 'Notion Calendar',
  authType: 'token',
  setupInstructions: '1. Otevřete notion.so/my-integrations a vytvořte novou integraci.\n2. Zkopírujte API token.\n3. V Notionu vytvořte databázi "Schůzky" s properties: Název (title), Datum (date).\n4. Sdílejte databázi s integrací (Share → Invite).\n5. Zkopírujte Database ID z URL databáze.',
  credentialFields: [
    { key: 'token', label: 'API Token', placeholder: 'ntn_...', type: 'password' },
    { key: 'database_id', label: 'Database ID', placeholder: 'abc123def456...', type: 'text' },
  ],
};

export class NotionCalendarProvider implements CalendarProvider {
  readonly displayName = 'Notion Calendar';
  private token: string;
  private databaseId: string;

  constructor(config: { token: string; database_id: string }) {
    this.token = config.token;
    this.databaseId = config.database_id;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    };
  }

  async testConnection(): Promise<void> {
    // GET https://api.notion.com/v1/databases/{databaseId}
    const res = await fetch(`${NOTION_API}/databases/${this.databaseId}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error('Notion connection failed — check token and database ID');
  }

  async getBusySlots(timeMin: string, timeMax: string): Promise<CalendarSlot[]> {
    // POST https://api.notion.com/v1/databases/{databaseId}/query
    // filter: { property: "Datum", date: { on_or_after: timeMin, on_or_before: timeMax } }
    // Map each page to { start, end } from date property
    const res = await fetch(`${NOTION_API}/databases/${this.databaseId}/query`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        filter: {
          property: 'Datum',
          date: {
            on_or_after: timeMin,
            before: timeMax,
          },
        },
      }),
    });
    const data = await res.json();
    return data.results.map((page: any) => ({
      start: page.properties.Datum.date.start,
      end: page.properties.Datum.date.end ?? addMinutes(page.properties.Datum.date.start, 20),
    }));
  }

  async createEvent(event: CalendarEvent): Promise<CalendarEventResult> {
    // POST https://api.notion.com/v1/pages
    // parent: { database_id: this.databaseId }
    // properties: {
    //   "Název": { title: [{ text: { content: summary } }] },
    //   "Datum": { date: { start, end } },
    //   "Popis": { rich_text: [{ text: { content: description } }] },
    //   "Kontakt": { rich_text: [{ text: { content: attendeeEmail } }] }
    // }
    const res = await fetch(`${NOTION_API}/pages`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        parent: { database_id: this.databaseId },
        properties: {
          'Název': { title: [{ text: { content: event.summary } }] },
          'Datum': { date: { start: event.start, end: event.end, time_zone: 'Europe/Prague' } },
        },
        children: [
          {
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ text: { content: event.description } }],
            },
          },
        ],
      }),
    });
    const data = await res.json();
    return {
      eventId: data.id,
      provider: 'notion',
      link: data.url,
    };
  }

  async deleteEvent(eventId: string): Promise<void> {
    // PATCH https://api.notion.com/v1/pages/{eventId}
    // body: { archived: true }
    await fetch(`${NOTION_API}/pages/${eventId}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ archived: true }),
    });
  }
}
```

### 4.3 Notion setup pro admina

Admin musí:
1. Vytvořit Notion Internal Integration na notion.so/my-integrations
2. Zkopírovat API token
3. Vytvořit (nebo vybrat) databázi "Schůzky" v Notion s properties:
   - `Název` (title)
   - `Datum` (date)
   - Volitelně: `Popis` (rich_text), `Kontakt` (rich_text/email)
4. Propojit integraci s databází (Share → Invite integration)
5. V CRM nastavení zadat token + database ID

**CRM by mělo mít instrukce/průvodce jak to udělat** — zobrazit při propojení.

---

## Část 5: Společná vrstva — Server Actions

### 5.1 `src/app/actions/calendar.ts`

```typescript
import { createCalendarProvider, getAvailableProviders } from '@/lib/calendar/factory';

/** Load calendar connection for a user and return a provider instance */
async function getProviderForUser(userId: string): Promise<CalendarProvider | null> {
  const supabase = await createServiceClient();
  const { data: conn } = await supabase
    .from('calendar_connections')
    .select('provider, credentials')
    .eq('profile_id', userId)
    .eq('is_active', true)
    .single();
  if (!conn) return null;
  return createCalendarProvider(conn.provider, conn.credentials as Record<string, unknown>);
}

/** Get available 20-min slots for a project's admin */
export async function getAvailableSlots(
  projectId: string,
  dateFrom: string,
  dateTo: string
): Promise<{ start: string; end: string }[]> {
  // 1. Find project admin
  const supabase = await createClient();
  const { data: adminId } = await supabase.rpc('find_project_admin', { p_project_id: projectId });
  if (!adminId) return [];

  // 2. Get provider
  const provider = await getProviderForUser(adminId);
  if (!provider) return []; // No calendar connected — return empty = all slots available

  // 3. Get busy slots
  const busy = await provider.getBusySlots(dateFrom, dateTo);

  // 4. Generate 20-min slots in working hours, filter out busy
  const slots = generateSlots(dateFrom, dateTo, projectWorkingHours, 20);
  return slots.filter(slot => !isOverlapping(slot, busy));
}

/** Create calendar event for a meeting */
export async function createCalendarEvent(params: {
  projectId: string;
  leadId: string;
  targetUserId: string;      // komu se lead předává (admin/manager)
  startTime: string;
  leadCompany: string;
  leadPhone: string;
  leadEmail: string | null;
  leadContactPerson: string | null;
}): Promise<{ eventId: string; provider: string } | null> {
  const provider = await getProviderForUser(params.targetUserId);
  if (!provider) return null; // No calendar = skip silently

  const result = await provider.createEvent({
    summary: `Konzultace: ${params.leadCompany}`,
    description: [
      params.leadContactPerson ? `Kontakt: ${params.leadContactPerson}` : null,
      `Telefon: ${params.leadPhone}`,
      params.leadEmail ? `E-mail: ${params.leadEmail}` : null,
      `Lead v CRM: https://zenuly.cz/weblyx/leads/${params.leadId}`,
    ].filter(Boolean).join('\n'),
    start: params.startTime,
    end: addMinutes(params.startTime, 20),
    attendeeEmail: params.leadEmail ?? undefined,
    reminderMinutes: 60,
  });

  return { eventId: result.eventId, provider: result.provider };
}
```

### 5.2 Integrace do outcome flow

V `src/app/actions/calls.ts` — po úspěšném `recordOutcome`:

```typescript
const result = await recordOutcome(params);
if (result.calendar_event && result.meeting_time) {
  // Lead se předává adminovi — najdi admin ID
  const adminId = await findProjectAdmin(projectId);
  if (adminId) {
    const calResult = await createCalendarEvent({
      projectId,
      leadId: params.leadId,
      targetUserId: adminId,
      startTime: result.meeting_time as string,
      leadCompany: leadData.company,
      leadPhone: leadData.phone,
      leadEmail: params.email ?? leadData.email ?? null,
      leadContactPerson: leadData.contact_person ?? null,
    });
    // calResult může být null pokud kalendář není propojený — to je OK
  }
}
```

---

## Část 6: UI — Nastavení kalendáře

### 6.1 Route `src/app/settings/calendar/page.tsx`

(Nebo sekce v existujícím `/settings`). Přístupné pro admin i manager.

UI je **dynamická** — generovaná z `getAvailableProviders()`:

```
Propojení kalendáře
─────────────────────────────────────
[aktuální stav: Propojeno / Nepropojeno]

Vyberte kalendář:
  ○ Google Calendar
  ○ Notion Calendar
  ○ ... (budoucí providery se zobrazí automaticky)

[pokud authType === 'oauth']
  → Tlačítko "Propojit {displayName}" (→ OAuth flow)
  → Po propojení: "Propojeno ✓" [Odpojit]

[pokud authType === 'token']
  → Instrukce z ProviderMeta.setupInstructions (rendered Markdown)
  → Dynamická pole z ProviderMeta.credentialFields:
    {label}: [{placeholder}___] (type: text|password)
  → [Otestovat spojení] → [Uložit]
  → Po uložení: "Propojeno ✓" [Odpojit]
```

**Klíčové:** UI neví nic o konkrétních providerech. Pole formuláře se generují z `credentialFields` v ProviderMeta. Přidání nového provideru = nový provider soubor → automaticky se objeví v nastavení.

### 6.2 Server Actions pro nastavení

```typescript
/** Save credentials for any provider (token-based auth) */
export async function connectCalendar(
  provider: string,
  credentials: Record<string, string>
): Promise<{ ok: boolean; error?: string }>

/** Save credentials from OAuth callback (provider-specific route calls this) */
export async function connectCalendarOAuth(
  provider: string,
  credentials: Record<string, unknown>
): Promise<void>

/** Disconnect current calendar */
export async function disconnectCalendar(): Promise<void>

/** Test current connection */
export async function testCalendarConnection(): Promise<{ ok: boolean; error?: string }>

/** Get available providers for UI */
export async function listProviders(): Promise<ProviderMeta[]>
```

---

## Část 7: Slot Picker komponenta

### 7.1 `src/app/(app)/[projectSlug]/_components/slot-picker.tsx`

Zobrazí se v outcome-panel.tsx pro výsledek `meeting`. **Provider-agnostická** — volá `getAvailableSlots()` Server Action, která interně vybere správný provider.

Stavy:
1. **Kalendář propojený:** Zobrazí grid dostupných 20min slotů po dnech
2. **Kalendář nepropojený:** Fallback na `<input type="datetime-local">` s poznámkou "Kalendář není propojený — zadejte čas ručně."
3. **Loading:** Skeleton
4. **Chyba:** "Nepodařilo se načíst volné sloty. Zadejte čas ručně." + datetime-local fallback

Layout:
- Záložky dnů (dnes, zítra, pozítří, …) + "další dny"
- Grid 20min slotů (9:00, 9:20, 9:40, ..., 17:40)
- Vybraný slot = accent background
- Obsazené sloty = skryté nebo disabled

### 7.2 Úprava outcome-panel.tsx

Nahradit stávající datetime-local za SlotPicker:
```tsx
{selected === "meeting" && (
  <SlotPicker
    projectId={projectId}
    onSelect={(isoTime) => setTimeSlot(isoTime)}
    selected={timeSlot}
  />
)}
```

---

## Část 8: Error handling

- **Žádný kalendář propojený:** SlotPicker nabídne ruční datetime-local. Zápis outcome proběhne bez kalendářní události.
- **Token expired (Google):** Automatický refresh. Pokud refresh selže → zobrazit "Kalendář odpojen, propojte znovu v nastavení."
- **Notion API error:** Zobrazit warning, ale outcome uložit.
- **NIKDY neblokovat uložení výsledku hovoru kvůli selhání kalendáře.**
- **Notion rate limit (3 req/s):** Implementovat jednoduchý retry s exponential backoff v notion-provider.

---

## Pořadí implementace

1. `src/lib/calendar/types.ts` — CalendarProvider interface + typy
2. `src/lib/calendar/google-provider.ts` — Google implementace (REST fetch)
3. `src/lib/calendar/notion-provider.ts` — Notion implementace (REST fetch)
4. `src/lib/calendar/factory.ts` — createCalendarProvider factory
5. Migrace `011_calendar_integration.sql` — calendar_connections + tasks rozšíření
6. `src/app/api/auth/google-calendar/route.ts` + callback — OAuth flow
7. `src/app/actions/calendar.ts` — getAvailableSlots, createCalendarEvent, connectNotionCalendar, testConnection
8. `src/app/settings/calendar/page.tsx` — nastavení kalendáře UI (Google + Notion)
9. `src/app/(app)/[projectSlug]/_components/slot-picker.tsx` — výběr slotů
10. Úprava outcome-panel.tsx — SlotPicker místo datetime-local
11. Úprava calls.ts — po recordOutcome volat createCalendarEvent
12. `npx supabase db push`, `npm run lint`, `npm run build`

---

## Environment variables

```env
# Google Calendar OAuth2
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_REDIRECT_URI=https://zenuly.cz/api/auth/google-calendar/callback

# Notion nepotřebuje env — token zadává uživatel v nastavení
```

## Závislosti

- Google Cloud Console: OAuth2 credentials (Web application)
- Notion: admin si vytvoří Internal Integration + databázi
- Environment variables v `.env.local` a na Vercel

## Poznámky pro implementátora

1. **Provider-agnostický kód VŠUDE.** Server Actions, UI, outcome flow — volají jen `CalendarProvider` interface. Nikdy `if provider === 'google'` mimo factory a provider soubory. UI generuje formuláře z `ProviderMeta.credentialFields`.
2. **Nový provider = 1 soubor + registrace.** Vytvořit `xxx-provider.ts`, exportovat META + class, importovat ve `factory.ts`, přidat do `PROVIDER_REGISTRY`. UPDATE CHECK constraint v DB. Žádná změna nikde jinde.
3. **JSONB credentials.** Každý provider definuje vlastní schema credentials v TypeScriptu. DB ukládá do `credentials jsonb` — žádné provider-specific sloupce.
4. **Nikdy neukládat tokeny do klientského kódu.** Vše přes Server Actions. `calendar_connections.credentials` se čte jen na serveru.
5. **Google refresh token:** Google posílá refresh_token jen při prvním consent. OAuth URL musí mít `access_type=offline&prompt=consent`.
6. **Notion token neexpiruje.** Internal integration tokeny jsou permanentní. Ale uživatel může integraci smazat — proto `testConnection()`.
7. **Notion property names:** Provider předpokládá property `Název` (title) a `Datum` (date). Lepší: autodetekce — najít title a date property podle typu, ne podle jména.
8. **Kalendář je volitelný.** CRM musí fungovat perfektně i bez propojení. Outcome "Konzultace" se vždy uloží. Kalendář je bonus.
9. **20 minut konzultace:** Hardcoded. V budoucnu konfigurovatelné v `projects` settings.
10. **Timezone:** Sloty v `Europe/Prague` (z `projects.working_hours.timezone`).
11. **Nepoužívat npm `googleapis` ani `@notionhq/client`.** Přímé fetch volání stačí. Každý provider soubor je self-contained.
12. **Notion "pozvánka klientovi":** Notion API nepodporuje attendees/pozvánky jako Google. Pro Notion schůzky — email klientovi musí odejít zvlášť (přes Resend z Kroku 10). Google to řeší nativně přes `sendUpdates: 'all'`.
13. **Jeden uživatel = jeden kalendář.** UNIQUE constraint na profile_id. Pokud chce přepnout provider, musí nejdřív odpojit starý.
14. **Service client pro čtení cizího kalendáře.** Operátor nemá přístup k calendar_connections admina přes RLS. Server Action musí použít `createServiceClient()`.
15. **OAuth providery:** Každý OAuth provider (Google, budoucí Outlook) potřebuje vlastní API route pro callback (`/api/auth/{provider}-calendar/callback`). Route zavolá `connectCalendarOAuth(provider, tokens)`.
