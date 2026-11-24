import { after } from "next/server";

/**
 * Runs background work so it is not lost when the response ends. Inside a request it uses Next's `after`, which
 * keeps the serverless function alive until the work finishes (a bare un-awaited promise can be frozen mid-way,
 * leaving a webhook delivery Pending with no attempt). Outside a request (a script or a test) `after` throws, and
 * the work just runs in the background. Never throws.
 */
export function runAfterResponse(work: () => Promise<unknown>): void {
  const safe = async () => {
    try {
      await work();
    } catch {
      // Delivery failures are recorded on the delivery row; this only keeps a throw from escaping.
    }
  };
  try {
    after(safe);
  } catch {
    void safe();
  }
}
