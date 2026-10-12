"use client";

import { useState } from "react";
import { OnboardingWizard } from "./onboarding-wizard";

export function OnboardingGate({
  onboardingCompleted,
}: {
  onboardingCompleted: boolean;
}) {
  const [show, setShow] = useState(!onboardingCompleted);

  if (!show) return null;

  return <OnboardingWizard onComplete={() => setShow(false)} />;
}
