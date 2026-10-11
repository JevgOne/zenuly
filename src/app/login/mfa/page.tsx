import { MfaForm } from "../mfa-form";

export const instant = false;

export default async function MfaPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="min-h-screen flex items-center justify-center bg-bg p-4">
      <div className="bg-surface border border-line rounded-lg p-8 max-w-sm w-full">
        <h1 className="text-[24px] font-semibold text-text mb-6">
          Dvoufaktorové ověření
        </h1>
        <MfaForm next={next ?? "/"} />
      </div>
    </main>
  );
}
