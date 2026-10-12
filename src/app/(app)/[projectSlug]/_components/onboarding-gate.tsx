"use client";

import { useState } from "react";
import { OnboardingWizard } from "./onboarding-wizard";

export function OnboardingGate({
  onboardingCompleted,
  role,
  projectSlug,
}: {
  onboardingCompleted: boolean;
  role: "admin" | "manager" | "operator";
  projectSlug: string;
}) {
  const [show, setShow] = useState(!onboardingCompleted);

  if (!show) return null;

  return (
    <OnboardingWizard
      role={role}
      projectSlug={projectSlug}
      onComplete={() => setShow(false)}
    />
  );
}
