import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({ scorecardRateHit: { count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { allow, clientIp } from "../rateLimit";

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.scorecardRateHit.count.mockResolvedValue(0);
  prismaMock.scorecardRateHit.create.mockResolvedValue({});
  prismaMock.scorecardRateHit.deleteMany.mockResolvedValue({ count: 0 });
});

describe("allow", () => {
  it("lets a visitor through and records the hit under their own bucket", async () => {
    expect(await allow("1.2.3.4", "score", 6)).toBe(true);
    expect(prismaMock.scorecardRateHit.create).toHaveBeenCalledWith({ data: { key: "score:1.2.3.4" } });
    expect(prismaMock.scorecardRateHit.count.mock.calls[0][0].where.key).toBe("score:1.2.3.4");
  });

  it("stops a visitor who used up the minute, without recording another hit", async () => {
    prismaMock.scorecardRateHit.count.mockResolvedValue(6);
    expect(await allow("1.2.3.4", "score", 6)).toBe(false);
    expect(prismaMock.scorecardRateHit.create).not.toHaveBeenCalled();
  });

  it("fails closed when the database can't be read, so a dead limiter never means free AI calls", async () => {
    prismaMock.scorecardRateHit.count.mockRejectedValue(new Error("db down"));
    expect(await allow("1.2.3.4", "score", 6)).toBe(false);
  });
});

describe("clientIp", () => {
  it("uses the platform's x-real-ip first, then the first forwarded address", () => {
    expect(clientIp(new Request("https://x", { headers: { "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("https://x", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } }))).toBe("1.1.1.1");
    expect(clientIp(new Request("https://x"))).toBe("unknown");
  });
});
