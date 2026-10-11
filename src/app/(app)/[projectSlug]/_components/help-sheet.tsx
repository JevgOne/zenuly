"use client";

import { useState, useCallback } from "react";

const OUTCOME_ROWS = [
  {
    said: "Souhlasil se schůzkou",
    action: "Konzultace",
    note: "Vyber jeden z nabízených termínů. Klient dostane pozvánku.",
  },
  {
    said: '„Pošlete mi cenu / nabídku"',
    action: "Nabídka",
    note: "Zkontroluj e-mail. Nabídka odejde sama.",
  },
  {
    said: '„Pošlete ukázky"',
    action: "Prezentace",
    note: "Zkontroluj e-mail. Prezentace odejde sama.",
  },
  {
    said: '„Pošlete mi rozbor"',
    action: "Rozbor",
    note: "Zkontroluj e-mail a souhlas klienta. Rozbor odejde automaticky.",
  },
  {
    said: '„Teď ne, zavolejte jindy"',
    action: "Jindy",
    note: "Zadej přesný čas, který klient řekl.",
  },
  {
    said: '„Ozvěte se za měsíc"',
    action: "Jindy",
    note: 'Ťukni „za měsíc" nebo vyber datum a napiš proč.',
  },
  {
    said: "Nikdo to nevzal",
    action: "Nevzal to",
    note: "Nic. Zkusíme to zítra jindy.",
  },
  {
    said: "Obsazeno",
    action: "Obsazeno",
    note: "Nic. Vrátí se ti za 30 minut.",
  },
  {
    said: '„Nemám zájem"',
    action: "Nemá zájem",
    note: 'Vyber důvod. Když řekl „nevolejte mi", zaškrtni Nevolat.',
  },
  {
    said: "Číslo nepatří firmě",
    action: "Špatné číslo",
    note: "Nic. Majitel to zkontroluje.",
  },
  {
    said: "Firma už nefunguje",
    action: "Firma nefunguje",
    note: "Lead se vyřadí. Nic dalšího neděláš.",
  },
];

const TIPS = [
  "Cíl hovoru je jediný: domluvit 20 minut s majitelem. Web po telefonu neprodáváš.",
  'Klient má námitku? Ťukni na ni v kartě a přečti odpověď. Po druhém jasném „ne" poděkuj a ukonči hovor.',
  'Ptá se na cenu? „Weby máme od 9 990 Kč jednorázově, přesnou cenu řekne majitel na konzultaci."',
  "Ptá se, kde máme číslo? Řekni pravdu: z webu jeho firmy.",
  'Nevíš, co zvolit? Zvol „Jindy" a do poznámky napiš, co klient řekl.',
];

const NEVER_RULES = [
  "Nevolej čísla, která ti CRM nenabídne.",
  "Nevymýšlej slevy, termíny ani reference.",
  "Neříkej, že web neděláme s pomocí AI. Děláme, a každý výstup kontroluje člověk.",
];

export function HelpSheet() {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => setOpen((v) => !v), []);

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        onClick={toggle}
        className="w-9 h-9 rounded-full border border-line bg-surface flex items-center justify-center text-muted hover:text-text hover:border-accent transition-colors"
        aria-label="Nápověda"
      >
        <span className="text-[15px] font-bold">?</span>
      </button>

      {/* Sheet overlay */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50">
          <div className="bg-surface border border-line rounded-xl shadow-lg max-w-2xl w-full mx-4 my-8 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-line">
              <h2 className="text-base font-semibold text-text">
                Nápověda pro operátorku
              </h2>
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

            {/* Outcomes table */}
            <div className="p-4">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block mb-3">
                Co zvolit po hovoru
              </span>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left font-semibold text-muted py-2 pr-3">
                        Klient řekl
                      </th>
                      <th className="text-left font-semibold text-muted py-2 pr-3">
                        Ťukni
                      </th>
                      <th className="text-left font-semibold text-muted py-2">
                        Co uděláš
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {OUTCOME_ROWS.map((row, i) => (
                      <tr key={i} className="border-b border-line/50">
                        <td className="py-2 pr-3 text-text">{row.said}</td>
                        <td className="py-2 pr-3 font-medium text-accent">
                          {row.action}
                        </td>
                        <td className="py-2 text-muted">{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tips */}
            <div className="p-4 pt-0">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted block mb-3">
                Během hovoru
              </span>
              <ul className="space-y-2">
                {TIPS.map((tip, i) => (
                  <li key={i} className="text-[13px] text-muted flex gap-2">
                    <span className="text-accent mt-0.5 shrink-0">&bull;</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Never rules */}
            <div className="p-4 pt-0">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-urgent block mb-3">
                Nikdy
              </span>
              <ul className="space-y-2">
                {NEVER_RULES.map((rule, i) => (
                  <li key={i} className="text-[13px] text-muted flex gap-2">
                    <span className="text-urgent mt-0.5 shrink-0">&times;</span>
                    <span>{rule}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
