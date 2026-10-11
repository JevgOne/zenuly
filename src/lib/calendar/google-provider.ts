import type {
  CalendarProvider,
  CalendarSlot,
  CalendarEvent,
  CalendarEventResult,
  ProviderMeta,
} from "./types";

export const GOOGLE_META: ProviderMeta = {
  key: "google",
  displayName: "Google Calendar",
  authType: "oauth",
  setupInstructions:
    'Klikněte na "Propojit" a přihlaste se ke svému Google účtu. CRM získá přístup k vašemu kalendáři pro čtení obsazenosti a vytváření schůzek.',
};

type GoogleCredentials = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  calendar_id?: string;
};

type OnTokenRefresh = (newCreds: {
  access_token: string;
  expires_at: string;
}) => Promise<void>;

export class GoogleCalendarProvider implements CalendarProvider {
  readonly displayName = "Google Calendar";
  private accessToken: string;
  private refreshToken: string;
  private expiresAt: string;
  private calendarId: string;
  private onTokenRefresh?: OnTokenRefresh;

  constructor(config: GoogleCredentials, onTokenRefresh?: OnTokenRefresh) {
    this.accessToken = config.access_token;
    this.refreshToken = config.refresh_token;
    this.expiresAt = config.expires_at;
    this.calendarId = config.calendar_id ?? "primary";
    this.onTokenRefresh = onTokenRefresh;
  }

  private async ensureValidToken(): Promise<string> {
    if (new Date(this.expiresAt).getTime() - 60_000 > Date.now()) {
      return this.accessToken;
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("Google OAuth credentials not configured");
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google token refresh failed: ${err}`);
    }

    const data = await res.json();
    this.accessToken = data.access_token;
    this.expiresAt = new Date(
      Date.now() + data.expires_in * 1000
    ).toISOString();

    if (this.onTokenRefresh) {
      await this.onTokenRefresh({
        access_token: this.accessToken,
        expires_at: this.expiresAt,
      });
    }

    return this.accessToken;
  }

  async testConnection(): Promise<void> {
    const token = await this.ensureValidToken();
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      throw new Error("Google Calendar connection failed");
    }
  }

  async getBusySlots(
    timeMin: string,
    timeMax: string
  ): Promise<CalendarSlot[]> {
    const token = await this.ensureValidToken();
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/freeBusy",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          timeMin,
          timeMax,
          items: [{ id: this.calendarId }],
        }),
      }
    );

    if (!res.ok) {
      throw new Error("Failed to fetch busy slots from Google Calendar");
    }

    const data = await res.json();
    const cal = data.calendars?.[this.calendarId];
    if (!cal?.busy) return [];

    return cal.busy.map((b: { start: string; end: string }) => ({
      start: b.start,
      end: b.end,
    }));
  }

  async createEvent(event: CalendarEvent): Promise<CalendarEventResult> {
    const token = await this.ensureValidToken();

    const body: Record<string, unknown> = {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.start, timeZone: "Europe/Prague" },
      end: { dateTime: event.end, timeZone: "Europe/Prague" },
      sendUpdates: "all",
    };

    if (event.attendeeEmail) {
      body.attendees = [{ email: event.attendeeEmail }];
    }

    if (event.reminderMinutes) {
      body.reminders = {
        useDefault: false,
        overrides: [{ method: "popup", minutes: event.reminderMinutes }],
      };
    }

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create Google Calendar event: ${err}`);
    }

    const data = await res.json();
    return {
      eventId: data.id,
      provider: "google",
      link: data.htmlLink,
    };
  }

  async deleteEvent(eventId: string): Promise<void> {
    const token = await this.ensureValidToken();
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok && res.status !== 404) {
      throw new Error("Failed to delete Google Calendar event");
    }
  }
}
