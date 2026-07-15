# Finix API Integration Security Notes

## Credential Security
- `FINIX_USERNAME` and `FINIX_PASSWORD` are Basic Auth credentials — treat like passwords
- Never log these values, even partially
- Never include in client-side bundles — keep strictly server-side
- Rotate immediately if suspected compromise

## API Key Roles
- `ROLE_PARTNER` — required for creating identities, merchants, payment instruments
- `ROLE_PLATFORM` — higher privilege, platform-level operations
- `ROLE_MERCHANT` — merchant-scoped operations only
- Always use the minimum privilege role needed

## Live vs Sandbox Environments
- Live base URL: `https://finix.live-payments-api.com`
- Sandbox base URL: `https://finix.sandbox-payments-api.com`
- NEVER mix live credentials with sandbox URLs or vice versa
- Confirm `FINIX_ENV` matches the base URL in use

## Webhook Security
- Finix sends webhooks with an HMAC-SHA256 signature in the `Finix-Signature` header
- Always verify: `HMAC-SHA256(secret, body) === signature`
- Use `crypto.timingSafeEqual` for comparison (prevents timing attacks)
- Reject and log any webhook with invalid signature
- Store `FINIX_WEBHOOK_SECRET` in env — never hardcode

## Sensitive Data Handling
- Never log: card numbers, bank account numbers, SSNs, DOBs, tax IDs
- Log only: resource IDs (e.g. `IDxxx`, `MUxxx`, `APxxx`), status codes, timestamps
- PII in onboarding (name, address, DOB, SSN) must only flow to Finix — never stored raw in your DB

## Error Handling
- Finix errors contain `_embedded.errors[].message` — extract and humanize before showing to users
- Never surface raw Finix error responses to the client (may contain internal details)
- Log full Finix error responses server-side for debugging

## Idempotency
- For critical operations (creating identities, merchants), implement idempotency checks
- Check if a Finix resource already exists before creating a new one
- Store Finix resource IDs in your DB after creation to prevent duplicates

## Rate Limits
- Finix enforces rate limits per API key
- Implement exponential backoff on 429 responses
- Do not retry 4xx errors except 429

## Processor Values
- Sandbox: `DUMMY_V1`
- Live: `FINIX_V1` (standard) or `MASTERCARD_V1` (Mastercard acquiring)
- Current production config: `FINIX_V1`
