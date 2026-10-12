"use client";

import { useState, useCallback } from "react";

export function PageHelpButton({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className="fixed bottom-20 lg:bottom-4 right-4 z-40 w-9 h-9 rounded-full border border-line bg-surface flex items-center justify-center text-muted hover:text-text hover:border-accent transition-colors shadow-sm"
        aria-label="Nápověda"
      >
        <span className="text-[15px] font-bold">?</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50">
          <div className="bg-surface border border-line rounded-xl shadow-lg max-w-lg w-full mx-4 my-8 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-line">
              <h2 className="text-base font-semibold text-text">Nápověda</h2>
              <button
                type="button"
                onClick={toggle}
                className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-bg transition-colors min-h-[44px] min-w-[44px]"
                aria-label="Zavřít"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M4.5 4.5l9 9M13.5 4.5l-9 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <p className="text-[14px] leading-relaxed text-text">{text}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
