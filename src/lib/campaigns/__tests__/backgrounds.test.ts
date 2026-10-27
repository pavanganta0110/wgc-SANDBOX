import { describe, expect, it } from "vitest";
import { isValidPageBackground, isValidWallBackground, pageBackgroundStyle, wallBackgroundStyle } from "../backgrounds";

describe("campaign backgrounds", () => {
  it("validates keys per surface", () => {
    expect(isValidWallBackground("black")).toBe(true);
    expect(isValidPageBackground("black")).toBe(false); // wall-only colour
    expect(isValidPageBackground("cream")).toBe(true);
    expect(isValidWallBackground("<script>")).toBe(false);
    expect(isValidPageBackground(undefined)).toBe(false);
  });

  it("falls back to the default colour for unknown keys", () => {
    expect(wallBackgroundStyle("nope", null).backgroundColor).toBe("#020617");
    expect(pageBackgroundStyle(null, null).backgroundColor).toBe("#f8fafc");
  });

  it("uses the campaign image only when one exists", () => {
    expect(wallBackgroundStyle("image", "https://x/y.png").backgroundImage).toContain("https://x/y.png");
    expect(wallBackgroundStyle("image", null).backgroundImage).toBeUndefined();
    expect(wallBackgroundStyle("image", null).backgroundColor).toBe("#020617");
  });
});
