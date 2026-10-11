"use client";

import { useState, useEffect, useRef } from "react";
import {
  getActiveShift,
  startShift,
  pauseShift,
  resumeShift,
  endShift,
  type ShiftInfo,
} from "@/app/actions/shifts";

function formatDuration(startedAt: string, totalPauseS: number): string {
  const elapsed = Math.floor(
    (Date.now() - new Date(startedAt).getTime()) / 1000
  );
  const active = Math.max(0, elapsed - totalPauseS);
  const h = Math.floor(active / 3600);
  const m = Math.floor((active % 3600) / 60);
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function ShiftBar({
  projectId,
  callsPerHour,
}: {
  projectId: string;
  callsPerHour: number;
}) {
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const loadRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await getActiveShift(projectId);
        if (!cancelled) {
          setShift(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };
    loadRef.current = load;
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  const reload = () => loadRef.current?.();

  // Live time update + polling shift data every 60s
  useEffect(() => {
    if (!shift?.active) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      loadRef.current?.(); // Refresh calls_this_hour
    }, 60_000);
    return () => clearInterval(interval);
  }, [shift?.active]);

  const handleStart = async () => {
    setLoading(true);
    await startShift(projectId);
    await reload();
  };

  const handlePause = async () => {
    if (!shift?.shift_id) return;
    await pauseShift(shift.shift_id);
    await reload();
  };

  const handleResume = async () => {
    if (!shift?.shift_id) return;
    await resumeShift(shift.shift_id);
    await reload();
  };

  const handleEnd = async () => {
    if (!shift?.shift_id) return;
    await endShift(shift.shift_id);
    await reload();
  };

  if (loading) {
    return <div className="h-16 bg-surface" />;
  }

  // No active shift
  if (!shift?.active) {
    return (
      <div className="p-4">
        <button
          type="button"
          onClick={handleStart}
          className="w-full h-12 bg-accent text-white rounded-lg font-semibold text-[15px] hover:bg-accent/90 transition-colors"
        >
          Začít směnu
        </button>
      </div>
    );
  }

  const isPaused = shift.status === "paused";
  const callsThisHour = shift.calls_this_hour ?? 0;
  const progressPct = Math.min(100, (callsThisHour / callsPerHour) * 100);
  const underTarget = callsThisHour < callsPerHour;

  return (
    <div className="px-4 py-3 border-b border-line bg-surface">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[13px] font-medium text-text">
          {isPaused
            ? "Smena pozastavena"
            : `Smena ${formatDuration(shift.started_at!, shift.total_pause_s ?? 0)}`}
        </span>
        <div className="flex items-center gap-2">
          {isPaused ? (
            <button
              type="button"
              onClick={handleResume}
              className="px-3 h-8 rounded-lg text-[13px] font-medium bg-accent text-white hover:bg-accent/90 transition-colors"
            >
              Pokracovat
            </button>
          ) : (
            <button
              type="button"
              onClick={handlePause}
              className="px-3 h-8 rounded-lg text-[13px] font-medium border border-line text-text hover:bg-bg transition-colors"
            >
              Pauza
            </button>
          )}
          <button
            type="button"
            onClick={handleEnd}
            className="px-3 h-8 rounded-lg text-[13px] font-medium text-urgent hover:bg-urgent-soft transition-colors"
          >
            Ukoncit
          </button>
        </div>
      </div>
      {/* Progress */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-bg rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              underTarget ? "bg-urgent" : "bg-accent"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span
          className={`text-[12px] font-mono whitespace-nowrap ${
            underTarget ? "text-urgent" : "text-muted"
          }`}
        >
          {callsThisHour} / {callsPerHour}
          {underTarget && " pod cilem"}
        </span>
      </div>
    </div>
  );
}
