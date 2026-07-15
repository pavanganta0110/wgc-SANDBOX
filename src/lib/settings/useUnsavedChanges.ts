"use client";

import { useEffect } from "react";

/** Warns on tab close/refresh when there are unsaved changes. Shared across every Settings form per the spec's "show unsaved-change warning before navigating away" requirement. */
export function useUnsavedChangesWarning(isDirty: boolean) {
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
}
