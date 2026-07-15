const SENSITIVE_KEYS = [
  "account_number",
  "accountNumber",
  "routing_number",
  "routingNumber",
  "card_number",
  "cardNumber",
  "number",
  "security_code",
  "securityCode",
  "cvv",
  "cvv2",
  "token",
  "secret",
  "password",
  "authorization",
  "api_key",
  "apiKey",
  "ssn",
  "tax_id",
  "taxId",
  "dob",
  "date_of_birth",
];

const SENSITIVE_KEY_PATTERN = new RegExp(
  `(${SENSITIVE_KEYS.map((k) => k.toLowerCase()).join("|")})`,
  "i"
);

const REDACTED = "[REDACTED]";

/**
 * Deep-redacts sensitive fields (card/bank numbers, CVV, tokens, credentials,
 * DOB/SSN) from a Finix payload before it is stored. Matches by key name
 * substring so nested/renamed fields are still caught.
 */
export function redactFinixPayload<T>(payload: T): T {
  return redactValue(payload) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = redactValue(val);
      }
    }
    return result;
  }

  return value;
}
