import { afterEach, describe, expect, it, vi } from "vitest";

describe("metaPixel", () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    if (ORIGINAL_ENV === undefined) {
      delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
    } else {
      process.env.NEXT_PUBLIC_META_PIXEL_ID = ORIGINAL_ENV;
    }
  });

  describe("getMetaPixelId", () => {
    it("returns the configured pixel ID", async () => {
      process.env.NEXT_PUBLIC_META_PIXEL_ID = "1842736093385081";
      const { getMetaPixelId } = await import("../metaPixel");
      expect(getMetaPixelId()).toBe("1842736093385081");
    });

    it("returns undefined when the env var is unset", async () => {
      delete process.env.NEXT_PUBLIC_META_PIXEL_ID;
      const { getMetaPixelId } = await import("../metaPixel");
      expect(getMetaPixelId()).toBeUndefined();
    });

    it("returns undefined when the env var is an empty string", async () => {
      process.env.NEXT_PUBLIC_META_PIXEL_ID = "";
      const { getMetaPixelId } = await import("../metaPixel");
      expect(getMetaPixelId()).toBeUndefined();
    });
  });

  describe("server-side rendering safety", () => {
    // vitest's "node" test environment has no `window` global by default,
    // which is exactly the condition these functions must survive during SSR.
    it("isMetaPixelEnabled does not throw and returns false without window", async () => {
      const { isMetaPixelEnabled } = await import("../metaPixel");
      expect(() => isMetaPixelEnabled()).not.toThrow();
      expect(isMetaPixelEnabled()).toBe(false);
    });

    it("pageView does not throw without window", async () => {
      const { pageView } = await import("../metaPixel");
      expect(() => pageView()).not.toThrow();
    });

    it("trackEvent does not throw without window", async () => {
      const { trackEvent } = await import("../metaPixel");
      expect(() => trackEvent("Lead", { content_name: "test" })).not.toThrow();
    });

    it("trackCustomEvent does not throw without window", async () => {
      const { trackCustomEvent } = await import("../metaPixel");
      expect(() => trackCustomEvent("SomeCustomEvent")).not.toThrow();
    });
  });

  describe("browser behavior with a mocked fbq", () => {
    function stubFbq() {
      const fbq = vi.fn();
      vi.stubGlobal("window", { fbq });
      return fbq;
    }

    it("isMetaPixelEnabled returns true once fbq is present", async () => {
      stubFbq();
      const { isMetaPixelEnabled } = await import("../metaPixel");
      expect(isMetaPixelEnabled()).toBe(true);
    });

    it("pageView calls fbq('track', 'PageView') with no params", async () => {
      const fbq = stubFbq();
      const { pageView } = await import("../metaPixel");
      pageView();
      expect(fbq).toHaveBeenCalledTimes(1);
      expect(fbq).toHaveBeenCalledWith("track", "PageView");
    });

    it("trackEvent calls fbq('track', ...) — not trackCustom — for standard events", async () => {
      const fbq = stubFbq();
      const { trackEvent } = await import("../metaPixel");
      trackEvent("Lead", { content_name: "First Look Registration" });
      expect(fbq).toHaveBeenCalledWith(
        "track",
        "Lead",
        { content_name: "First Look Registration" },
        undefined
      );
    });

    it("trackEvent passes eventID through when provided, for CAPI dedup", async () => {
      const fbq = stubFbq();
      const { trackEvent } = await import("../metaPixel");
      trackEvent("Lead", { content_name: "x" }, "abc-123");
      expect(fbq).toHaveBeenCalledWith("track", "Lead", { content_name: "x" }, { eventID: "abc-123" });
    });

    it("trackCustomEvent calls fbq('trackCustom', ...)", async () => {
      const fbq = stubFbq();
      const { trackCustomEvent } = await import("../metaPixel");
      trackCustomEvent("BuildUpdatesOptIn", { content_name: "First Look Build Updates" });
      expect(fbq).toHaveBeenCalledWith(
        "trackCustom",
        "BuildUpdatesOptIn",
        { content_name: "First Look Build Updates" },
        undefined
      );
    });

    it("does not call fbq when window.fbq is not a function", async () => {
      vi.stubGlobal("window", { fbq: "not-a-function" });
      const { pageView, trackEvent, trackCustomEvent } = await import("../metaPixel");
      expect(() => pageView()).not.toThrow();
      expect(() => trackEvent("Lead")).not.toThrow();
      expect(() => trackCustomEvent("X")).not.toThrow();
    });

    it("trackMetaEvent (deprecated alias) still dispatches as a custom event", async () => {
      const fbq = stubFbq();
      const { trackMetaEvent } = await import("../metaPixel");
      trackMetaEvent("MailingAddressSectionDisplayed");
      expect(fbq).toHaveBeenCalledWith("trackCustom", "MailingAddressSectionDisplayed", undefined, undefined);
    });
  });

  describe("PII sanitization", () => {
    function stubFbq() {
      const fbq = vi.fn();
      vi.stubGlobal("window", { fbq });
      return fbq;
    }

    const sensitiveKeys = [
      "email",
      "Email",
      "phone",
      "phoneNumber",
      "firstName",
      "lastName",
      "fullName",
      "message",
      "address",
      "ssn",
      "socialSecurityNumber",
      "dob",
      "dateOfBirth",
      "password",
      "secret",
      "token",
      "cardNumber",
      "accountNumber",
      "routingNumber",
      "donorName",
      "paymentMethod",
    ];

    it.each(sensitiveKeys)("strips a param whose key is %s before calling fbq", async (key) => {
      const fbq = stubFbq();
      const { trackEvent } = await import("../metaPixel");
      trackEvent("Lead", { [key]: "should-not-leak", content_name: "safe" });
      const paramsArg = fbq.mock.calls[0][2] as Record<string, unknown>;
      expect(paramsArg).not.toHaveProperty(key);
      expect(paramsArg.content_name).toBe("safe");
    });

    it("keeps safe metadata keys untouched", async () => {
      const fbq = stubFbq();
      const { trackEvent } = await import("../metaPixel");
      const safeParams = {
        content_name: "First Look Registration",
        content_category: "lead-form",
        campaign_id: "spring-2026",
      };
      trackEvent("Lead", safeParams);
      expect(fbq).toHaveBeenCalledWith("track", "Lead", safeParams, undefined);
    });

    it("handles an undefined params object without throwing", async () => {
      const fbq = stubFbq();
      const { trackEvent } = await import("../metaPixel");
      expect(() => trackEvent("Lead")).not.toThrow();
      expect(fbq).toHaveBeenCalledWith("track", "Lead", undefined, undefined);
    });
  });
});
