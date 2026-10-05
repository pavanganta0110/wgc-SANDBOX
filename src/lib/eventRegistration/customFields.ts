/**
 * Merchant-defined registration questions for an Event.
 *
 * Deliberately small: five field types, a label, required/optional, and
 * whether the question is asked once per registration (e.g. "Team name") or
 * once per attendee (e.g. "T-shirt size"). This is NOT a general forms
 * engine — there is no conditional logic, no file upload, no ordering
 * beyond array position. The definitions live as JSON on Event and the
 * answers as JSON on EventRegistration/EventAttendee, keyed by the field's
 * stable id, so renaming a label never orphans old answers.
 *
 * Everything here is a pure function: the same validation runs in the
 * merchant settings API (definitions) and the public registration API
 * (answers). Raw client JSON is never trusted — it is always normalized
 * through these functions first.
 */

export const CUSTOM_FIELD_TYPES = ["TEXT", "TEXTAREA", "DROPDOWN", "CHECKBOX", "NUMBER"] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_SCOPES = ["REGISTRATION", "ATTENDEE"] as const;
export type CustomFieldScope = (typeof CUSTOM_FIELD_SCOPES)[number];

export interface CustomFieldDefinition {
  id: string;
  label: string;
  type: CustomFieldType;
  required: boolean;
  appliesTo: CustomFieldScope;
  /** DROPDOWN only. */
  options?: string[];
}

export type CustomFieldResponses = Record<string, string | number | boolean>;

export const MAX_CUSTOM_FIELDS = 20;
const MAX_LABEL_LENGTH = 80;
const MAX_OPTION_LENGTH = 80;
const MAX_OPTIONS = 40;
const MAX_TEXT_ANSWER_LENGTH = 500;
const MAX_TEXTAREA_ANSWER_LENGTH = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Stable, URL/JSON-safe id for a field — generated from its label the first time, then preserved. */
export function generateFieldId(label: string, existingIds: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 30) || "field";
  if (!existingIds.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}_${i}`;
    if (!existingIds.has(candidate)) return candidate;
  }
  return `${base}_${Date.now().toString(36)}`;
}

/**
 * Parses whatever is stored in Event.customFieldsJson into a clean list.
 * Tolerant: anything malformed is dropped rather than throwing, so a bad
 * row in the database can never take the public event page down.
 */
export function parseCustomFields(json: unknown): CustomFieldDefinition[] {
  if (!Array.isArray(json)) return [];
  const out: CustomFieldDefinition[] = [];
  const seen = new Set<string>();
  for (const raw of json) {
    if (!isRecord(raw)) continue;
    const id = typeof raw.id === "string" ? raw.id : "";
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const type = raw.type as CustomFieldType;
    const appliesTo = raw.appliesTo as CustomFieldScope;
    if (!id || !label || seen.has(id)) continue;
    if (!CUSTOM_FIELD_TYPES.includes(type)) continue;
    if (!CUSTOM_FIELD_SCOPES.includes(appliesTo)) continue;
    const options =
      type === "DROPDOWN" && Array.isArray(raw.options)
        ? raw.options.filter((o): o is string => typeof o === "string" && o.trim().length > 0).map((o) => o.trim())
        : undefined;
    if (type === "DROPDOWN" && (!options || options.length === 0)) continue;
    seen.add(id);
    out.push({ id, label, type, required: Boolean(raw.required), appliesTo, ...(options ? { options } : {}) });
  }
  return out;
}

export type DefinitionValidation = { ok: true; fields: CustomFieldDefinition[] } | { ok: false; error: string };

/**
 * Validates definitions submitted from the merchant settings form. Unlike
 * parseCustomFields this is strict — it returns a specific error the
 * merchant can act on. Assigns ids to new fields (those without one) and
 * preserves existing ids so past answers stay attached.
 */
export function validateCustomFieldDefinitions(input: unknown): DefinitionValidation {
  if (input == null) return { ok: true, fields: [] };
  if (!Array.isArray(input)) return { ok: false, error: "Custom fields must be a list." };
  if (input.length > MAX_CUSTOM_FIELDS) return { ok: false, error: `An event can have at most ${MAX_CUSTOM_FIELDS} custom fields.` };

  const ids = new Set<string>();
  for (const raw of input) {
    if (isRecord(raw) && typeof raw.id === "string" && raw.id) ids.add(raw.id);
  }
  const usedIds = new Set<string>();
  const fields: CustomFieldDefinition[] = [];

  for (const raw of input) {
    if (!isRecord(raw)) return { ok: false, error: "Each custom field must be an object." };
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (!label) return { ok: false, error: "Every custom field needs a label." };
    if (label.length > MAX_LABEL_LENGTH) return { ok: false, error: `Field labels can be at most ${MAX_LABEL_LENGTH} characters.` };

    const type = raw.type as CustomFieldType;
    if (!CUSTOM_FIELD_TYPES.includes(type)) return { ok: false, error: `"${label}" has an unsupported field type.` };
    const appliesTo = (raw.appliesTo ?? "REGISTRATION") as CustomFieldScope;
    if (!CUSTOM_FIELD_SCOPES.includes(appliesTo)) return { ok: false, error: `"${label}" has an invalid scope.` };

    let options: string[] | undefined;
    if (type === "DROPDOWN") {
      const rawOptions = Array.isArray(raw.options) ? raw.options : [];
      options = rawOptions
        .filter((o): o is string => typeof o === "string")
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
      if (options.length === 0) return { ok: false, error: `"${label}" is a dropdown and needs at least one option.` };
      if (options.length > MAX_OPTIONS) return { ok: false, error: `"${label}" can have at most ${MAX_OPTIONS} options.` };
      if (options.some((o) => o.length > MAX_OPTION_LENGTH)) return { ok: false, error: `Options for "${label}" can be at most ${MAX_OPTION_LENGTH} characters.` };
      if (new Set(options).size !== options.length) return { ok: false, error: `"${label}" has duplicate options.` };
    }

    let id = typeof raw.id === "string" && raw.id ? raw.id : "";
    if (!id) {
      id = generateFieldId(label, new Set([...ids, ...usedIds]));
    }
    if (usedIds.has(id)) return { ok: false, error: "Two custom fields share the same id." };
    usedIds.add(id);

    fields.push({ id, label, type, required: Boolean(raw.required), appliesTo, ...(options ? { options } : {}) });
  }
  return { ok: true, fields };
}

export type ResponseValidation =
  | { ok: true; responses: CustomFieldResponses }
  | { ok: false; error: string };

/**
 * Validates one set of answers (a registration's, or a single attendee's)
 * against the fields that apply to `scope`. Unknown keys are dropped — a
 * client can never persist an answer to a field the merchant didn't define.
 * An unchecked CHECKBOX is stored as false and satisfies `required` only
 * when checked (the "I agree" convention).
 */
export function validateCustomResponses(
  fields: CustomFieldDefinition[],
  scope: CustomFieldScope,
  raw: unknown,
  context = ""
): ResponseValidation {
  const answers = isRecord(raw) ? raw : {};
  const responses: CustomFieldResponses = {};
  const where = context ? ` (${context})` : "";

  for (const field of fields.filter((f) => f.appliesTo === scope)) {
    const value = answers[field.id];

    if (field.type === "CHECKBOX") {
      const checked = value === true || value === "true";
      if (field.required && !checked) return { ok: false, error: `"${field.label}" is required${where}.` };
      responses[field.id] = checked;
      continue;
    }

    const isEmpty = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    if (isEmpty) {
      if (field.required) return { ok: false, error: `"${field.label}" is required${where}.` };
      continue;
    }

    if (field.type === "NUMBER") {
      const n = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(n)) return { ok: false, error: `"${field.label}" must be a number${where}.` };
      responses[field.id] = n;
    } else if (field.type === "DROPDOWN") {
      const s = String(value).trim();
      if (!field.options?.includes(s)) return { ok: false, error: `"${field.label}" has an invalid choice${where}.` };
      responses[field.id] = s;
    } else {
      const s = String(value).trim();
      const max = field.type === "TEXTAREA" ? MAX_TEXTAREA_ANSWER_LENGTH : MAX_TEXT_ANSWER_LENGTH;
      if (s.length > max) return { ok: false, error: `"${field.label}" is too long${where}.` };
      responses[field.id] = s;
    }
  }
  return { ok: true, responses };
}

/** Human-readable answer text for exports/admin tables. */
export function formatResponse(field: CustomFieldDefinition, value: unknown): string {
  if (value === undefined || value === null) return "";
  if (field.type === "CHECKBOX") return value === true ? "Yes" : "No";
  return String(value);
}
