# OWASP Top 10 (2021) — Audit Checklist

## A01 — Broken Access Control
- [ ] All API routes enforce authentication before processing
- [ ] Admin routes blocked for non-admin users
- [ ] No IDOR — resource ownership verified server-side
- [ ] Directory listing disabled
- [ ] CORS policy is restrictive (not `*` in production)
- [ ] JWT claims validated server-side on every request

## A02 — Cryptographic Failures
- [ ] No sensitive data transmitted over HTTP
- [ ] Passwords hashed with bcrypt/argon2 (not MD5/SHA1)
- [ ] Secrets not stored in client-accessible locations
- [ ] TLS 1.2+ enforced
- [ ] No hardcoded cryptographic keys

## A03 — Injection
- [ ] All DB queries use parameterized queries / ORM (Prisma)
- [ ] No raw SQL string interpolation
- [ ] User input not passed to shell commands
- [ ] GraphQL/NoSQL queries parameterized
- [ ] Template injection prevented

## A04 — Insecure Design
- [ ] Rate limiting on all public endpoints
- [ ] Anti-automation on auth endpoints (CAPTCHA or similar)
- [ ] Business logic validated server-side
- [ ] Financial amounts validated and not tampered with client-side

## A05 — Security Misconfiguration
- [ ] No default credentials in production
- [ ] Debug mode disabled in production (`NODE_ENV=production`)
- [ ] Security headers set (see infrastructure review)
- [ ] Error messages don't leak stack traces
- [ ] Unnecessary endpoints/routes removed or protected

## A06 — Vulnerable and Outdated Components
- [ ] `npm audit` passes with no high/critical CVEs
- [ ] All dependencies on current major versions
- [ ] No abandoned packages (last publish > 2 years)

## A07 — Identification and Authentication Failures
- [ ] Brute-force protection on login
- [ ] Session tokens invalidated on logout
- [ ] Passwords meet minimum complexity
- [ ] Multi-factor auth available for admin accounts
- [ ] Session expiry enforced

## A08 — Software and Data Integrity Failures
- [ ] Subresource integrity (SRI) for external scripts
- [ ] No `eval()` or dynamic code execution
- [ ] Webhook signatures verified (HMAC)
- [ ] CI/CD pipeline secrets not exposed in logs

## A09 — Security Logging and Monitoring Failures
- [ ] Auth events logged (login, logout, failure)
- [ ] Payment events logged with non-sensitive identifiers
- [ ] No PII or secrets in logs
- [ ] Alerts on repeated auth failures

## A10 — Server-Side Request Forgery (SSRF)
- [ ] No user-controlled URLs fetched server-side without allowlist
- [ ] Internal metadata endpoints not reachable from API
- [ ] Outbound requests limited to known domains
