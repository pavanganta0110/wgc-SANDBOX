import { prisma } from "@/lib/prisma";
import { revalidateAccountSelection, revalidatePurposeSelection } from "./resourceService";

export class ConfigurationValidationError extends Error {
  readonly code: "NOT_CONNECTED" | "INVALID_DEPOSIT_ACCOUNT" | "INVALID_EXPENSE_ACCOUNT" | "INVALID_DEFAULT_PURPOSE";
  constructor(code: ConfigurationValidationError["code"], message: string) {
    super(message);
    this.name = "ConfigurationValidationError";
    this.code = code;
  }
}

export interface SaveAccountConfigurationInput {
  depositAccountId: number;
  processingFeeExpenseAccountId: number;
  defaultPurposeId: number;
}

/**
 * Saves AplosAccountConfiguration. Every ID is revalidated server-side
 * against Aplos itself immediately before saving — the browser can never
 * cause an arbitrary/stale ID to be persisted (per the approved spec's
 * "Do not let the browser submit arbitrary account IDs without
 * server-side revalidation"). Requires the connection be CONNECTED
 * (enforced inside revalidateAccountSelection/revalidatePurposeSelection,
 * which themselves require a ready connection — see resourceService.ts).
 */
export async function saveAccountConfiguration(churchId: string, input: SaveAccountConfigurationInput): Promise<void> {
  const [deposit, expense, purpose] = await Promise.all([
    revalidateAccountSelection(churchId, input.depositAccountId, "deposit"),
    revalidateAccountSelection(churchId, input.processingFeeExpenseAccountId, "expense"),
    revalidatePurposeSelection(churchId, input.defaultPurposeId),
  ]);

  if (!deposit.success) throw new ConfigurationValidationError("INVALID_DEPOSIT_ACCOUNT", deposit.normalized.safeMessage);
  if (!expense.success) throw new ConfigurationValidationError("INVALID_EXPENSE_ACCOUNT", expense.normalized.safeMessage);
  if (!purpose.success) throw new ConfigurationValidationError("INVALID_DEFAULT_PURPOSE", purpose.normalized.safeMessage);

  await prisma.aplosAccountConfiguration.upsert({
    where: { churchId },
    create: {
      churchId,
      depositAccountId: String(deposit.data.account_number),
      depositAccountName: deposit.data.name,
      processingFeeExpenseAccountId: String(expense.data.account_number),
      processingFeeExpenseAccountName: expense.data.name,
      defaultPurposeId: String(purpose.data.id),
      defaultPurposeName: purpose.data.name,
    },
    update: {
      depositAccountId: String(deposit.data.account_number),
      depositAccountName: deposit.data.name,
      processingFeeExpenseAccountId: String(expense.data.account_number),
      processingFeeExpenseAccountName: expense.data.name,
      defaultPurposeId: String(purpose.data.id),
      defaultPurposeName: purpose.data.name,
    },
  });
}

export interface ConfigurationRevalidationResult {
  depositAccountValid: boolean;
  processingFeeExpenseAccountValid: boolean;
  defaultPurposeValid: boolean;
  errors: string[];
}

/**
 * Re-checks a church's already-saved account configuration against Aplos's
 * CURRENT resources — used by the "Refresh resources" action. Never
 * silently replaces a stale/missing selection; only reports validity so
 * the UI can surface it and block sync eligibility (see syncEligibility.ts)
 * until the merchant re-selects and re-saves.
 */
export async function revalidateSavedConfiguration(churchId: string): Promise<ConfigurationRevalidationResult | null> {
  const config = await prisma.aplosAccountConfiguration.findUnique({ where: { churchId } });
  if (!config) return null;

  const [deposit, expense, purpose] = await Promise.all([
    revalidateAccountSelection(churchId, Number(config.depositAccountId), "deposit"),
    revalidateAccountSelection(churchId, Number(config.processingFeeExpenseAccountId), "expense"),
    revalidatePurposeSelection(churchId, Number(config.defaultPurposeId)),
  ]);

  const errors: string[] = [];
  if (!deposit.success) errors.push(deposit.normalized.safeMessage);
  if (!expense.success) errors.push(expense.normalized.safeMessage);
  if (!purpose.success) errors.push(purpose.normalized.safeMessage);

  return {
    depositAccountValid: deposit.success,
    processingFeeExpenseAccountValid: expense.success,
    defaultPurposeValid: purpose.success,
    errors,
  };
}
