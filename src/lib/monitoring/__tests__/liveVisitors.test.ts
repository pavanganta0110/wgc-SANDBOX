import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

async function loadModule() {
  vi.resetModules();
  return import("../liveVisitors");
}

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  process.env = { ...originalEnv };
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("isPostHogQueryConfigured", () => {
  it("is false when either required env var is missing", async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    delete process.env.POSTHOG_PROJECT_ID;
    const { isPostHogQueryConfigured } = await loadModule();
    expect(isPostHogQueryConfigured()).toBe(false);
  });

  it("is true once both are set", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    process.env.POSTHOG_PROJECT_ID = "12345";
    const { isPostHogQueryConfigured } = await loadModule();
    expect(isPostHogQueryConfigured()).toBe(true);
  });
});

describe("getLiveVisitorSnapshot", () => {
  it("returns an empty, unconfigured snapshot without ever calling fetch when env vars are missing", async () => {
    delete process.env.POSTHOG_PERSONAL_API_KEY;
    delete process.env.POSTHOG_PROJECT_ID;
    global.fetch = vi.fn();
    const { getLiveVisitorSnapshot } = await loadModule();
    const snapshot = await getLiveVisitorSnapshot();
    expect(snapshot.configured).toBe(false);
    expect(snapshot.totalLiveVisitors).toBe(0);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("aggregates PostHog query rows into distinct-visitor counts and top-N breakdowns", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    process.env.POSTHOG_PROJECT_ID = "12345";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          ["visitor_1", "/give/first-baptist", "Desktop", "United States", "google.com"],
          ["visitor_1", "/give/first-baptist", "Desktop", "United States", "google.com"], // same visitor, second pageview — must not double-count the visitor total
          ["visitor_2", "/give/grace-fellowship", "Mobile", "Canada", null],
        ],
      }),
    }) as unknown as typeof fetch;

    const { getLiveVisitorSnapshot } = await loadModule();
    const snapshot = await getLiveVisitorSnapshot();

    expect(snapshot.configured).toBe(true);
    expect(snapshot.totalLiveVisitors).toBe(2); // distinct visitors, not raw event/row count
    expect(snapshot.topPages[0]).toEqual({ label: "/give/first-baptist", count: 2 });
    expect(snapshot.devices).toEqual(expect.arrayContaining([{ label: "Desktop", count: 2 }, { label: "Mobile", count: 1 }]));
    expect(snapshot.countries).toEqual(expect.arrayContaining([{ label: "United States", count: 2 }, { label: "Canada", count: 1 }]));
    // A null referrer (direct traffic) gets a clear label, not dropped or blank
    expect(snapshot.referrers).toEqual(expect.arrayContaining([{ label: "google.com", count: 2 }, { label: "Direct / none", count: 1 }]));
  });

  it("never throws and reports a clear error when PostHog's API itself returns a non-2xx", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    process.env.POSTHOG_PROJECT_ID = "12345";
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }) as unknown as typeof fetch;
    const { getLiveVisitorSnapshot } = await loadModule();
    const snapshot = await getLiveVisitorSnapshot();
    expect(snapshot.configured).toBe(true);
    expect(snapshot.error).toContain("401");
  });

  it("never throws even when the fetch call itself rejects (network error)", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    process.env.POSTHOG_PROJECT_ID = "12345";
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    const { getLiveVisitorSnapshot } = await loadModule();
    await expect(getLiveVisitorSnapshot()).resolves.toMatchObject({ configured: true, totalLiveVisitors: 0 });
  });

  it("never throws on a malformed/unexpected response shape", async () => {
    process.env.POSTHOG_PERSONAL_API_KEY = "phx_test";
    process.env.POSTHOG_PROJECT_ID = "12345";
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ results: "not-an-array" }) }) as unknown as typeof fetch;
    const { getLiveVisitorSnapshot } = await loadModule();
    const snapshot = await getLiveVisitorSnapshot();
    expect(snapshot.totalLiveVisitors).toBe(0);
    expect(snapshot.error).toBeNull();
  });
});
