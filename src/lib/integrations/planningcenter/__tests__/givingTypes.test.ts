import { describe, it, expect } from "vitest";
import { evaluateGivingReadiness, type ReadinessInput } from "../givingTypes";

const ready: ReadinessInput = {
  connectionHealthy: true,
  organizationMatches: true,
  canReadGiving: true,
  canWriteGiving: true,
  paymentSource: "READY",
  defaultFund: { name: "General", health: "OK" },
  funds: [{ name: "Missions", mapping: { health: "OK" } }],
};

describe("evaluateGivingReadiness", () => {
  it("is ready when everything is in place", () => {
    expect(evaluateGivingReadiness(ready)).toEqual({ ready: true, reasons: [], notes: [] });
  });

  it("blocks on an unhealthy connection and on a different organization", () => {
    expect(evaluateGivingReadiness({ ...ready, connectionHealthy: false }).ready).toBe(false);
    expect(evaluateGivingReadiness({ ...ready, organizationMatches: false }).reasons.join(" ")).toMatch(/different Planning Center organization/);
  });

  it("distinguishes 'write access refused' from 'write access not yet confirmed'", () => {
    const refused = evaluateGivingReadiness({ ...ready, canWriteGiving: false });
    const unknown = evaluateGivingReadiness({ ...ready, canWriteGiving: null });
    expect(refused.reasons.join(" ")).toMatch(/Finance Administrator/);
    expect(unknown.reasons.join(" ")).toMatch(/hasn't been confirmed/);
  });

  it("blocks when read access is denied", () => {
    expect(evaluateGivingReadiness({ ...ready, canReadGiving: false }).reasons.join(" ")).toMatch(/can't access Giving/);
  });

  it("blocks on a missing or archived payment source", () => {
    expect(evaluateGivingReadiness({ ...ready, paymentSource: "MISSING" }).ready).toBe(false);
    expect(evaluateGivingReadiness({ ...ready, paymentSource: "ARCHIVED" }).reasons.join(" ")).toMatch(/archived/);
  });

  it("requires a default fund, and a usable one", () => {
    expect(evaluateGivingReadiness({ ...ready, defaultFund: null }).reasons.join(" ")).toMatch(/default Planning Center fund/);
    expect(evaluateGivingReadiness({ ...ready, defaultFund: { name: "Old", health: "MISSING" } }).reasons.join(" ")).toMatch(/“Old” no longer exists/);
    expect(evaluateGivingReadiness({ ...ready, defaultFund: { name: "Closed", health: "HIDDEN" } }).reasons.join(" ")).toMatch(/can't receive gifts/);
  });

  it("a broken mapping blocks readiness even though a default fund exists (never silently reroute)", () => {
    const r = evaluateGivingReadiness({ ...ready, funds: [{ name: "Missions", mapping: { health: "MISSING" } }] });
    expect(r.ready).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/“Missions” is mapped to a Planning Center fund that no longer exists/);
  });

  it("unmapped funds do not block but are called out with the fund they'll use", () => {
    const one = evaluateGivingReadiness({ ...ready, funds: [{ name: "Missions", mapping: null }] });
    expect(one.ready).toBe(true);
    expect(one.notes).toEqual(["1 fund isn't mapped, so gifts to it will be recorded in “General”."]);
    const two = evaluateGivingReadiness({ ...ready, funds: [{ name: "A", mapping: null }, { name: "B", mapping: null }] });
    expect(two.notes[0]).toMatch(/^2 funds aren't mapped, so gifts to them will be recorded in “General”/);
  });

  it("does not claim gifts will go to a default fund that is itself broken", () => {
    const r = evaluateGivingReadiness({ ...ready, defaultFund: { name: "Old", health: "MISSING" }, funds: [{ name: "Missions", mapping: null }] });
    expect(r.ready).toBe(false);
    expect(r.notes).toEqual([]);
  });

  it("reports every problem at once, not just the first", () => {
    const r = evaluateGivingReadiness({ ...ready, paymentSource: "MISSING", defaultFund: null, canWriteGiving: null });
    expect(r.reasons.length).toBe(3);
  });
});
