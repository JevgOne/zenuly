export type CalendarSlot = {
  start: string; // ISO 8601
  end: string; // ISO 8601
};

export type CalendarEvent = {
  summary: string;
  description: string;
  start: string; // ISO 8601
  end: string; // ISO 8601
  attendeeEmail?: string;
  reminderMinutes?: number;
};

export type CalendarEventResult = {
  eventId: string;
  provider: string;
  link?: string;
};

/**
 * Generic calendar provider interface.
 * Each provider (Google, Notion, Outlook, ...) implements this.
 * The rest of the CRM never touches provider-specific APIs.
 */
export interface CalendarProvider {
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
  key: string;
  displayName: string;
  authType: "oauth" | "token";
  setupInstructions: string;
  credentialFields?: {
    key: string;
    label: string;
    placeholder: string;
    type: "text" | "password";
  }[];
};
