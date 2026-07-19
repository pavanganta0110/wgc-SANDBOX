import { describe, it, expect } from "vitest";
import type { MerchantAuthContext } from "@/lib/auth/requireMerchantSession";
import { canOpenTeamMemberDetail, canExportTeamMemberData } from "@/lib/settings/teamMemberAccess";

function makeAuth(overrides: Partial<MerchantAuthContext> = {}): MerchantAuthContext {
  return {
    userId: "self-1",
    email: "self@church-a.com",
    churchId: "church-a",
    rawRole: "owner",
    role: "owner",
    isWgcAdmin: false,
    permissionsJson: null,
    authVersion: 1,
    ...overrides,
  };
}

describe("canOpenTeamMemberDetail", () => {
  it("OWNER can open every team member's detail page", () => {
    const auth = makeAuth({ rawRole: "owner", role: "owner" });
    expect(canOpenTeamMemberDetail(auth, { id: "other-1", churchId: "church-a" })).toBe(true);
  });

  it("ADMIN with canManageTeam override can open a team member's detail page", () => {
    const auth = makeAuth({
      rawRole: "admin",
      role: "admin",
      permissionsJson: { canManageTeam: true },
    });
    expect(canOpenTeamMemberDetail(auth, { id: "other-1", churchId: "church-a" })).toBe(true);
  });

  it("ADMIN without canManageTeam/canViewAsUser cannot open another member's page", () => {
    const auth = makeAuth({ rawRole: "admin", role: "admin", permissionsJson: null });
    expect(canOpenTeamMemberDetail(auth, { id: "other-1", churchId: "church-a" })).toBe(false);
  });

  it("FUNDRAISER cannot open another user's detail page", () => {
    const auth = makeAuth({ userId: "fund-1", rawRole: "fundraiser", role: "fundraiser" });
    expect(canOpenTeamMemberDetail(auth, { id: "other-1", churchId: "church-a" })).toBe(false);
  });

  it("FUNDRAISER can open their own detail page", () => {
    const auth = makeAuth({ userId: "fund-1", rawRole: "fundraiser", role: "fundraiser" });
    expect(canOpenTeamMemberDetail(auth, { id: "fund-1", churchId: "church-a" })).toBe(true);
  });

  it("cross-church target is always rejected, even for OWNER", () => {
    const auth = makeAuth({ rawRole: "owner", role: "owner", churchId: "church-a" });
    expect(canOpenTeamMemberDetail(auth, { id: "other-1", churchId: "church-b" })).toBe(false);
  });

  it("disabled users are not excluded by this check — access control is independent of disabled status", () => {
    const auth = makeAuth({ rawRole: "owner", role: "owner" });
    // canOpenTeamMemberDetail never receives a disabled flag; a disabled
    // target's historical page must remain reachable to OWNER/ADMIN.
    expect(canOpenTeamMemberDetail(auth, { id: "disabled-1", churchId: "church-a" })).toBe(true);
  });
});

describe("canExportTeamMemberData", () => {
  it("OWNER can export any team member's data", () => {
    const auth = makeAuth({ rawRole: "owner", role: "owner" });
    expect(canExportTeamMemberData(auth, { id: "other-1", churchId: "church-a" })).toBe(true);
  });

  it("FUNDRAISER cannot export organization-wide (another user's) data", () => {
    const auth = makeAuth({ userId: "fund-1", rawRole: "fundraiser", role: "fundraiser" });
    expect(canExportTeamMemberData(auth, { id: "other-1", churchId: "church-a" })).toBe(false);
  });

  it("ADMIN without canManageTeam cannot export even though canViewAsUser alone might allow viewing", () => {
    const auth = makeAuth({
      rawRole: "admin",
      role: "admin",
      permissionsJson: { canViewAsUser: true },
    });
    expect(canOpenTeamMemberDetail(auth, { id: "other-1", churchId: "church-a" })).toBe(true);
    expect(canExportTeamMemberData(auth, { id: "other-1", churchId: "church-a" })).toBe(false);
  });
});
