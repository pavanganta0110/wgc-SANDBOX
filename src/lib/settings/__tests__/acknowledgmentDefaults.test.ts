import { describe, it, expect } from "vitest";
import {
  DEFAULT_NO_GOODS_SERVICES_TEXT,
  DEFAULT_GOODS_SERVICES_TEMPLATE,
  resolveAcknowledgmentSettings,
  resolveAcknowledgmentText,
} from "@/lib/settings/acknowledgmentDefaults";

describe("resolveAcknowledgmentSettings", () => {
  it("falls back to built-in defaults when unset", () => {
    expect(resolveAcknowledgmentSettings(null)).toEqual({
      noGoodsServicesText: DEFAULT_NO_GOODS_SERVICES_TEXT,
      goodsServicesTemplate: DEFAULT_GOODS_SERVICES_TEMPLATE,
    });
  });

  it("prefers saved organization wording over the defaults", () => {
    const settings = resolveAcknowledgmentSettings({
      acknowledgmentNoGoodsServicesText: "Custom no-goods text.",
      acknowledgmentGoodsServicesTemplate: "Custom template [VALUE] [DESCRIPTION]",
    });
    expect(settings.noGoodsServicesText).toBe("Custom no-goods text.");
    expect(settings.goodsServicesTemplate).toBe("Custom template [VALUE] [DESCRIPTION]");
  });
});

describe("resolveAcknowledgmentText", () => {
  it("uses the plain no-goods-services text when nothing was disclosed", () => {
    expect(resolveAcknowledgmentText(null, null, null)).toBe(DEFAULT_NO_GOODS_SERVICES_TEXT);
    expect(resolveAcknowledgmentText(null, "Gala dinner", null)).toBe(DEFAULT_NO_GOODS_SERVICES_TEXT);
    expect(resolveAcknowledgmentText(null, null, 2500)).toBe(DEFAULT_NO_GOODS_SERVICES_TEXT);
  });

  it("substitutes description and formatted value into the goods/services template when both are present", () => {
    const text = resolveAcknowledgmentText(null, "Gala dinner", 2500);
    expect(text).toContain("$25.00");
    expect(text).toContain("Gala dinner");
  });

  it("respects a custom organization template", () => {
    const text = resolveAcknowledgmentText(
      { acknowledgmentGoodsServicesTemplate: "FMV: [VALUE] — [DESCRIPTION]" },
      "Silent auction item",
      10000,
    );
    expect(text).toBe("FMV: $100.00 — Silent auction item");
  });
});
