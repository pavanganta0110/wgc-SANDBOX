# Prisma ORM Security Best Practices

## Parameterized Queries (Default — Always Use)
Prisma's standard query API is safe from SQL injection by default:
```ts
// ✅ SAFE — parameterized automatically
const user = await prisma.user.findUnique({ where: { email: userInput } });

// ❌ DANGEROUS — never do this
const user = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE email = '${userInput}'`);
```

## Raw Query Safety
If raw SQL is absolutely necessary:
```ts
// ✅ SAFE — use $queryRaw with template literals (Prisma sanitizes)
const result = await prisma.$queryRaw`SELECT * FROM users WHERE email = ${userInput}`;

// ❌ DANGEROUS
const result = await prisma.$queryRawUnsafe(`SELECT * FROM users WHERE id = ${id}`);
```

## Transaction Safety
Always use transactions for multi-step operations (e.g. onboarding):
```ts
await prisma.$transaction(async (tx) => {
  const app = await tx.application.create({ data: {...} });
  const identity = await tx.finixIdentity.create({ data: { applicationId: app.id, ...} });
  return { app, identity };
});
```

## Sensitive Fields
- Never return password hashes, SSNs, or raw payment data in API responses
- Use `select` to explicitly choose returned fields:
```ts
const user = await prisma.user.findUnique({
  where: { id },
  select: { id: true, email: true, name: true }  // never select: passwordHash
});
```

## Connection Security
- Use `DATABASE_URL` with SSL: append `?sslmode=require` for Supabase
- Use `DIRECT_URL` for Prisma migrations (bypasses connection pooler)
- Never expose `DATABASE_URL` to client — keep strictly server-side

## Migrations
- Review every migration before applying — especially `DROP TABLE`, `DROP COLUMN`
- Run migrations in a transaction when possible
- Test migrations on staging before production
- Keep migration history in git

## N+1 Query Prevention
```ts
// ❌ N+1 — fetches each merchant separately
const apps = await prisma.application.findMany();
for (const app of apps) {
  const merchant = await prisma.merchant.findUnique({ where: { applicationId: app.id } });
}

// ✅ Single query with include
const apps = await prisma.application.findMany({
  include: { merchant: true }
});
```

## Pagination Safety
Always paginate large queries to prevent memory exhaustion:
```ts
const records = await prisma.application.findMany({
  take: Math.min(limit, 100),  // cap at 100
  skip: offset,
  orderBy: { createdAt: 'desc' }
});
```
