"use client";

import { useState, useEffect, useRef } from "react";
import { getQueue, type QueueItem } from "@/app/actions/queue";

const SECTION_LABELS: Record<string, string> = {
  overdue: "Propadl\u00E9",
  new: "Nov\u00E9",
  today: "Dnes",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });
}

export function QueueList({
  projectId,
  selectedLeadId,
  onSelectLead,
}: {
  projectId: string;
  selectedLeadId: string | null;
  onSelectLead: (leadId: string) => void;
}) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getQueue(projectId);
        if (!cancelled) {
          setItems(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    if (!mountedRef.current) {
      mountedRef.current = true;
      load();
    }

    const interval = setInterval(load, 30_000);

    // Expose reload for parent
    (window as unknown as Record<string, unknown>).__reloadQueue = load;

    return () => {
      cancelled = true;
      clearInterval(interval);
      delete (window as unknown as Record<string, unknown>).__reloadQueue;
    };
  }, [projectId]);

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-6 text-center">
        <p className="text-[15px] font-medium text-text mb-1">
          Všechno máš hotové.
        </p>
        <p className="text-[13px] text-muted">
          Nové leady se objeví samy, nebo dej Pauza.
        </p>
      </div>
    );
  }

  // Group by section
  const sections: Record<string, QueueItem[]> = {};
  for (const item of items) {
    const s = item.queue_section;
    if (!sections[s]) sections[s] = [];
    sections[s].push(item);
  }

  const sectionOrder = ["overdue", "new", "today"];

  return (
    <div className="divide-y divide-line">
      {sectionOrder.map((section) => {
        const sectionItems = sections[section];
        if (!sectionItems?.length) return null;
        return (
          <div key={section}>
            <div
              className={`px-4 py-2 text-[11px] font-bold uppercase tracking-[0.06em] ${
                section === "overdue"
                  ? "bg-urgent-soft text-urgent"
                  : "bg-bg text-muted"
              }`}
            >
              {SECTION_LABELS[section]} ({sectionItems.length})
            </div>
            {sectionItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectLead(item.id)}
                className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors min-h-[44px] ${
                  selectedLeadId === item.id
                    ? "bg-accent-soft border-l-2 border-accent"
                    : "hover:bg-bg border-l-2 border-transparent"
                }`}
              >
                {/* Priority dot */}
                <span
                  className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                    item.priority === 3
                      ? "bg-accent"
                      : item.priority === 1
                        ? "border border-line"
                        : "bg-muted/30"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-text truncate">
                    {item.company_name}
                  </p>
                  <p className="text-[13px] text-muted truncate mt-0.5">
                    {item.hook_text
                      ? item.hook_text.slice(0, 40) +
                        (item.hook_text.length > 40 ? "…" : "")
                      : item.stage_key === "new"
                        ? "Nový lead"
                        : "Callback"}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  {item.is_overdue ? (
                    <span className="text-[12px] font-mono text-urgent font-medium">
                      −{item.overdue_minutes} min
                    </span>
                  ) : item.next_action_at ? (
                    <span className="text-[12px] font-mono text-muted">
                      {formatTime(item.next_action_at)}
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
