import { prisma } from "@/lib/prisma";
import { ManualCredentialAuthProvider } from "./authProvider";
import { decryptStoredCredential } from "./connectionService";
import { listPurposes } from "./purposes";
import { listAccounts, isDepositAccountEligible, isProcessingFeeExpenseAccountEligible } from "./accounts";
import { listFunds } from "./funds";
import { AplosResourceError } from "./resourceClient";
import type { NormalizedAplosError } from "./errors";
import type { AplosAccount, AplosFund, AplosPurpose } from "./types";

/**
 * Orchestration layer between the resource routes and the low-level
 * purposes/accounts/funds clients — resolves a church's stored connection
 * to a real, freshly obtained access token (never a browser-supplied one),
 * requires the connection to be CONNECTED, and normalizes failures.
 */

export class AplosConnectionNotReadyError extends Error {
  constructor() {
    super("This organization's Aplos connection is not active. Connect and verify Aplos before retrieving resources.");
    this.name = "AplosConnectionNotReadyError";
  }
}

export interface ResourceFetchResult<T> {
  success: true;
  data: T;
}
export interface ResourceFetchFailure {
  success: false;
  normalized: NormalizedAplosError;
}

async function getReadyConnectionToken(churchId: string): Promise<{ token: string; aplosAccountId: string }> {
  const connection = await prisma.aplosConnection.findUnique({
    where: { churchId },
    select: { status: true, aplosOrganizationId: true },
  });
  if (!connection || connection.status !== "CONNECTED" || !connection.aplosOrganizationId) {
    throw new AplosConnectionNotReadyError();
  }

  const credentials = await decryptStoredCredential(churchId);
  // Ephemeral, single-use provider per call — matches connectionService.ts's
  // runAplosVerification, not the long-lived cached instance a future sync
  // engine would use.
  const authProvider = new ManualCredentialAuthProvider(async () => credentials);
  const { token } = await authProvider.getAccessToken(churchId);
  return { token, aplosAccountId: connection.aplosOrganizationId };
}

async function withResourceErrorHandling<T>(fn: () => Promise<T>): Promise<ResourceFetchResult<T> | ResourceFetchFailure> {
  try {
    return { success: true, data: await fn() };
  } catch (err) {
    if (err instanceof AplosResourceError) return { success: false, normalized: err.normalized };
    if (err instanceof AplosConnectionNotReadyError) {
      return { success: false, normalized: { category: "INVALID_CONFIGURATION", retryable: false, safeMessage: err.message } };
    }
    const normalized = (err as { normalized?: NormalizedAplosError })?.normalized;
    if (normalized) return { success: false, normalized };
    return { success: false, normalized: { category: "UNKNOWN_ERROR", retryable: false, safeMessage: "An unexpected error occurred retrieving Aplos resources." } };
  }
}

export async function fetchChurchPurposes(churchId: string): Promise<ResourceFetchResult<AplosPurpose[]> | ResourceFetchFailure> {
  return withResourceErrorHandling(async () => {
    const { token, aplosAccountId } = await getReadyConnectionToken(churchId);
    return listPurposes(token, aplosAccountId);
  });
}

export async function fetchChurchAccounts(
  churchId: string,
  filter?: "deposit" | "expense"
): Promise<ResourceFetchResult<AplosAccount[]> | ResourceFetchFailure> {
  return withResourceErrorHandling(async () => {
    const { token, aplosAccountId } = await getReadyConnectionToken(churchId);
    const accounts = await listAccounts(token, aplosAccountId);
    if (filter === "deposit") return accounts.filter(isDepositAccountEligible);
    if (filter === "expense") return accounts.filter(isProcessingFeeExpenseAccountEligible);
    return accounts;
  });
}

export async function fetchChurchFunds(churchId: string): Promise<ResourceFetchResult<AplosFund[]> | ResourceFetchFailure> {
  return withResourceErrorHandling(async () => {
    const { token, aplosAccountId } = await getReadyConnectionToken(churchId);
    return listFunds(token, aplosAccountId);
  });
}

/**
 * Confirms a specific account_number is currently a real, eligible Aplos
 * account of the required category — used before saving
 * AplosAccountConfiguration so the browser can never submit an arbitrary
 * account ID without server-side revalidation against Aplos itself.
 */
export async function revalidateAccountSelection(
  churchId: string,
  accountNumber: number,
  requiredCategory: "deposit" | "expense"
): Promise<ResourceFetchResult<AplosAccount> | ResourceFetchFailure> {
  const result = await fetchChurchAccounts(churchId, requiredCategory);
  if (!result.success) return result;
  const match = result.data.find((a) => a.account_number === accountNumber);
  if (!match) {
    return {
      success: false,
      normalized: {
        category: "VALIDATION_ERROR",
        retryable: false,
        safeMessage: `Account ${accountNumber} is not a currently eligible ${requiredCategory} account in Aplos.`,
      },
    };
  }
  return { success: true, data: match };
}

/** Same revalidation guarantee as revalidateAccountSelection, for a Purpose
 * id (used both for fund-mapping saves and the configured default Purpose). */
export async function revalidatePurposeSelection(
  churchId: string,
  purposeId: number
): Promise<ResourceFetchResult<AplosPurpose> | ResourceFetchFailure> {
  const result = await fetchChurchPurposes(churchId);
  if (!result.success) return result;
  const match = result.data.find((p) => p.id === purposeId);
  if (!match) {
    return {
      success: false,
      normalized: { category: "VALIDATION_ERROR", retryable: false, safeMessage: `Purpose ${purposeId} does not currently exist or is not enabled in Aplos.` },
    };
  }
  return { success: true, data: match };
}
