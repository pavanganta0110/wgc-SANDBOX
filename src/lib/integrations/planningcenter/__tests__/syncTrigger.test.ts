/* eslint-disable @typescript-eslint/no-explicit-any -- loose Prisma mocks */
import { describe, it, expect, vi, beforeEach } from "vitest";

const payment = { find: vi.fn() };
const config = { find: vi.fn() };
vi.mock("@/lib/prisma", () => ({ prisma: { payment: { findUnique: (a: any) => payment.find(a) }, planningCenterSyncConfig: { findUnique: (a: any) => config.find(a) } } }));

let platformOn = true;
vi.mock("../config", () => ({ isPlanningCenterSyncEnabled: () => platformOn }));
const day = vi.fn();
const reverse = vi.fn();
const attach = vi.fn();
vi.mock("../syncEngine", () => ({ processDaySync: (...a: unknown[]) => day(...a) }));
vi.mock("../syncReversals", () => ({ reverseChangedGifts: (...a: unknown[]) => reverse(...a) }));
vi.mock("../syncAttach", () => ({ attachPendingPeople: (...a: unknown[]) => attach(...a) }));
const profile = vi.fn();
vi.mock("../profileSync", () => ({ syncProfileForDonor: (...a: unknown[]) => profile(...a) }));
const afterMock = vi.fn();
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterMock(fn) }));

import { syncAfterPaymentChange, triggerPlanningCenterSync } from "../syncTrigger";

const sleep = vi.fn(async () => {});
const live = { syncMode: "LIVE", sendTiming: "ON_PAYMENT" };

beforeEach(() => {
  [payment.find, config.find, day, reverse, attach, afterMock, sleep, profile].forEach((m) => m.mockReset());
  platformOn = true;
  payment.find.mockResolvedValue({ id: "p1", churchId: "c1", status: "SUCCEEDED", createdAt: new Date("2026-10-14T22:30:00Z") });
  config.find.mockResolvedValue(live);
  day.mockResolvedValue("SYNCED");
  reverse.mockResolvedValue({ reversed: 0, waiting: 0, flagged: 0 });
  attach.mockResolvedValue({ attached: 0, cleared: 0, waiting: 0, flagged: 0 });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("syncAfterPaymentChange: people only", () => {
  const peopleOnly = { syncMode: "LIVE", sendTiming: "ON_PAYMENT", syncTarget: "PROFILE_FIELDS" };
  beforeEach(() => config.find.mockResolvedValue(peopleOnly));

  it("refreshes the donor's profile and sends NO donation (no batch, no reversal, no attach)", async () => {
    payment.find.mockResolvedValue({ id: "p1", churchId: "c1", donorId: "d1", status: "SUCCEEDED", createdAt: new Date("2026-10-14T22:30:00Z") });
    await syncAfterPaymentChange("p1", { sleep });
    expect(profile).toHaveBeenCalledWith("c1", "d1", expect.anything());
    expect(day).not.toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
  });

  it("also refreshes it when a payment is refunded or returned, because the totals move", async () => {
    payment.find.mockResolvedValue({ id: "p1", churchId: "c1", donorId: "d1", status: "RETURNED", createdAt: new Date() });
    await syncAfterPaymentChange("p1", { sleep });
    expect(profile).toHaveBeenCalledTimes(1);
  });

  it("a payment with no donor changes nothing", async () => {
    payment.find.mockResolvedValue({ id: "p1", churchId: "c1", donorId: null, status: "SUCCEEDED", createdAt: new Date() });
    await syncAfterPaymentChange("p1", { sleep });
    expect(profile).not.toHaveBeenCalled();
  });

  it("only when LIVE (a preview writes nothing)", async () => {
    config.find.mockResolvedValue({ ...peopleOnly, syncMode: "DRY_RUN" });
    payment.find.mockResolvedValue({ id: "p1", churchId: "c1", donorId: "d1", status: "SUCCEEDED", createdAt: new Date() });
    await syncAfterPaymentChange("p1", { sleep });
    expect(profile).not.toHaveBeenCalled();
  });

  it("still does nothing while the platform switch is off", async () => {
    platformOn = false;
    await syncAfterPaymentChange("p1", { sleep });
    expect(profile).not.toHaveBeenCalled();
  });
});

describe("syncAfterPaymentChange", () => {
  it("sends the payment's day batch (the day the payment was made), then checks reversals and attaches people", async () => {
    await syncAfterPaymentChange("p1", { sleep });
    expect(day).toHaveBeenCalledWith("c1", "2026-10-14", expect.anything());
    expect(reverse).toHaveBeenCalledWith("c1", expect.objectContaining({ paymentIds: ["p1"] }));
    expect(attach).toHaveBeenCalledWith("c1", expect.objectContaining({ limit: 20 }));
  });

  it("does NOTHING while the platform switch is off — not even a database query", async () => {
    platformOn = false;
    await syncAfterPaymentChange("p1", { sleep });
    expect(payment.find).not.toHaveBeenCalled();
    expect(day).not.toHaveBeenCalled();
  });

  it("does nothing unless the church is LIVE with 'send as soon as it's paid'", async () => {
    for (const cfg of [null, { syncMode: "OFF", sendTiming: "ON_PAYMENT" }, { syncMode: "DRY_RUN", sendTiming: "ON_PAYMENT" }, { syncMode: "LIVE", sendTiming: "ON_SETTLEMENT" }]) {
      config.find.mockResolvedValue(cfg);
      await syncAfterPaymentChange("p1", { sleep });
    }
    expect(day).not.toHaveBeenCalled();
    expect(reverse).not.toHaveBeenCalled();
  });

  it("an unknown payment is ignored", async () => {
    payment.find.mockResolvedValue(null);
    await syncAfterPaymentChange("nope", { sleep });
    expect(config.find).not.toHaveBeenCalled();
  });

  it("a payment that isn't a success only triggers the reversal and attach checks, never a send", async () => {
    payment.find.mockResolvedValue({ id: "p1", churchId: "c1", status: "RETURNED", createdAt: new Date("2026-10-14T10:00:00Z") });
    await syncAfterPaymentChange("p1", { sleep });
    expect(day).not.toHaveBeenCalled();
    expect(reverse).toHaveBeenCalledWith("c1", expect.objectContaining({ paymentIds: ["p1"] }));
  });

  it("if another worker owns the day's batch, it waits and looks again, a few times, then gives up (the sweep covers it)", async () => {
    day.mockResolvedValue("CONTENDED");
    await syncAfterPaymentChange("p1", { sleep });
    expect(day).toHaveBeenCalledTimes(4);
    expect(sleep).toHaveBeenCalledTimes(4);
    day.mockReset();
    day.mockResolvedValueOnce("CONTENDED").mockResolvedValue("SYNCED");
    await syncAfterPaymentChange("p1", { sleep });
    expect(day).toHaveBeenCalledTimes(2);
  });

  it("NEVER throws, whatever fails: it must not be able to affect the donor's payment", async () => {
    day.mockRejectedValue(new Error("planning center is down"));
    await expect(syncAfterPaymentChange("p1", { sleep })).resolves.toBeUndefined();
    payment.find.mockRejectedValue(new Error("db down"));
    await expect(syncAfterPaymentChange("p1", { sleep })).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("triggerPlanningCenterSync", () => {
  it("is free while the platform switch is off: nothing is even scheduled", () => {
    platformOn = false;
    triggerPlanningCenterSync("p1");
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("schedules the work to run AFTER the response, so it can't slow or break the payment", () => {
    triggerPlanningCenterSync("p1");
    expect(afterMock).toHaveBeenCalledTimes(1);
    expect(day).not.toHaveBeenCalled(); // not run inline
  });

  it("outside a request (where after() throws) it still runs, in the background, and never throws", async () => {
    afterMock.mockImplementation(() => {
      throw new Error("after() was called outside a request scope");
    });
    expect(() => triggerPlanningCenterSync("p1")).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(payment.find).toHaveBeenCalled();
  });
});
