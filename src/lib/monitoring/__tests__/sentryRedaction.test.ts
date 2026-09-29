import { describe, it, expect } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubSentryEvent } from "../sentryRedaction";

function baseEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { ...overrides } as ErrorEvent;
}

describe("scrubSentryEvent", () => {
  it("strips the Authorization and Cookie request headers", () => {
    const event = baseEvent({
      request: {
        headers: { Authorization: "Bearer secret", Cookie: "session=abc", "User-Agent": "test" },
      },
    });
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.request?.headers).not.toHaveProperty("Authorization");
    expect(scrubbed.request?.headers).not.toHaveProperty("Cookie");
    expect(scrubbed.request?.headers).toHaveProperty("User-Agent", "test");
  });

  it("strips request cookies and body data entirely", () => {
    const event = baseEvent({
      request: { cookies: { session: "abc" }, data: { cardNumber: "4111111111111111" } },
    });
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
  });

  it("redacts card-shaped numbers inside extra data", () => {
    const event = baseEvent({ extra: { note: "card 4111111111111111 failed" } });
    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.extra?.note).toContain("[REDACTED_CARD]");
    expect(scrubbed.extra?.note).not.toContain("4111111111111111");
  });

  it("redacts custom contexts but leaves Sentry's own structural contexts untouched", () => {
    const event = baseEvent({
      contexts: {
        wgc: { accountNumber: "1234567890123" },
        trace: { trace_id: "abc123", span_id: "def456" },
        runtime: { name: "node", version: "20.0.0" },
      },
    });
    const scrubbed = scrubSentryEvent(event);
    expect(JSON.stringify(scrubbed.contexts?.wgc)).not.toContain("1234567890123");
    expect(scrubbed.contexts?.trace).toEqual({ trace_id: "abc123", span_id: "def456" });
    expect(scrubbed.contexts?.runtime).toEqual({ name: "node", version: "20.0.0" });
  });

  it("does not throw on an event with no request/extra/contexts", () => {
    expect(() => scrubSentryEvent(baseEvent())).not.toThrow();
  });
});
