import { describe, it, expect } from "vitest";
import {
  DEFAULT_FOLLOW_UP_BODY,
  DEFAULT_FOLLOW_UP_SUBJECT,
  followUpFirstName,
  renderFollowUpBodyHtml,
  renderFollowUpSubject,
} from "../followUpTemplate";

const vars = { firstName: "Pavan", churchName: "Waypoint Gateway Collective" };

describe("follow-up email template", () => {
  it("fills merge fields in the default subject and body", () => {
    expect(renderFollowUpSubject(DEFAULT_FOLLOW_UP_SUBJECT, vars)).toBe("We miss you, Pavan");
    const html = renderFollowUpBodyHtml(DEFAULT_FOLLOW_UP_BODY, vars);
    expect(html).toContain("Hi Pavan,");
    expect(html).toContain("Waypoint Gateway Collective");
    expect(html).not.toContain("{{");
  });

  it("escapes HTML coming from donor names or typed text", () => {
    const html = renderFollowUpBodyHtml("Hi {{firstName}} <script>x</script>", { ...vars, firstName: "<b>Eve</b>" });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;b&gt;Eve&lt;/b&gt;");
  });

  it("keeps the subject on one line", () => {
    expect(renderFollowUpSubject("Hello\nthere {{firstName}}", vars)).toBe("Hello there Pavan");
  });

  it("falls back to 'there' when the donor has no usable name", () => {
    expect(followUpFirstName("—")).toBe("there");
    expect(followUpFirstName("")).toBe("there");
    expect(followUpFirstName("Jane Smith")).toBe("Jane");
  });
});
