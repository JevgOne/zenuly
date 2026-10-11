"use client";

import { createContext, useContext } from "react";

export type ProjectContextValue = {
  projectId: string;
  projectSlug: string;
  projectName: string;
  userRole: "admin" | "manager" | "operator";
};

const ProjectCtx = createContext<ProjectContextValue | null>(null);

export function useProject() {
  const ctx = useContext(ProjectCtx);
  if (!ctx) throw new Error("useProject must be used within ProjectProvider");
  return ctx;
}

export const ProjectProvider = ProjectCtx.Provider;
