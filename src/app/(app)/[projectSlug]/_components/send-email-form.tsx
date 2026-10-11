"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendTemplateEmail } from "@/app/actions/emails";
import { renderTemplate } from "@/lib/template-renderer";

export function SendEmailForm({
  taskId,
  projectId,
  leadId,
  templateKey,
  templateSubject,
  templateBody,
  templateVariables,
  leadEmail,
  knownVariables,
}: {
  taskId: string;
  projectId: string;
  leadId: string;
  templateKey: string;
  templateSubject: string;
  templateBody: string;
  templateVariables: string[];
  leadEmail: string;
  knownVariables: Record<string, string>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(leadEmail);
  const [variables, setVariables] = useState<Record<string, string>>(
    knownVariables
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const allFilled =
    email.includes("@") &&
    templateVariables.every((v) => variables[v]?.trim());

  const previewSubject = renderTemplate(templateSubject, variables);
  const previewBody = renderTemplate(templateBody, variables);

  async function handleSend() {
    if (!allFilled) return;
    setSending(true);
    setError("");

    const result = await sendTemplateEmail({
      taskId,
      projectId,
      leadId,
      templateKey,
      toEmail: email,
      variables,
    });

    setSending(false);

    if (result.success) {
      router.refresh();
    } else {
      setError(result.error ?? "Odeslání selhalo.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 w-full h-11 bg-accent text-white rounded-lg font-medium text-[14px] hover:bg-accent/90 transition-colors"
      >
        Otevřít a odeslat
      </button>
    );
  }

  // Separate known (pre-filled) from missing variables
  const missingVars = templateVariables.filter(
    (v) => !knownVariables[v]?.trim()
  );

  return (
    <div className="mt-3 space-y-4 border-t border-line pt-4">
      {/* Email field */}
      <div>
        <label className="text-[13px] font-medium text-muted block mb-1">
          E-mail příjemce
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="firma@email.cz"
          className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
        />
      </div>

      {/* Variable fields (only show missing ones) */}
      {missingVars.length > 0 && (
        <div className="space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block">
            Doplňte údaje
          </span>
          {missingVars.map((varKey) => (
            <div key={varKey}>
              <label className="text-[13px] font-medium text-muted block mb-1">
                {varKey}
              </label>
              <input
                type="text"
                value={variables[varKey] ?? ""}
                onChange={(e) =>
                  setVariables({ ...variables, [varKey]: e.target.value })
                }
                placeholder={`{{${varKey}}}`}
                className="w-full border border-input-border rounded-lg px-3 h-11 text-[15px] bg-surface text-text outline-none focus:border-accent transition-colors"
              />
            </div>
          ))}
        </div>
      )}

      {/* Preview */}
      <div>
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block mb-2">
          Náhled
        </span>
        <div className="bg-bg rounded-lg p-4 border border-line">
          <p className="text-[14px] font-medium text-text mb-2">
            {previewSubject}
          </p>
          <div
            className="text-[13px] text-text prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: previewBody }}
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <p className="text-urgent text-[13px] font-medium">{error}</p>
      )}

      {/* Submit */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleSend}
          disabled={!allFilled || sending}
          className="flex-1 h-11 bg-accent text-white rounded-lg font-medium text-[14px] hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {sending ? "Odesílám..." : "Odeslat e-mail"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-4 h-11 text-[14px] text-muted border border-line rounded-lg hover:bg-bg transition-colors"
        >
          Zrušit
        </button>
      </div>
    </div>
  );
}
