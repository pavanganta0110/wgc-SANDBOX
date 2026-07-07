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
      throw new Error(`Finix Error: ${errorStr}`);
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

  // ==========================================
  // Merchants
  // ==========================================

  async getMerchant(merchantId: string) {
    return this.fetchApi(`/merchants/${merchantId}`);
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

  async createTransfer(payload: any) {
    return this.fetchApi("/transfers", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async getTransfer(transferId: string) {
    return this.fetchApi(`/transfers/${transferId}`);
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
}

// Export a singleton instance for ease of use
export const finixClient = new FinixClient();

