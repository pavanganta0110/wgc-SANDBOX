"use client";

import { useState } from "react";
import { captureError } from "@/lib/monitoring/captureError";

/**
 * Next.js App Router's special file for errors thrown in the ROOT layout
 * itself — the one place a normal src/app/error.tsx boundary can't catch,
 * since that boundary lives inside the layout it would need to replace.
 * Sentry's Next.js SDK requires this file to exist (calling
 * Sentry.captureException, done inside captureError() below) to catch
 * root-level render errors at all; it replaces the entire <html>/<body>, so
 * this can't rely on the normal layout/providers.
 *
 * Reports via a lazy useState initializer rather than a useEffect: this
 * component only ever mounts because a real error already happened (never
 * as part of a normal render path), so capturing once on that first render
 * is the correct one-shot side effect here — an effect would fire the
 * capture one render later for no benefit and trip the
 * react-hooks/set-state-in-effect lint rule for no reason.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [reference] = useState(() => captureError(error, { route: "global-error", action: "root_layout_render" }));

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f8fafc" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
          <div style={{ maxWidth: "420px", textAlign: "center", background: "#ffffff", borderRadius: "16px", padding: "32px", boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
            <h1 style={{ fontSize: "18px", fontWeight: 700, color: "#0f172a", marginBottom: "8px" }}>Something went wrong</h1>
            <p style={{ fontSize: "14px", color: "#64748b", marginBottom: "16px" }}>
              We hit an unexpected error. Please try again — if it keeps happening, contact WGC Support with the reference below.
            </p>
            {reference && (
              <p style={{ fontSize: "12px", color: "#94a3b8", marginBottom: "24px" }}>
                Reference: <span style={{ fontFamily: "monospace" }}>{reference}</span>
              </p>
            )}
            <button
              onClick={reset}
              style={{ padding: "10px 20px", borderRadius: "10px", background: "#0f172a", color: "#fff", border: "none", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
