import { describe, it, expect } from "vitest";
import { getSupportPermissions } from "@/lib/support/supportPermissions";

describe("getSupportPermissions", () => {
  it("wgc_admin cannot create tickets but can reply/close/reopen, and is flagged as a support context", () => {
    const p = getSupportPermissions("wgc_admin");
    expect(p.canCreateTicket).toBe(false);
    expect(p.canReply).toBe(true);
    expect(p.canCloseReopen).toBe(true);
    expect(p.isSupportContext).toBe(true);
  });

  it("church_admin has full ticket access but is not a support context", () => {
    const p = getSupportPermissions("church_admin");
    expect(p.canCreateTicket).toBe(true);
    expect(p.canReply).toBe(true);
    expect(p.canCloseReopen).toBe(true);
    expect(p.isSupportContext).toBe(false);
  });

  it("default-denies for an unrecognized or missing role", () => {
    expect(getSupportPermissions(null)).toEqual({
      canView: false,
      canCreateTicket: false,
      canReply: false,
      canCloseReopen: false,
      canUploadAttachment: false,
      isSupportContext: false,
    });
    expect(getSupportPermissions(undefined)).toEqual(getSupportPermissions(null));
  });
});
