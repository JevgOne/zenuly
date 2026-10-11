import { Suspense } from "react";
import { RegisterForm } from "./register-form";

export default function RegisterPage() {
  return (
    <main className="min-h-screen flex flex-col bg-bg">
      {/* Header */}
      <header className="h-14 px-6 flex items-center justify-between shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo/logo.svg"
          alt="Zenuly"
          className="h-[26px] w-auto"
        />
        <span className="hidden sm:block text-sm text-muted">
          CRM
        </span>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-[420px] lg:bg-surface lg:border lg:border-line lg:rounded-lg lg:p-10">
          <h1 className="text-[24px] font-semibold text-text mb-1">
            Registrace
          </h1>
          <p className="text-[15px] text-muted mb-6">
            Vytvořte si nový účet.
          </p>
          <Suspense fallback={<div className="h-48" />}>
            <RegisterForm />
          </Suspense>
        </div>
      </div>

      {/* Footer */}
      <footer className="h-10 px-6 flex items-center justify-center gap-3 shrink-0">
        <span className="font-mono text-[13px] text-muted">zenuly.cz</span>
        <span className="text-muted">·</span>
        <span className="font-mono text-[13px] text-muted">v0.1.0</span>
      </footer>
    </main>
  );
}
