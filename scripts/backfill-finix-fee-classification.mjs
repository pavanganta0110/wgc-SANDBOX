/**
 * One-off backfill: fills FinixFee.category / FinixFee.feeSubtype for
 * historical rows synced before those columns existed. Pure DB read/write
 * — no Finix API calls — the original API response for every row is
 * already preserved in rawJsonRedacted (category/feeSubtype are never
 * stripped by redactFinixPayload, since neither key name matches its
 * sensitive-key pattern), so this just re-parses what's already stored.
 *
 * Safe to run more than once (idempotent — only touches rows where
 * category or feeSubtype is still null) and safe to run against either
 * database:
 *
 *   set -a; source .env.local; set +a
 *   node scripts/backfill-finix-fee-classification.mjs
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.finixFee.findMany({
    where: {
      rawJsonRedacted: { not: null },
      OR: [{ category: null }, { feeSubtype: null }],
    },
    select: { id: true, rawJsonRedacted: true },
  });

  console.log(`Found ${rows.length} FinixFee row(s) needing backfill.`);

  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const raw = row.rawJsonRedacted;
    if (!raw || typeof raw !== "object") {
      skipped++;
      continue;
    }
    const category = typeof raw.category === "string" ? raw.category : null;
    const feeSubtype = typeof raw.fee_subtype === "string" ? raw.fee_subtype : null;
    if (category === null && feeSubtype === null) {
      // Nothing to backfill for this row — its raw payload never had
      // either field (an older or differently-shaped Finix response).
      skipped++;
      continue;
    }
    await prisma.finixFee.update({
      where: { id: row.id },
      data: { category, feeSubtype },
    });
    updated++;
  }

  console.log(`Backfilled ${updated} row(s). Skipped ${skipped} (no category/fee_subtype in stored raw payload).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
