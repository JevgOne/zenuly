export function RecommendationsPanel() {
  return (
    <div className="flex-[1_1_360px] min-w-0 p-[22px] bg-text text-surface rounded-2xl flex flex-col gap-[14px]">
      <h2 className="text-lg font-semibold text-surface">
        Doporučení na zítra
      </h2>
      <p className="text-[15px] leading-relaxed text-surface/70">
        Tato sekce bude dostupná po pilotním provozu. AI doporučení se
        budou generovat automaticky na základě denních dat.
      </p>
    </div>
  );
}
