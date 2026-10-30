import { describe, it, expect, vi, beforeEach } from "vitest";
import { ForbiddenError } from "@/lib/auth/errors";

const prismaMock = vi.hoisted(() => ({ church: { findUnique: vi.fn() }, user: { findFirst: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const session = vi.hoisted(() => ({ requireMerchantSession: vi.fn() }));
vi.mock("@/lib/auth/requireMerchantSession", () => session);
const perms = vi.hoisted(() => ({ requirePermission: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => perms);
vi.mock("@/lib/auth/viewScope", () => ({ requireFullOrganizationContext: vi.fn() }));
vi.mock("@/lib/auth/auditImpersonatedWrite", () => ({ auditImpersonatedWrite: vi.fn() }));
const audit = vi.hoisted(() => ({ logDashboardAction: vi.fn() }));
vi.mock("@/lib/dashboardAudit", () => audit);
const embed = vi.hoisted(() => ({ getEmbedSignInMode: vi.fn() }));
vi.mock("@/lib/partners/embedEntry", () => embed);

import { PUT } from "../passcode/route";

const put = (userId: string, body: unknown) => PUT(new Request("https://wgc.test/x", { method: "PUT", body: JSON.stringify(body) }), { params: Promise.resolve({ userId }) });

beforeEach(() => {
  vi.clearAllMocks();
  perms.requirePermission.mockReset();
  session.requireMerchantSession.mockResolvedValue({ userId: "admin1", email: "admin@c.test", churchId: "c1", rawRole: "admin" });
  prismaMock.church.findUnique.mockResolvedValue({ partnerId: "p1", primaryOwnerUserId: "owner1" });
  embed.getEmbedSignInMode.mockResolvedValue("PASSCODE");
  prismaMock.user.findFirst.mockResolvedValue({ id: "maya", email: "maya@c.test", role: "fundraiser", disabledAt: null });
  prismaMock.user.update.mockResolvedValue({});
});

describe("PUT /api/merchant/settings/team/[userId]/passcode", () => {
  it("stores the passcode hashed, clears any lock, and records who set it", async () => {
    const res = await put("maya", { passcode: "river-stone-42" });
    expect(res.status).toBe(200);
    const call = prismaMock.user.update.mock.calls[0][0];
    expect(call.where).toEqual({ id: "maya" });
    expect(call.data.framePasscodeHash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(call.data.framePasscodeHash).not.toContain("river-stone-42");
    expect(call.data).toMatchObject({ framePasscodeFailedAttempts: 0, framePasscodeLockedUntil: null });
    expect(audit.logDashboardAction).toHaveBeenCalledWith(expect.objectContaining({ action: "settings.team_passcode_set", entityId: "maya", actorUserId: "admin1" }));
    expect(JSON.stringify(audit.logDashboardAction.mock.calls)).not.toContain("river-stone-42");
  });

  it("looks the person up inside the signed-in organization only", async () => {
    await put("maya", { passcode: "river-stone-42" });
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toMatchObject({ id: "maya", churchId: "c1" });
    prismaMock.user.findFirst.mockResolvedValue(null);
    expect((await put("someone-else", { passcode: "river-stone-42" })).status).toBe(404);
  });

  it("needs permission to manage the team", async () => {
    perms.requirePermission.mockImplementation(() => {
      throw new ForbiddenError("Missing required permission: canManageTeam");
    });
    expect((await put("maya", { passcode: "river-stone-42" })).status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("refuses a weak passcode, and an organization whose partner does not use passcodes", async () => {
    expect((await put("maya", { passcode: "123456" })).status).toBe(400);
    embed.getEmbedSignInMode.mockResolvedValue("CRM_IDENTITY");
    expect((await put("maya", { passcode: "river-stone-42" })).status).toBe(400);
    prismaMock.church.findUnique.mockResolvedValue({ partnerId: null, primaryOwnerUserId: "owner1" });
    expect((await put("maya", { passcode: "river-stone-42" })).status).toBe(400);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it("an administrator cannot set the owner's passcode, but the owner can set their own", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "owner1", email: "o@c.test", role: "owner", disabledAt: null });
    expect((await put("owner1", { passcode: "river-stone-42" })).status).toBe(403);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
    session.requireMerchantSession.mockResolvedValue({ userId: "owner1", email: "o@c.test", churchId: "c1", rawRole: "owner" });
    expect((await put("owner1", { passcode: "river-stone-42" })).status).toBe(200);
  });

  it("a disabled person cannot be given a passcode", async () => {
    prismaMock.user.findFirst.mockResolvedValue({ id: "maya", email: "maya@c.test", role: "fundraiser", disabledAt: new Date() });
    expect((await put("maya", { passcode: "river-stone-42" })).status).toBe(404);
  });
});
