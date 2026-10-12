"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ProviderMeta } from "@/lib/calendar/types";
import {
  connectCalendar,
  disconnectCalendar,
  testCalendarConnection,
} from "@/app/actions/calendar";

export function CalendarSection({
  providers,
  currentConnection,
}: {
  providers: ProviderMeta[];
  currentConnection: { provider: string; isActive: boolean } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const calendarConnected = searchParams.get("calendar_connected");
  const calendarError = searchParams.get("calendar_error");

  const initialMessage = (() => {
    if (calendarConnected) {
      return {
        type: "success" as const,
        text: `${calendarConnected === "google" ? "Google Calendar" : "Kalendář"} propojen.`,
      };
    }
    if (calendarError) {
      const errors: Record<string, string> = {
        denied: "Přístup k Google Calendar byl odmítnut.",
        missing_code: "Chybí autorizační kód.",
        not_configured: "Google Calendar není nakonfigurován na serveru.",
        token_exchange_failed: "Výměna tokenu selhala.",
        save_failed: "Uložení propojení se nepovedlo.",
      };
      return {
        type: "error" as const,
        text: errors[calendarError] ?? "Propojení selhalo.",
      };
    }
    return null;
  })();

  const [selectedProvider, setSelectedProvider] = useState<string>(
    currentConnection?.provider ?? ""
  );
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<
    "idle" | "testing" | "saving" | "disconnecting"
  >("idle");
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(initialMessage);
  const [connected, setConnected] = useState(
    (currentConnection?.isActive ?? false) || !!calendarConnected
  );
  const [connectedProvider, setConnectedProvider] = useState(
    currentConnection?.provider ?? calendarConnected ?? ""
  );

  const selectedMeta = providers.find((p) => p.key === selectedProvider);

  async function handleTest() {
    setStatus("testing");
    setMessage(null);
    const result = await testCalendarConnection();
    setStatus("idle");
    if (result.ok) {
      setMessage({ type: "success", text: "Spojení funguje." });
    } else {
      setMessage({
        type: "error",
        text: result.error ?? "Test selhal.",
      });
    }
  }

  async function handleConnect() {
    if (!selectedProvider || !selectedMeta) return;

    if (selectedMeta.authType === "oauth") {
      router.push(`/api/auth/${selectedProvider}-calendar`);
      return;
    }

    const fields = selectedMeta.credentialFields ?? [];
    for (const f of fields) {
      if (!credentials[f.key]?.trim()) {
        setMessage({
          type: "error",
          text: `Vyplňte pole "${f.label}".`,
        });
        return;
      }
    }

    setStatus("saving");
    setMessage(null);
    const result = await connectCalendar(selectedProvider, credentials);
    setStatus("idle");

    if (result.ok) {
      setConnected(true);
      setConnectedProvider(selectedProvider);
      setMessage({ type: "success", text: "Kalendář propojen." });
    } else {
      setMessage({
        type: "error",
        text: result.error ?? "Propojení selhalo.",
      });
    }
  }

  async function handleDisconnect() {
    setStatus("disconnecting");
    setMessage(null);
    await disconnectCalendar();
    setStatus("idle");
    setConnected(false);
    setConnectedProvider("");
    setCredentials({});
    setMessage({ type: "success", text: "Kalendář odpojen." });
  }

  return (
    <div className="bg-surface border border-line rounded-lg p-6">
      <h2 className="text-lg font-semibold text-text mb-2">
        Propojení kalendáře
      </h2>
      <p className="text-sm text-muted mb-4">
        Propojte svůj kalendář pro automatické vytváření konzultací.
      </p>

      {/* Current connection status */}
      {connected && (
        <div className="flex items-center justify-between bg-bg rounded-lg px-4 py-3 mb-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm text-text font-medium">
              {providers.find((p) => p.key === connectedProvider)
                ?.displayName ?? connectedProvider}
            </span>
            <span className="text-sm text-muted">propojeno</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={status !== "idle"}
              className="px-3 py-1.5 text-[13px] text-muted hover:text-text border border-line rounded-lg transition-colors disabled:opacity-50"
            >
              {status === "testing" ? "Testuji…" : "Otestovat"}
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={status !== "idle"}
              className="px-3 py-1.5 text-[13px] text-urgent hover:bg-urgent-soft border border-line rounded-lg transition-colors disabled:opacity-50"
            >
              {status === "disconnecting" ? "Odpojuji…" : "Odpojit"}
            </button>
          </div>
        </div>
      )}

      {/* Provider selection (when not connected) */}
      {!connected && (
        <>
          <div className="space-y-2 mb-4">
            {providers.map((p) => (
              <label
                key={p.key}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedProvider === p.key
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-bg hover:border-input-border"
                }`}
              >
                <input
                  type="radio"
                  name="calendar_provider"
                  value={p.key}
                  checked={selectedProvider === p.key}
                  onChange={() => {
                    setSelectedProvider(p.key);
                    setCredentials({});
                    setMessage(null);
                  }}
                  className="w-4 h-4 text-accent"
                />
                <span className="text-sm font-medium text-text">
                  {p.displayName}
                </span>
              </label>
            ))}
          </div>

          {/* OAuth provider */}
          {selectedMeta?.authType === "oauth" && (
            <button
              type="button"
              onClick={handleConnect}
              className="w-full h-11 bg-accent text-white rounded-lg font-medium text-[15px] hover:bg-accent/90 transition-colors"
            >
              Propojit {selectedMeta.displayName}
            </button>
          )}

          {/* Token provider — credential fields */}
          {selectedMeta?.authType === "token" && (
            <div className="space-y-4">
              {selectedMeta.setupInstructions && (
                <div className="text-[13px] text-muted bg-bg rounded-lg px-4 py-3 whitespace-pre-line">
                  {selectedMeta.setupInstructions}
                </div>
              )}

              {selectedMeta.credentialFields?.map((field) => (
                <div key={field.key}>
                  <label className="text-[13px] font-medium text-muted block mb-1">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={credentials[field.key] ?? ""}
                    onChange={(e) =>
                      setCredentials({
                        ...credentials,
                        [field.key]: e.target.value,
                      })
                    }
                    placeholder={field.placeholder}
                    className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={handleConnect}
                disabled={status !== "idle"}
                className="w-full h-11 bg-accent text-white rounded-lg font-medium text-[15px] hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {status === "saving"
                  ? "Ukládám…"
                  : `Propojit ${selectedMeta.displayName}`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Status message */}
      {message && (
        <p
          className={`mt-3 text-[13px] font-medium ${
            message.type === "success" ? "text-green-600" : "text-urgent"
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
