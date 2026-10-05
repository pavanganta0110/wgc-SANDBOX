import { describe, it, expect } from "vitest";
import { validateCustomFieldDefinitions, validateCustomResponses, parseCustomFields, type CustomFieldDefinition } from "@/lib/eventRegistration/customFields";

const fields: CustomFieldDefinition[] = [
  { id: "shirt", label: "Shirt size", type: "DROPDOWN", required: true, appliesTo: "ATTENDEE", options: ["S", "M", "L"] },
  { id: "notes", label: "Notes", type: "TEXTAREA", required: false, appliesTo: "ATTENDEE" },
  { id: "age", label: "Age", type: "NUMBER", required: false, appliesTo: "ATTENDEE" },
  { id: "waiver", label: "I agree to the waiver", type: "CHECKBOX", required: true, appliesTo: "REGISTRATION" },
  { id: "team", label: "Team captain", type: "TEXT", required: false, appliesTo: "REGISTRATION" },
];

describe("validateCustomResponses", () => {
  it("only validates fields for the requested scope", () => {
    const r = validateCustomResponses(fields, "ATTENDEE", { shirt: "M" });
    expect(r).toEqual({ ok: true, responses: { shirt: "M" } });
  });

  it("requires required answers", () => {
    expect(validateCustomResponses(fields, "ATTENDEE", {}).ok).toBe(false);
  });

  it("rejects a dropdown value that is not an option", () => {
    expect(validateCustomResponses(fields, "ATTENDEE", { shirt: "XXL" }).ok).toBe(false);
  });

  it("treats a required checkbox as satisfied only when checked", () => {
    expect(validateCustomResponses(fields, "REGISTRATION", { waiver: false }).ok).toBe(false);
    expect(validateCustomResponses(fields, "REGISTRATION", { waiver: true })).toMatchObject({ ok: true, responses: { waiver: true } });
  });

  it("coerces numbers and rejects non-numbers", () => {
    expect(validateCustomResponses(fields, "ATTENDEE", { shirt: "S", age: "12" })).toMatchObject({ ok: true, responses: { age: 12 } });
    expect(validateCustomResponses(fields, "ATTENDEE", { shirt: "S", age: "twelve" }).ok).toBe(false);
  });

  it("drops answers to fields the merchant never defined", () => {
    const r = validateCustomResponses(fields, "ATTENDEE", { shirt: "S", injected: "x" });
    expect(r.ok && "injected" in r.responses).toBe(false);
  });
});

describe("validateCustomFieldDefinitions", () => {
  it("assigns stable ids to new fields and keeps existing ones", () => {
    const r = validateCustomFieldDefinitions([
      { label: "Meal choice", type: "DROPDOWN", appliesTo: "ATTENDEE", options: ["Chicken", "Veg"] },
      { id: "keepme", label: "Renamed label", type: "TEXT", appliesTo: "REGISTRATION" },
    ]);
    expect(r.ok && r.fields.map((f) => f.id)).toEqual(["meal_choice", "keepme"]);
  });

  it("requires options for dropdowns and rejects duplicates", () => {
    expect(validateCustomFieldDefinitions([{ label: "x", type: "DROPDOWN", options: [] }]).ok).toBe(false);
    expect(validateCustomFieldDefinitions([{ label: "x", type: "DROPDOWN", options: ["a", "a"] }]).ok).toBe(false);
  });

  it("caps how many questions an event can have", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ label: `Q${i}`, type: "TEXT" }));
    expect(validateCustomFieldDefinitions(many).ok).toBe(false);
  });
});

describe("parseCustomFields", () => {
  it("drops malformed entries instead of throwing", () => {
    expect(parseCustomFields([{ id: "a" }, null, "x", { id: "ok", label: "OK", type: "TEXT", appliesTo: "ATTENDEE" }])).toHaveLength(1);
    expect(parseCustomFields(null)).toEqual([]);
  });
});
