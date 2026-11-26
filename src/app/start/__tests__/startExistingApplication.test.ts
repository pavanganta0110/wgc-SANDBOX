import { describe, it, expect, vi, beforeEach } from "vitest";

const resolvePartner = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/onboardingCode", () => ({
  looksLikeOnboardingCode: (v: unknown) => typeof v === "string" && /^[A-Za-z0-9_-]{6,}$/.test(v),
  resolvePartnerByOnboardingCode: resolvePartner,
}));
const loadState = vi.hoisted(() => vi.fn());
vi.mock("@/lib/partners/loadEmbedState", () => ({ loadPartnerEmbedState: loadState }));
vi.mock("../StartOnboardingForm", () => ({ default: function StartOnboardingForm() { return null; } }));
vi.mock("../ExistingApplicationNotice", () => ({ default: function ExistingApplicationNotice() { return null; } }));

import StartPage from "../page";

const render = (params: Record<string, string>) => StartPage({ searchParams: Promise.resolve(params) }) as Promise<{ type: { name: string }; props: Record<string, unknown> }>;

beforeEach(() => {
  vi.clearAllMocks();
  resolvePartner.mockResolvedValue({ id: "p1" });
  loadState.mockResolvedValue({ kind: "form" });
});

describe("/start with a partner code and the organization's reference", () => {
  it("shows the form for an organization that has not applied", async () => {
    const el = await render({ partner: "CODE1234", ref: "loc_1" });
    expect(el.type.name).toBe("StartOnboardingForm");
    expect(loadState).toHaveBeenCalledWith("p1", "loc_1");
  });

  it.each([
    [{ kind: "pending", stage: "submitted", organizationName: "Grace" }],
    [{ kind: "information_required", organizationName: "Grace", items: ["x"] }],
    [{ kind: "setting_up", organizationName: "Grace" }],
    [{ kind: "ready", churchId: "c1", organizationName: "Grace" }],
    [{ kind: "rejected", organizationName: "Grace" }],
  ])("shows the status, not a second form, once it has applied (%o)", async (state) => {
    loadState.mockResolvedValue(state);
    const el = await render({ partner: "CODE1234", ref: "loc_1" });
    expect(el.type.name).toBe("ExistingApplicationNotice");
    expect(el.props.state).toEqual(state);
  });

  it("keeps showing the form when there is no reference, no valid code or no such partner", async () => {
    expect((await render({ partner: "CODE1234" })).type.name).toBe("StartOnboardingForm");
    expect((await render({ ref: "loc_1" })).type.name).toBe("StartOnboardingForm");
    resolvePartner.mockResolvedValue(null);
    expect((await render({ partner: "CODE1234", ref: "loc_1" })).type.name).toBe("StartOnboardingForm");
    expect(loadState).not.toHaveBeenCalled();
  });
});
