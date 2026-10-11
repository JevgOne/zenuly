"use client";

import { useState, useEffect, useRef } from "react";
import { getAvailableSlots } from "@/app/actions/calendar";

type Slot = { start: string; end: string };

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Prague",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("cs-CZ", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    timeZone: "Europe/Prague",
  });
}

function groupSlotsByDay(
  slots: Slot[]
): { date: string; label: string; slots: Slot[] }[] {
  const grouped = new Map<string, Slot[]>();
  for (const slot of slots) {
    const dateKey = new Date(slot.start).toLocaleDateString("cs-CZ", {
      timeZone: "Europe/Prague",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    if (!grouped.has(dateKey)) grouped.set(dateKey, []);
    grouped.get(dateKey)!.push(slot);
  }

  return Array.from(grouped.entries()).map(([dateKey, daySlots]) => ({
    date: dateKey,
    label: formatDate(daySlots[0].start),
    slots: daySlots,
  }));
}

export function SlotPicker({
  projectId,
  onSelect,
  selected,
}: {
  projectId: string;
  onSelect: (isoTime: string) => void;
  selected: string;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [activeDay, setActiveDay] = useState(0);
  const [fallback, setFallback] = useState(false);
  const [daysToShow, setDaysToShow] = useState(5);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const fetchId = ++fetchIdRef.current;

    getAvailableSlots(
      projectId,
      new Date().toISOString(),
      new Date(Date.now() + daysToShow * 24 * 60 * 60 * 1000).toISOString()
    ).then(
      (result) => {
        if (fetchId !== fetchIdRef.current) return;
        setSlots(result);
        setLoading(false);
        if (result.length === 0 && daysToShow <= 5) {
          setFallback(true);
        }
      },
      () => {
        if (fetchId !== fetchIdRef.current) return;
        setError(true);
        setFallback(true);
        setLoading(false);
      }
    );
  }, [projectId, daysToShow]);

  // Fallback: manual datetime-local input
  if (fallback) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-muted">
          {error
            ? "Nepodařilo se načíst volné sloty. Zadejte čas ručně."
            : "Žádné volné sloty v nejbližších dnech. Zadejte čas ručně."}
        </p>
        <input
          type="datetime-local"
          value={selected ? selected.slice(0, 16) : ""}
          onChange={(e) => {
            if (e.target.value) {
              onSelect(new Date(e.target.value).toISOString());
            }
          }}
          className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-9 w-20 bg-bg rounded-lg animate-pulse"
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-10 bg-bg rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const days = groupSlotsByDay(slots);
  if (days.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[13px] text-muted">
          Žádné volné sloty. Zadejte čas ručně.
        </p>
        <input
          type="datetime-local"
          value={selected ? selected.slice(0, 16) : ""}
          onChange={(e) => {
            if (e.target.value) {
              onSelect(new Date(e.target.value).toISOString());
            }
          }}
          className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
        />
      </div>
    );
  }

  const currentDay = days[activeDay] ?? days[0];

  return (
    <div className="space-y-3">
      {/* Day tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day, idx) => (
          <button
            key={day.date}
            type="button"
            onClick={() => setActiveDay(idx)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors ${
              idx === activeDay
                ? "bg-accent text-white"
                : "bg-bg text-text hover:bg-line"
            }`}
          >
            {day.label}
          </button>
        ))}
        {daysToShow <= 5 && (
          <button
            type="button"
            onClick={() => setDaysToShow(14)}
            className="px-3 py-1.5 rounded-lg text-[13px] font-medium text-muted hover:bg-bg transition-colors whitespace-nowrap"
          >
            další dny
          </button>
        )}
      </div>

      {/* Slot grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {currentDay.slots.map((slot) => {
          const isSelected = selected === slot.start;
          return (
            <button
              key={slot.start}
              type="button"
              onClick={() => onSelect(slot.start)}
              className={`h-10 rounded-lg text-[14px] font-medium transition-colors ${
                isSelected
                  ? "bg-accent text-white"
                  : "bg-bg text-text hover:bg-line"
              }`}
            >
              {formatTime(slot.start)}
            </button>
          );
        })}
      </div>

      {/* Fallback link */}
      <button
        type="button"
        onClick={() => setFallback(true)}
        className="text-[13px] text-muted hover:text-text transition-colors"
      >
        Zadat čas ručně
      </button>
    </div>
  );
}
