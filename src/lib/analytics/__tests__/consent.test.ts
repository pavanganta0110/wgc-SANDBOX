import { afterEach, describe, expect, it, vi } from "vitest";

function makeLocalStorage(seed: Record<string, string> = {}) {
  const store = { ...seed };
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
}

describe("consent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  describe("server-side rendering safety", () => {
    // vitest's "node" test environment has no `window` global by default —
    // exactly the condition these functions must survive during SSR.
    it("getStoredConsent returns null without window, and does not throw", async () => {
      const { getStoredConsent } = await import("../consent");
      expect(() => getStoredConsent()).not.toThrow();
      expect(getStoredConsent()).toBeNull();
    });

    it("setStoredConsent does not throw without window", async () => {
      const { setStoredConsent } = await import("../consent");
      expect(() => setStoredConsent("granted")).not.toThrow();
    });
  });

  describe("getStoredConsent", () => {
    it("returns null when nothing has been decided yet", async () => {
      vi.stubGlobal("window", { localStorage: makeLocalStorage() });
      const { getStoredConsent } = await import("../consent");
      expect(getStoredConsent()).toBeNull();
    });

    it("returns the stored value when consent was previously granted", async () => {
      vi.stubGlobal("window", { localStorage: makeLocalStorage({ wgc_analytics_consent: "granted" }) });
      const { getStoredConsent } = await import("../consent");
      expect(getStoredConsent()).toBe("granted");
    });

    it("returns the stored value when consent was previously denied", async () => {
      vi.stubGlobal("window", { localStorage: makeLocalStorage({ wgc_analytics_consent: "denied" }) });
      const { getStoredConsent } = await import("../consent");
      expect(getStoredConsent()).toBe("denied");
    });

    it("treats a corrupted/unexpected stored value as not-decided rather than trusting it", async () => {
      vi.stubGlobal("window", { localStorage: makeLocalStorage({ wgc_analytics_consent: "yes please" }) });
      const { getStoredConsent } = await import("../consent");
      expect(getStoredConsent()).toBeNull();
    });

    it("returns null (not a throw) when localStorage access itself throws — e.g. a locked-down private-browsing context", async () => {
      vi.stubGlobal("window", {
        localStorage: {
          getItem: () => {
            throw new Error("SecurityError");
          },
        },
      });
      const { getStoredConsent } = await import("../consent");
      expect(() => getStoredConsent()).not.toThrow();
      expect(getStoredConsent()).toBeNull();
    });
  });

  describe("setStoredConsent", () => {
    it("persists the decision so a later getStoredConsent call sees it", async () => {
      const localStorage = makeLocalStorage();
      vi.stubGlobal("window", { localStorage, dispatchEvent: vi.fn() });
      const { setStoredConsent, getStoredConsent } = await import("../consent");

      setStoredConsent("granted");
      expect(getStoredConsent()).toBe("granted");
    });

    it("dispatches CONSENT_CHANGE_EVENT with the new state so MetaPixel.tsx can react without a reload", async () => {
      const dispatchEvent = vi.fn();
      vi.stubGlobal("window", { localStorage: makeLocalStorage(), dispatchEvent, CustomEvent });
      const { setStoredConsent, CONSENT_CHANGE_EVENT } = await import("../consent");

      setStoredConsent("denied");

      expect(dispatchEvent).toHaveBeenCalledTimes(1);
      const dispatched = dispatchEvent.mock.calls[0][0] as CustomEvent;
      expect(dispatched.type).toBe(CONSENT_CHANGE_EVENT);
      expect(dispatched.detail).toBe("denied");
    });

    it("still dispatches the change event even if the localStorage write itself throws", async () => {
      const dispatchEvent = vi.fn();
      vi.stubGlobal("window", {
        localStorage: {
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
        },
        dispatchEvent,
        CustomEvent,
      });
      const { setStoredConsent } = await import("../consent");

      expect(() => setStoredConsent("granted")).not.toThrow();
      expect(dispatchEvent).toHaveBeenCalledTimes(1);
    });
  });
});
