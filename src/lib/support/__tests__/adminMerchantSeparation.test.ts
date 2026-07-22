import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { getSupportPermissions } from "@/lib/support/supportPermissions";

describe("Internal WGC admin / merchant role separation", () => {
  it("wgc_admin has no access through the merchant support-ticket permission module", () => {
    const p = getSupportPermissions("wgc_admin");
    expect(p.canView).toBe(false);
    expect(p.canCreateTicket).toBe(false);
    expect(p.canReply).toBe(false);
  });

  it("wgc_super_admin also has no access through the merchant support-ticket permission module", () => {
    const p = getSupportPermissions("wgc_super_admin");
    expect(p.canView).toBe(false);
    expect(p.canCreateTicket).toBe(false);
    expect(p.canReply).toBe(false);
  });

  it("Team Management's manageable-role list never includes wgc_admin or wgc_super_admin — internal admins can never appear in, or be added to, a church's team", () => {
    const source = readFileSync(
      join(__dirname, "../../../app/api/merchant/settings/team/route.ts"),
      "utf-8"
    );
    const match = source.match(/MANAGEABLE_ORG_ROLES\s*=\s*\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const roles = match![1];
    expect(roles).not.toContain("wgc_admin");
    expect(roles).not.toContain("wgc_super_admin");
  });
});
