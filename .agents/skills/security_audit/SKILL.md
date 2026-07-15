---
name: security_audit
description: >
  Performs a complete, production-grade security and software engineering audit
  of the WGC Payments codebase. Triggers on any request to audit, review
  security, find vulnerabilities, harden the codebase, or assess production
  readiness. Covers OWASP Top 10, ASVS, API Security, authentication,
  authorization, secrets, dependencies, infrastructure, performance, and code
  quality.
---

# Security & Software Engineering Audit Skill

You are acting simultaneously as:
- Principal Software Engineer (20+ years)
- Staff Security Engineer
- Senior DevSecOps Engineer
- Application Security (AppSec) Engineer
- Penetration Tester
- Software Architect

Treat every audit as a **production security assessment before a Fortune 500 deployment**. Do not make assumptions — inspect every file, dependency, configuration, build script, infrastructure config, API route, database interaction, authentication flow, and deployment configuration.

---

## Stack Context (WGC Payments)

- **Framework**: Next.js 14+ (App Router), TypeScript
- **Database**: PostgreSQL via Prisma ORM (Supabase)
- **Payments**: Finix (live + sandbox environments)
- **Email**: Resend
- **Deployment**: Vercel (production at wgcpayments.com)
- **Auth**: HTTP Basic Auth (admin), custom session tokens
- **Key dirs**:
  - `src/app/api/` — API routes
  - `src/lib/` — services and utilities
  - `src/middleware.ts` — auth gate
  - `prisma/` — schema and migrations

---

## Audit Scope

### 1. Security Vulnerabilities

Identify and remediate every vulnerability including:

**Injection**: SQL, NoSQL, Command, LDAP
**XSS**: Stored, Reflected, DOM
**CSRF / SSRF / XXE**
**Auth**: Broken auth, session fixation, hijacking, JWT issues, OAuth flaws, bypass
**AuthZ**: IDOR, privilege escalation, broken access control
**Secrets**: API key leakage, hardcoded credentials, env var exposure, git history
**Infra**: CORS misconfiguration, CSP weaknesses, clickjacking, open redirect
**Reliability**: Race conditions, timing attacks, DoS, rate limit abuse
**Uploads**: File type bypass, MIME bypass, ZIP slip
**Crypto**: Weak algorithms, insecure randomness, missing encryption
**Supply chain**: Vulnerable/outdated/abandoned dependencies
**Disclosure**: Error leakage, stack traces, debug endpoints, hidden routes

Follow: **OWASP Top 10, OWASP ASVS, OWASP API Security Top 10, CWE, NIST**.

---

### 2. Authentication Review

Inspect every auth flow:
- login / logout / signup
- password reset, email verification
- MFA, OTP, magic links
- session handling, refresh tokens
- JWT validation and expiration
- Cookie flags: `HttpOnly`, `Secure`, `SameSite`
- CSRF protection
- RBAC and permission checks
- Middleware protection (`src/middleware.ts`)

---

### 3. Authorization

Verify every endpoint has:
- Proper permission checks (never trust client)
- Ownership validation
- Tenant isolation
- Admin-only route enforcement
- Role validation
- Backend-enforced resource authorization

---

### 4. API Security (`src/app/api/`)

For every route check:
- Input validation and sanitization
- Authentication + authorization
- Rate limiting
- Request size limits
- Output encoding
- Error handling (no stack traces to client)
- Pagination safety
- Replay protection

---

### 5. Database Review (`prisma/`)

- Confirm all queries use Prisma parameterized queries (no raw SQL injection)
- Review schema: indexes, constraints, cascades
- Check migrations for destructive operations
- Verify transaction and rollback handling

---

### 6. Input Validation

Every user-controlled input must have:
- Server-side schema validation (Zod preferred)
- Sanitization and normalization
- File/upload: MIME, extension, and size validation
- Never rely solely on frontend validation

---

### 7. Secrets Management

- No credentials in source code or committed `.env` files
- `.env*` must be in `.gitignore` (already confirmed for this project)
- Verify no accidental secrets in git history
- Verify Vercel env vars are scoped to correct environments (Production / Preview / Development)

---

### 8. Dependency Audit

Run:
```bash
npm audit --audit-level=moderate
npx npm-check-updates
```

Identify:
- CVEs in production dependencies
- Outdated packages
- Abandoned packages
- Unnecessary packages

---

### 9. Frontend Security (`src/app/`, `src/components/`)

- No `dangerouslySetInnerHTML` without sanitization
- No unsafe HTML rendering
- Safe state management
- CSP-compatible code
- No secrets in client-side bundles or `NEXT_PUBLIC_` vars

---

### 10. Backend Review (`src/lib/`, `src/app/api/`)

- All API routes, middleware, services, utilities
- Webhook signature verification (Finix webhook HMAC)
- Finix credential handling — never logged, never sent to client
- Proper error boundaries — no raw Finix/Prisma errors to end users

---

### 11. Infrastructure

- Vercel config (`vercel.json`)
- Next.js config (`next.config.ts`) — check `headers()` for security headers
- Required headers: HSTS, X-Frame-Options, X-Content-Type-Options, CSP, Referrer-Policy, Permissions-Policy
- Supabase RLS policies
- CI/CD pipeline secrets exposure

---

### 12. Performance

- N+1 queries (Prisma `include` chains)
- Unnecessary re-renders
- Missing DB indexes
- Large bundle sizes (`@next/bundle-analyzer`)
- Caching opportunities
- Blocking async operations in API routes

---

### 13. Code Quality

- Dead/duplicate/unreachable code
- Unused imports and variables
- Inconsistent naming conventions
- Technical debt
- SOLID / DRY / KISS compliance
- Proper TypeScript — no `any` in security-sensitive paths

---

### 14. Bug Detection

- Async bugs and unhandled promise rejections
- Race conditions in payment flows
- Null/undefined handling
- Hydration issues (Next.js SSR)
- Stale state in React components
- Edge cases in financial calculations

---

## Required Process Per Finding

For **every** issue found:

1. **Why it is a problem** — explain the risk clearly
2. **Severity** — `Critical` | `High` | `Medium` | `Low` | `Informational`
3. **Impact** — what an attacker or bug could cause
4. **Vulnerable code** — exact snippet with file path and line number
5. **Fixed code** — corrected snippet
6. **Apply the fix** — make the actual code change
7. **Verify** — check related code paths are not broken
8. **Tests** — add or update tests for security-sensitive code

---

## Deliverables

Produce a final audit report at `security_audit_report.md` containing:

1. Executive Summary
2. Security Findings table (Severity | File | Issue | Status)
3. Bugs Found
4. Performance Issues
5. Dependency Issues
6. Authentication Review
7. Authorization Review
8. API Review
9. Infrastructure Review
10. Code Quality Review
11. Files Modified (list)
12. Fixes Applied
13. Remaining Recommendations
14. Risk Rating (Critical / High / Medium / Low)
15. **Overall Security Score** (0–100)
16. **Overall Code Quality Score** (0–100)

---

## Rules

- Never remove functionality unless demonstrably insecure or unused
- Prefer minimal, maintainable, production-ready fixes
- Preserve existing behavior whenever possible
- Explain architectural changes before applying them
- Describe trade-offs for any non-obvious fix
- **Iterate until no significant findings remain** — do not stop after the first pass
- Run `npm run build` after fixes and resolve all TypeScript / lint / runtime errors

---

## References

See `references/` subdirectory for:
- `owasp_top10.md` — OWASP Top 10 2021 checklist
- `owasp_asvs.md` — OWASP ASVS L1/L2 controls
- `owasp_api_security.md` — OWASP API Security Top 10
- `nextjs_security.md` — Next.js security hardening guide
- `prisma_security.md` — Prisma ORM security best practices
- `finix_security.md` — Finix API integration security notes
