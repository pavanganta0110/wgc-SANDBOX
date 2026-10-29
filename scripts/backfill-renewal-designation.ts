/**
 * One-time repair: give recurring renewals created before the designation fix
 * their subscription's fund. Dry run by default.
 *
 *   npx tsx scripts/backfill-renewal-designation.ts                      # count only
 *   npx tsx scripts/backfill-renewal-designation.ts --church <churchId>  # count one church
 *   npx tsx scripts/backfill-renewal-designation.ts --apply --confirm-host <db-host>
 *
 * Applying requires typing the database host you mean to change, so a script
 * run can never silently write to the wrong database (Prisma falls back to
 * .env, which may not be the database you expect — check the host printed first).
 */
import { backfillRenewalDesignation } from "../src/lib/subscriptions/backfillRenewalDesignation";

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function databaseHost(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set.");
  return new URL(raw).host;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const churchId = argValue("--church");
  const host = databaseHost();
  console.log(`Database host: ${host}`);

  if (apply && argValue("--confirm-host") !== host) {
    console.error(`Refusing to write. Re-run with --confirm-host ${host} if that is the database you mean to change.`);
    process.exit(1);
  }

  const result = await backfillRenewalDesignation({ apply, churchId });
  console.log(result.dryRun ? "DRY RUN — nothing was changed." : "APPLIED.");
  console.log(`Subscriptions with a fund: ${result.subscriptionsWithFund}`);
  console.log(`Renewal payments ${result.dryRun ? "that would be updated" : "updated"}: ${result.paymentsAffected}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
