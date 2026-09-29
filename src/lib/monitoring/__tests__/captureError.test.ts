import { describe, it, expect, vi, beforeEach } from "vitest";

const setTag = vi.fn();
const setUser = vi.fn();
const setContext = vi.fn();
const captureException = vi.fn();
const withScope = vi.fn((callback: (scope: unknown) => void) => {
  callback({ setTag, setUser, setContext });
});

vi.mock("@sentry/nextjs", () => ({
  withScope: (cb: (scope: unknown) => void) => withScope(cb),
  captureException: (...args: unknown[]) => captureException(...args),
}));

import { captureError, captureIntegrationError, capturePaymentError, captureJobError, captureWebhookError } from "../captureError";

beforeEach(() => {
  setTag.mockClear();
  setUser.mockClear();
  setContext.mockClear();
  captureException.mockClear();
  withScope.mockClear();
});

describe("captureError", () => {
  it("returns a WGC-XXXXXX reference", () => {
    const reference = captureError(new Error("boom"));
    expect(reference).toMatch(/^WGC-[0-9A-Z]{6}$/);
  });

  it("calls Sentry.captureException with the original error", () => {
    const error = new Error("boom");
    captureError(error);
    expect(captureException).toHaveBeenCalledWith(error);
  });

  it("tags requestId, route, integration, operation, service, action when provided", () => {
    captureError(new Error("boom"), {
      requestId: "req_abc",
      route: "/api/merchant/campaigns",
      integration: "finix",
      operation: "refund",
      service: "Finix",
      action: "process_refund",
    });
    expect(setTag).toHaveBeenCalledWith("requestId", "req_abc");
    expect(setTag).toHaveBeenCalledWith("route", "/api/merchant/campaigns");
    expect(setTag).toHaveBeenCalledWith("integration", "finix");
    expect(setTag).toHaveBeenCalledWith("operation", "refund");
    expect(setTag).toHaveBeenCalledWith("service", "Finix");
    expect(setTag).toHaveBeenCalledWith("action", "process_refund");
  });

  it("tags merchantId from either merchantId or organizationId and sets the user id", () => {
    captureError(new Error("boom"), { merchantId: "church_123", userId: "user_456" });
    expect(setTag).toHaveBeenCalledWith("merchantId", "church_123");
    expect(setUser).toHaveBeenCalledWith({ id: "user_456" });
  });

  it("falls back to organizationId when merchantId is not provided", () => {
    captureError(new Error("boom"), { organizationId: "church_789" });
    expect(setTag).toHaveBeenCalledWith("merchantId", "church_789");
  });

  it("redacts sensitive-looking values before attaching context", () => {
    captureError(new Error("boom"), { extra: { note: "card 4111111111111111 on file" } });
    const contextCall = setContext.mock.calls.find(([key]) => key === "wgc");
    expect(contextCall).toBeDefined();
    expect(JSON.stringify(contextCall?.[1])).not.toContain("4111111111111111");
  });

  it("never throws even if Sentry itself throws", () => {
    withScope.mockImplementationOnce(() => {
      throw new Error("Sentry is down");
    });
    expect(() => captureError(new Error("boom"))).not.toThrow();
  });

  it("still returns a reference even when Sentry capture fails", () => {
    withScope.mockImplementationOnce(() => {
      throw new Error("Sentry is down");
    });
    const reference = captureError(new Error("boom"));
    expect(reference).toMatch(/^WGC-[0-9A-Z]{6}$/);
  });
});

describe("integration-specific capture helpers", () => {
  it("captureIntegrationError tags the given integration and defaults service to it", () => {
    captureIntegrationError("aplos", new Error("sync failed"));
    expect(setTag).toHaveBeenCalledWith("integration", "aplos");
    expect(setTag).toHaveBeenCalledWith("service", "aplos");
  });

  it("capturePaymentError always tags integration as finix", () => {
    capturePaymentError(new Error("timeout"));
    expect(setTag).toHaveBeenCalledWith("integration", "finix");
    expect(setTag).toHaveBeenCalledWith("service", "Finix");
  });

  it("captureJobError tags operation as the job name and service as Background Jobs", () => {
    captureJobError("reconcile-settlements", new Error("cron failed"));
    expect(setTag).toHaveBeenCalledWith("operation", "reconcile-settlements");
    expect(setTag).toHaveBeenCalledWith("service", "Background Jobs");
  });

  it("captureWebhookError tags the provider as integration and service as Webhooks", () => {
    captureWebhookError("twilio", new Error("signature invalid"));
    expect(setTag).toHaveBeenCalledWith("integration", "twilio");
    expect(setTag).toHaveBeenCalledWith("service", "Webhooks");
  });
});
