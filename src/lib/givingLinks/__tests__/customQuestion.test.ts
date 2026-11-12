import { describe, it, expect } from "vitest";
import {
  parseDonorFieldSettings,
  DEFAULT_DONOR_FIELD_SETTINGS,
  CUSTOM_QUESTION_MAX_LABEL,
} from "@/lib/givingLinks/types";

describe("custom giving-page question", () => {
  it("is hidden by default and has no label", () => {
    const s = parseDonorFieldSettings(null);
    expect(s.customQuestion).toBe("HIDDEN");
    expect(s.customQuestionLabel).toBeUndefined();
    expect(DEFAULT_DONOR_FIELD_SETTINGS.customQuestion).toBe("HIDDEN");
  });

  it("existing links saved before this field existed stay hidden", () => {
    const s = parseDonorFieldSettings({ firstName: "REQUIRED", donorNote: "OPTIONAL" });
    expect(s.customQuestion).toBe("HIDDEN");
  });

  it("keeps visibility and a trimmed label", () => {
    const s = parseDonorFieldSettings({ customQuestion: "REQUIRED", customQuestionLabel: "  How did you hear about us?  " });
    expect(s.customQuestion).toBe("REQUIRED");
    expect(s.customQuestionLabel).toBe("How did you hear about us?");
  });

  it("caps an over-long label and ignores a non-string one", () => {
    const long = parseDonorFieldSettings({ customQuestion: "OPTIONAL", customQuestionLabel: "x".repeat(500) });
    expect(long.customQuestionLabel).toHaveLength(CUSTOM_QUESTION_MAX_LABEL);
    const bad = parseDonorFieldSettings({ customQuestion: "OPTIONAL", customQuestionLabel: { a: 1 } });
    expect(bad.customQuestionLabel).toBeUndefined();
  });

  it("rejects an unknown visibility value", () => {
    expect(parseDonorFieldSettings({ customQuestion: "SOMETIMES" }).customQuestion).toBe("HIDDEN");
  });
});
