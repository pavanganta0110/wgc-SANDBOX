export class FinixClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly version: string;
  
  constructor() {
    this.baseUrl = process.env.FINIX_BASE_URL || "https://api-sandbox.finix.com";
    const username = process.env.FINIX_USERNAME || "";
    const password = process.env.FINIX_PASSWORD || "";
    
    if (!username || !password) {
      console.warn("Finix credentials (FINIX_USERNAME or FINIX_PASSWORD) are missing!");
    }
    
    this.authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    this.version = process.env.FINIX_VERSION || "2022-02-01";
  }

  private async fetchApi(path: string, options: RequestInit = {}) {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    
    const headers = {
      "Authorization": this.authHeader,
      "Accept": "application/hal+json",
      "Content-Type": "application/json",
      "Finix-Version": this.version,
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });
    
    // Parse response
    let data;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = text;
    }

    if (!res.ok) {
      const errorStr = typeof data === 'object' ? JSON.stringify(data) : data;
      console.error(`Finix API Error [${res.status}] on ${url}: ${errorStr}`);
      const err: any = new Error(`Finix Error: ${errorStr}`);
      err.details = typeof data === 'object' ? data : null;
      err.status = res.status;
      throw err;
    }

    return data;
  }

  // ==========================================
  // Onboarding (Direct API)
  // ==========================================

  async createAssociatedIdentity(identityId: string, payload: any) {
    return this.fetchApi(`/identities/${identityId}/associated_identities`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async createMerchant(identityId: string, processor: string) {
    return this.fetchApi(`/identities/${identityId}/merchants`, {
      method: "POST",
      body: JSON.stringify({ processor })
    });
  }

  async getVerification(verificationId: string) {
    return this.fetchApi(`/verifications/${verificationId}`);
  }

  // ==========================================
  // Identities
  // ==========================================

  async createSellerIdentity(payload: any) {
    return this.fetchApi("/identities", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  // Same /identities endpoint as createSellerIdentity — Finix identities
  // aren't typed as buyer/seller at creation time, only by how they're used
  // afterward (as a Transfer source vs a Merchant owner). Named separately
  // here for readability at donor-checkout call sites.
  async createBuyerIdentity(payload: { entity: Record<string, any> }) {
    return this.fetchApi("/identities", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async getIdentity(identityId: string) {
    return this.fetchApi(`/identities/${identityId}`);
  }

  async updateIdentity(identityId: string, payload: any) {
    return this.fetchApi(`/identities/${identityId}`, {
      method: "PUT", // or PATCH depending on Finix API version, generally PUT
      body: JSON.stringify(payload)
    });
  }

  async listIdentityMerchants(identityId: string) {
    return this.fetchApi(`/identities/${identityId}/merchants`);
  }

  async listIdentityPaymentInstruments(identityId: string) {
    return this.fetchApi(`/identities/${identityId}/payment_instruments`);
  }

  // Confirmed via Finix docs (docs.finix.com/api): GET /fees, filtered by
  // the Transfer or Authorization ID it's linked to.
  async listFeesForTransfer(transferId: string) {
    return this.fetchApi(`/fees?transfer=${transferId}`);
  }

  // ==========================================
  // Files and Evidence
  // ==========================================

  async createFileResource(payload: { display_name: string; linked_to: string; type: string }) {
    return this.fetchApi("/files", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async uploadFileContent(fileId: string, file: File) {
    const formData = new FormData();
    formData.append("file", file);

    const url = `${this.baseUrl}/files/${fileId}/upload`;
    
    const headers = {
      "Authorization": this.authHeader,
      "Accept": "application/hal+json",
      "Finix-Version": this.version,
    };

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: formData
    });

    let data;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = text;
    }

    if (!res.ok) {
      const errorStr = typeof data === 'object' ? JSON.stringify(data) : data;
      console.error(`Finix API Error [${res.status}] on ${url}: ${errorStr}`);
      throw new Error(`Finix Error: ${errorStr}`);
    }

    return data;
  }

  async createVerification(identityId: string) {
    return this.fetchApi(`/identities/${identityId}/verifications`, {
      method: "POST",
      body: JSON.stringify({})
    });
  }

  // ==========================================
  // Merchants
  // ==========================================

  async getMerchant(merchantId: string) {
    return this.fetchApi(`/merchants/${merchantId}`);
  }

  // ==========================================
  // Fee Profiles / Merchant Profiles (Pricing)
  // ==========================================

  // Confirmed against the real Finix sandbox: GET /merchants/{id} returns
  // "merchant_profile" (a Merchant Profile id). Docs.finix.com/api/fee-profiles.
  async getMerchantProfile(merchantProfileId: string) {
    return this.fetchApi(`/merchant_profiles/${merchantProfileId}`);
  }

  // Confirmed field names against a real fee_profiles response: basis_points
  // (card %, in basis points — divide by 100 for percent), fixed_fee (card
  // fixed fee in cents), ach_basis_points, ach_fixed_fee (cents).
  async getFeeProfile(feeProfileId: string) {
    return this.fetchApi(`/fee_profiles/${feeProfileId}`);
  }

  async listFeeProfiles() {
    return this.fetchApi("/fee_profiles");
  }

  // ==========================================
  // Payment Instruments
  // ==========================================

  async createPaymentInstrument(payload: any) {
    return this.fetchApi("/payment_instruments", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async getPaymentInstrument(instrumentId: string) {
    return this.fetchApi(`/payment_instruments/${instrumentId}`);
  }

  // ==========================================
  // Transfers (Payments)
  // ==========================================

  /**
   * Per Finix's request (docs.finix.com/guides/online-payments/idempotency
   * and .../fraud-and-risk/fraud-detection): every /transfers call must
   * include idempotency_id (a fresh UUID per request, protects against
   * duplicate charges on retry) and fraud_session_id (the session key
   * returned by Finix.js Auth on the buyer's checkout page — see
   * src/lib/finix/fraudSession.ts on the client side for how to obtain it).
   *
   * idempotency_id is auto-generated here if the caller doesn't supply one.
   * fraud_session_id is NOT auto-generated (it can only come from a real
   * buyer session) — this throws rather than silently omitting it, so a
   * future checkout integration can't accidentally ship without it.
   */
  async createTransfer(payload: { fraud_session_id: string; idempotency_id?: string; [key: string]: any }) {
    if (!payload.fraud_session_id) {
      throw new Error(
        "createTransfer requires fraud_session_id (from Finix.js Auth's getSessionKey() " +
          "on the buyer's checkout page). See src/lib/finix/fraudSession.ts."
      );
    }

    const body = {
      ...payload,
      idempotency_id: payload.idempotency_id ?? crypto.randomUUID(),
    };

    return this.fetchApi("/transfers", {
      method: "POST",
      body: JSON.stringify(body)
    });
  }

  async getTransfer(transferId: string) {
    return this.fetchApi(`/transfers/${transferId}`);
  }

  // ==========================================
  // Subscriptions (Recurring Giving)
  // ==========================================

  // Confirmed via docs.finix.com/guides/billing/subscriptions/creating-subscriptions:
  // POST /subscriptions with linked_to/linked_type pointing at the merchant,
  // buyer_details for the identity+instrument being charged, and
  // subscription_details.collection_method: "BILL_AUTOMATICALLY". Only
  // approved merchants on DUMMY_V1 or FINIX_V1 processors can subscribe.
  //
  // Confirmed against the real sandbox API: unlike every other endpoint in
  // this client, /subscriptions rejects our default "Accept: application/hal+json"
  // with a 406 "No acceptable representation" — it requires plain
  // "application/json". Overridden per-call rather than changing the
  // global default, since other endpoints depend on the HAL response shape
  // (_embedded, _links).
  async createSubscription(payload: {
    amount: number;
    currency: string;
    billing_interval: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
    linked_to: string;
    linked_type: "MERCHANT";
    buyer_details: { identity_id: string; instrument_id: string };
    subscription_details?: { collection_method: "BILL_AUTOMATICALLY" };
    tags?: Record<string, string>;
  }) {
    return this.fetchApi("/subscriptions", {
      method: "POST",
      headers: { Accept: "application/json" },
      body: JSON.stringify({
        subscription_details: { collection_method: "BILL_AUTOMATICALLY" },
        ...payload,
      })
    });
  }

  async getSubscription(subscriptionId: string) {
    return this.fetchApi(`/subscriptions/${subscriptionId}`, {
      headers: { Accept: "application/json" },
    });
  }

  // Confirmed against docs.finix.com/api/subscriptions: cancellation is
  // DELETE, not PUT with a state change.
  async cancelSubscription(subscriptionId: string) {
    return this.fetchApi(`/subscriptions/${subscriptionId}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
  }

  // ==========================================
  // Reversals (Refunds)
  // ==========================================

  async createTransferReversal(transferId: string, payload: any) {
    return this.fetchApi(`/transfers/${transferId}/reversals`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async listTransferReversals(transferId: string) {
    return this.fetchApi(`/transfers/${transferId}/reversals`);
  }

  // ==========================================
  // Settlements / Payouts (Stubs)
  // ==========================================

  async listSettlements(merchantId?: string) {
    return this.fetchApi(merchantId ? `/settlements?merchant=${merchantId}` : "/settlements");
  }
  
  async getSettlement(settlementId: string) {
    return this.fetchApi(`/settlements/${settlementId}`);
  }

  // Confirmed via Finix docs (docs.finix.com/api): GET /settlements/{id}/transfers
  // returns every Transfer (payment or refund/reversal) accrued into that
  // settlement batch.
  async listSettlementTransfers(settlementId: string) {
    return this.fetchApi(`/settlements/${settlementId}/transfers`);
  }

  // ==========================================
  // Disputes (Stubs)
  // ==========================================

  async listDisputes(merchantId?: string) {
    return this.fetchApi(merchantId ? `/disputes?merchant=${merchantId}` : "/disputes");
  }

  async getDispute(disputeId: string) {
    return this.fetchApi(`/disputes/${disputeId}`);
  }

  async listTransfersForMerchant(merchantId: string) {
    return this.fetchApi(`/transfers?merchant=${merchantId}`);
  }

  // Follows the same list-by-merchant convention already confirmed for
  // /transfers, /disputes, and /settlements.
  async listAuthorizationsForMerchant(merchantId: string) {
    return this.fetchApi(`/authorizations?merchant=${merchantId}`);
  }

  async getAuthorization(authorizationId: string) {
    return this.fetchApi(`/authorizations/${authorizationId}`);
  }
}

// Export a singleton instance for ease of use
export const finixClient = new FinixClient();

