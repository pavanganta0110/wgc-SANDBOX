import { describe, it, expect, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  onboardingApplication: { findUnique: vi.fn() },
  partner: { findUnique: vi.fn() },
  partnerAgent: { findFirst: vi.fn() },
  partnerUser: { findMany: vi.fn() },
  emailLog: { create: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
const sendWgcEmail = vi.hoisted(() => vi.fn());
vi.mock("@/lib/email", () => ({ sendWgcEmail }));

import { emailReferralTeamOfStage } from "../referralStageEmails";

const app = { id: "a1", partnerId: "p1", partnerAgentId: "ag1", organizationName: "Grace", legalBusinessName: null, updateRequestedItems: "• A letter from the Church" };

beforeEach(() => {
  vi.clearAllMocks();
  sendWgcEmail.mockResolvedValue({ success: true });
  prismaMock.emailLog.create.mockResolvedValue({});
  prismaMock.onboardingApplication.findUnique.mockResolvedValue(app);
  prismaMock.partner.findUnique.mockResolvedValue({ name: "Acme ISO", partnerType: "REFERRAL", status: "ACTIVE", contactEmail: "boss@acme.test" });
  prismaMock.partnerAgent.findFirst.mockResolvedValue({ name: "Sam", email: "sam@acme.test" });
  prismaMock.partnerUser.findMany.mockResolvedValue([
    { email: "sam.login@acme.test", agentId: "ag1", staffRole: "FULL" },
    { email: "other.agent@acme.test", agentId: "ag2", staffRole: "FULL" },
    { email: "staff@acme.test", agentId: null, staffRole: "FULL" },
    { email: "viewer@acme.test", agentId: null, staffRole: "VIEWER" },
  ]);
});

const recipients = () => sendWgcEmail.mock.calls.map((c) => c[0].to).sort();

describe("emailReferralTeamOfStage", () => {
  it("tells the agent who brought it in, the partner's full-access staff and its contact, and nobody else", async () => {
    await emailReferralTeamOfStage("a1", "approved");
    expect(recipients()).toEqual(["boss@acme.test", "sam.login@acme.test", "sam@acme.test", "staff@acme.test"]);
    expect(sendWgcEmail.mock.calls[0][0].subject).toBe("Grace was approved");
    expect(prismaMock.emailLog.create).toHaveBeenCalledTimes(4);
  });

  it("says what Finix asked for, and never includes an upload link", async () => {
    await emailReferralTeamOfStage("a1", "information_required");
    const html = sendWgcEmail.mock.calls[0][0].bodyHtml as string;
    expect(html).toContain("A letter from the Church");
    expect(html).not.toContain("/onboarding/update/");
  });

  it("sends nothing for a software partner or an application with no partner", async () => {
    prismaMock.partner.findUnique.mockResolvedValue({ name: "CRM", partnerType: "SOFTWARE", status: "ACTIVE", contactEmail: "x@crm.test" });
    await emailReferralTeamOfStage("a1", "approved");
    prismaMock.onboardingApplication.findUnique.mockResolvedValue({ ...app, partnerId: null });
    await emailReferralTeamOfStage("a1", "approved");
    expect(sendWgcEmail).not.toHaveBeenCalled();
  });

  it("never throws when sending fails", async () => {
    sendWgcEmail.mockRejectedValue(new Error("down"));
    await expect(emailReferralTeamOfStage("a1", "submitted")).resolves.toBeUndefined();
  });
});
