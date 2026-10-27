import { describe, expect, it } from "vitest";
import { DEFAULT_DISPLAY, parseDisplayUpdate, qrPx, resolveDisplay, textZoomStyle } from "../display";

describe("campaign display settings", () => {
  it("falls back to defaults for missing or unknown values", () => {
    expect(resolveDisplay(null)).toEqual(DEFAULT_DISPLAY);
    expect(resolveDisplay({ qrSize: "huge", fontStyle: "classic" })).toEqual({ ...DEFAULT_DISPLAY, fontStyle: "classic" });
  });

  it("validates a request body and rejects bad keys", () => {
    expect(parseDisplayUpdate({ qrSize: "lg", textSize: "xl" })).toEqual({ data: { qrSize: "lg", textSize: "xl" } });
    expect(parseDisplayUpdate({}).data).toEqual({});
    expect(parseDisplayUpdate({ fontStyle: "comic-sans" }).error).toBe("Invalid font style");
    expect(parseDisplayUpdate({ textSize: "hidden" }).error).toBe("Invalid text size"); // text can't be hidden
  });

  it("sizes grow with the preset and the default matches the previous layout", () => {
    expect(qrPx("md")).toBe(96);
    expect(qrPx("xl")).toBeGreaterThan(qrPx("lg"));
    expect(textZoomStyle("md")).toBeUndefined();
    expect(textZoomStyle("xl")).toEqual({ zoom: 1.5 });
  });
});
