import type { CalendarProvider, ProviderMeta } from "./types";
import { GoogleCalendarProvider, GOOGLE_META } from "./google-provider";
import { NotionCalendarProvider, NOTION_META } from "./notion-provider";

/**
 * Registry of all available calendar providers.
 * To add a new provider:
 * 1. Create provider file (e.g., outlook-provider.ts)
 * 2. Import and register here
 * 3. Update CHECK constraint in DB migration
 */
const PROVIDER_REGISTRY: Record<
  string,
  {
    meta: ProviderMeta;
    create: (
      credentials: Record<string, unknown>,
      onTokenRefresh?: (creds: {
        access_token: string;
        expires_at: string;
      }) => Promise<void>
    ) => CalendarProvider;
  }
> = {
  google: {
    meta: GOOGLE_META,
    create: (creds, onTokenRefresh) =>
      new GoogleCalendarProvider(
        creds as {
          access_token: string;
          refresh_token: string;
          expires_at: string;
          calendar_id?: string;
        },
        onTokenRefresh
      ),
  },
  notion: {
    meta: NOTION_META,
    create: (creds) =>
      new NotionCalendarProvider(
        creds as { token: string; database_id: string }
      ),
  },
};

/** Create a provider instance from a DB connection record */
export function createCalendarProvider(
  provider: string,
  credentials: Record<string, unknown>,
  onTokenRefresh?: (creds: {
    access_token: string;
    expires_at: string;
  }) => Promise<void>
): CalendarProvider {
  const entry = PROVIDER_REGISTRY[provider];
  if (!entry) throw new Error(`Unknown calendar provider: ${provider}`);
  return entry.create(credentials, onTokenRefresh);
}

/** Get list of all available providers (for settings UI) */
export function getAvailableProviders(): ProviderMeta[] {
  return Object.values(PROVIDER_REGISTRY).map((e) => e.meta);
}
