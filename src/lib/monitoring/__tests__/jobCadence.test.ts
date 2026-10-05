import { describe, it, expect } from "vitest";
import { JOB_CONFIGS, ACTIVELY_SCHEDULED_JOB_NAMES, getJobConfig, isActivelyScheduled, isRetrySafe } from "../jobCadence";

describe("jobCadence", () => {
  it("aplos-sync exists as a configured job but is excluded from active scheduling (not yet in vercel.json)", () => {
    expect(getJobConfig("aplos-sync")).toBeDefined();
    expect(isActivelyScheduled("aplos-sync")).toBe(false);
    expect(ACTIVELY_SCHEDULED_JOB_NAMES).not.toContain("aplos-sync");
  });

  it("every other configured job is actively scheduled", () => {
    for (const jobName of Object.keys(JOB_CONFIGS)) {
      if (jobName === "aplos-sync") continue;
      expect(isActivelyScheduled(jobName)).toBe(true);
    }
  });

  it("staleAfterMs is always greater than expectedIntervalMs, to tolerate one missed/delayed run", () => {
    for (const [jobName, config] of Object.entries(JOB_CONFIGS)) {
      if (!Number.isFinite(config.staleAfterMs)) continue; // aplos-sync's Infinity is the deliberate "not scheduled" exception
      expect(config.staleAfterMs, `${jobName} should tolerate at least one delayed run`).toBeGreaterThan(config.expectedIntervalMs);
    }
  });

  it("returns undefined for an unknown job name rather than throwing", () => {
    expect(getJobConfig("not-a-real-job")).toBeUndefined();
    expect(isActivelyScheduled("not-a-real-job")).toBe(false);
  });

  describe("isRetrySafe — the single source of truth gating the admin Retry button", () => {
    it("release-settlement-queue is NEVER retry-safe — it moves real settlement funds", () => {
      expect(isRetrySafe("release-settlement-queue")).toBe(false);
    });

    it("the design doc's explicit safe examples are all retry-safe", () => {
      expect(isRetrySafe("aplos-sync")).toBe(true);
      expect(isRetrySafe("webhook-retry")).toBe(true);
      expect(isRetrySafe("reconcile")).toBe(true); // never creates a charge/reversal
    });

    it("returns false (not undefined/throws) for an unknown job name", () => {
      expect(isRetrySafe("not-a-real-job")).toBe(false);
    });
  });
});
