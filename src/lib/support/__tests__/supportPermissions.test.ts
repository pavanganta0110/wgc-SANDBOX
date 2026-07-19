import { describe, it, expect } from "vitest";
import { getSupportPermissions } from "@/lib/support/supportPermissions";

describe("getSupportPermissions", () => {
  it("CP4D: wgc_admin has no access through this merchant-facing module — internal support access must use a separate audited flow", () => {
    const p = getSupportPermissions("wgc_admin");
    expect(p.canView).toBe(false);
    expect(p.canCreateTicket).toBe(false);
    expect(p.canReply).toBe(false);
    expect(p.canCloseReopen).toBe(false);
    expect(p.isSupportContext).toBe(false);
  });

  it("church_admin (legacy, normalizes to admin) has full self-service ticket access including canViewAllTickets", () => {
    const p = getSupportPermissions("church_admin");
    expect(p.canCreateTicket).toBe(true);
    expect(p.canReply).toBe(true);
    expect(p.canCloseReopen).toBe(true);
    expect(p.canViewAllTickets).toBe(true);
    expect(p.isSupportContext).toBe(false);
  });

  it("owner can view all same-church tickets", () => {
    expect(getSupportPermissions("owner").canViewAllTickets).toBe(true);
  });

  it("fundraiser can self-serve but not view the full org ticket queue", () => {
    const p = getSupportPermissions("fundraiser");
    expect(p.canCreateTicket).toBe(true);
    expect(p.canViewAllTickets).toBe(false);
  });

  it("CP4D: viewer has no support-ticket access by default", () => {
    const p = getSupportPermissions("viewer");
    expect(p.canView).toBe(false);
    expect(p.canCreateTicket).toBe(false);
    expect(p.canReply).toBe(false);
    expect(p.canViewAllTickets).toBe(false);
  });

  it("default-denies for an unrecognized or missing role", () => {
    expect(getSupportPermissions(null)).toEqual({
      canView: false,
      canCreateTicket: false,
      canReply: false,
      canCloseReopen: false,
      canUploadAttachment: false,
      canViewAllTickets: false,
      isSupportContext: false,
    });
    expect(getSupportPermissions(undefined)).toEqual(getSupportPermissions(null));
  });
});
