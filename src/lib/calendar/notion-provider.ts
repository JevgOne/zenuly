import type {
  CalendarProvider,
  CalendarSlot,
  CalendarEvent,
  CalendarEventResult,
  ProviderMeta,
} from "./types";

const NOTION_API = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export const NOTION_META: ProviderMeta = {
  key: "notion",
  displayName: "Notion Calendar",
  authType: "token",
  setupInstructions:
    "1. Otev\u0159ete notion.so/my-integrations a vytvo\u0159te novou integraci.\n2. Zkop\u00edrujte API token.\n3. V Notionu vytvo\u0159te datab\u00e1zi s properties: N\u00e1zev (title), Datum (date).\n4. Sd\u00edlejte datab\u00e1zi s integrac\u00ed (Share \u2192 Invite).\n5. Zkop\u00edrujte Database ID z URL datab\u00e1ze.",
  credentialFields: [
    {
      key: "token",
      label: "API Token",
      placeholder: "ntn_...",
      type: "password",
    },
    {
      key: "database_id",
      label: "Database ID",
      placeholder: "abc123def456...",
      type: "text",
    },
  ],
};

type NotionCredentials = {
  token: string;
  database_id: string;
};

function addMinutes(isoDate: string, minutes: number): string {
  return new Date(
    new Date(isoDate).getTime() + minutes * 60 * 1000
  ).toISOString();
}

export class NotionCalendarProvider implements CalendarProvider {
  readonly displayName = "Notion Calendar";
  private token: string;
  private databaseId: string;

  constructor(config: NotionCredentials) {
    this.token = config.token;
    this.databaseId = config.database_id;
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    };
  }

  async testConnection(): Promise<void> {
    const res = await fetch(
      `${NOTION_API}/databases/${this.databaseId}`,
      { headers: this.headers() }
    );
    if (!res.ok) {
      throw new Error(
        "Notion connection failed \u2014 check token and database ID"
      );
    }
  }

  async getBusySlots(
    timeMin: string,
    timeMax: string
  ): Promise<CalendarSlot[]> {
    const res = await fetch(
      `${NOTION_API}/databases/${this.databaseId}/query`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          filter: {
            property: "Datum",
            date: {
              on_or_after: timeMin,
              before: timeMax,
            },
          },
        }),
      }
    );

    if (!res.ok) {
      throw new Error("Failed to query Notion database for busy slots");
    }

    const data = await res.json();

    return (data.results ?? [])
      .filter(
        (page: Record<string, unknown>) =>
          (page.properties as Record<string, Record<string, unknown>>)?.Datum
            ?.date
      )
      .map((page: Record<string, unknown>) => {
        const dateProp = (
          page.properties as Record<string, Record<string, unknown>>
        ).Datum.date as { start: string; end?: string };
        return {
          start: dateProp.start,
          end: dateProp.end ?? addMinutes(dateProp.start, 20),
        };
      });
  }

  async createEvent(event: CalendarEvent): Promise<CalendarEventResult> {
    const res = await fetch(`${NOTION_API}/pages`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        parent: { database_id: this.databaseId },
        properties: {
          "N\u00e1zev": {
            title: [{ text: { content: event.summary } }],
          },
          Datum: {
            date: {
              start: event.start,
              end: event.end,
              time_zone: "Europe/Prague",
            },
          },
        },
        children: [
          {
            object: "block",
            type: "paragraph",
            paragraph: {
              rich_text: [{ text: { content: event.description } }],
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to create Notion page: ${err}`);
    }

    const data = await res.json();
    return {
      eventId: data.id,
      provider: "notion",
      link: data.url,
    };
  }

  async deleteEvent(eventId: string): Promise<void> {
    const res = await fetch(`${NOTION_API}/pages/${eventId}`, {
      method: "PATCH",
      headers: this.headers(),
      body: JSON.stringify({ archived: true }),
    });
    if (!res.ok && res.status !== 404) {
      throw new Error("Failed to archive Notion page");
    }
  }
}
