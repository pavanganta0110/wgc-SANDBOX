import { describe, it, expect } from "vitest";
import { partnerInviteCopy } from "@/lib/partners/partnerInviteEmail";

const link = "https://x.test/partner/accept-invite/tok";

describe("partnerInviteCopy", () => {
  it("tells full-access staff they will manage the account", () => {
    expect(partnerInviteCopy("CV Campus OS", "FULL", link).bodyHtml).toContain("manage the <strong>CV Campus OS</strong> partner account");
  });

  it("tells a view-only member their access is view-only, and does not say manage", () => {
    const body = partnerInviteCopy("CV Campus OS", "VIEWER", link).bodyHtml;
    expect(body).toContain("view-only");
    expect(body).not.toContain("manage");
  });

  it("tells an agent they will see their clients and commission", () => {
    const body = partnerInviteCopy("Sparrow Pay", "AGENT", link).bodyHtml;
    expect(body).toContain("clients you brought");
    expect(body).toContain("your commission");
    expect(body).not.toContain("manage");
  });

  it("escapes the partner name in the body and keeps the link", () => {
    const c = partnerInviteCopy("A <b>&</b> Co", "FULL", link);
    expect(c.bodyHtml).toContain("A &lt;b&gt;&amp;&lt;/b&gt; Co");
    expect(c.bodyHtml).toContain(link);
    expect(c.subject).toContain("partner dashboard");
  });
});
