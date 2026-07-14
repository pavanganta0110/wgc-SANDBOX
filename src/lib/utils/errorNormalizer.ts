import { NextResponse } from "next/server";

export interface NormalizedError {
  title: string;
  safeMessage: string;
  category: string;
  retryable: boolean;
  supportReference: string | null;
  fieldErrors?: Record<string, string> | null;
}

export interface ErrorContext {
  requestId?: string;
  userId?: string;
  organizationId?: string;
  route?: string;
  action?: string;
  resourceId?: string;
}

// Generate a random unique reference code like WGC-7F3K92
export function generateSupportReference(): string {
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "WGC-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Recursively redact card numbers, bank routing/account info, security tokens, CVVs, and credentials
export function redactSensitiveData(obj: any): any {
  if (!obj) return obj;

  if (typeof obj === "string") {
    // Redact credit cards (13-19 digits)
    let s = obj.replace(/\b(?:\d[ -]*?){13,19}\b/g, "[REDACTED_CARD]");
    // Redact CVV (3-4 digits in standard context)
    s = s.replace(/\b\d{3,4}\b/g, "[REDACTED_CVV]");
    return s;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  if (typeof obj === "object") {
    // Prevent cycles
    const redacted: Record<string, any> = {};
    for (const [key, val] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("card") ||
        lowerKey.includes("pan") ||
        lowerKey.includes("cvv") ||
        lowerKey.includes("security") ||
        lowerKey.includes("password") ||
        lowerKey.includes("token") ||
        lowerKey.includes("routing") ||
        lowerKey.includes("account_number") ||
        lowerKey.includes("ssn") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("authorization")
      ) {
        redacted[key] = "[REDACTED_SENSITIVE]";
      } else {
        redacted[key] = redactSensitiveData(val);
      }
    }
    return redacted;
  }

  return obj;
}

// Centralized mapping of backend/processor conditions to safe messages
export function normalizeUserFacingError(error: any, context?: ErrorContext): NormalizedError {
  let rawMessage = "";
  if (typeof error === "string") {
    rawMessage = error;
  } else if (error instanceof Error) {
    rawMessage = error.message;
  } else if (error && typeof error === "object") {
    // Check for nested Finix error payloads
    const finixErr = error?.details?._embedded?.errors?.[0];
    rawMessage = finixErr?.failure_message || finixErr?.message || error.message || JSON.stringify(error);
  }

  const msg = rawMessage.toLowerCase();

  // 1. Wrong entity type for refund (e.g. type != TRANSFER)
  if (msg.includes("type != transfer") || msg.includes("not eligible for a refund")) {
    return {
      title: "Refund unavailable",
      safeMessage: "This transaction is not eligible for a refund.",
      category: "REFUND",
      retryable: false,
      supportReference: null,
    };
  }

  // 2. Already fully refunded
  if (msg.includes("already been fully refunded") || msg.includes("already refunded")) {
    return {
      title: "Refund unavailable",
      safeMessage: "This payment has already been fully refunded.",
      category: "REFUND",
      retryable: false,
      supportReference: null,
    };
  }

  // 3. Pending payment
  if (msg.includes("still processing") || msg.includes("pending") || msg.includes("processing")) {
    return {
      title: "Refund unavailable",
      safeMessage: "This payment is still processing and cannot be refunded yet.",
      category: "REFUND",
      retryable: false,
      supportReference: null,
    };
  }

  // 4. Failed payment
  if (msg.includes("failed payment") || msg.includes("payment is failed") || msg.includes("failed")) {
    return {
      title: "Refund unavailable",
      safeMessage: "Failed payments cannot be refunded.",
      category: "REFUND",
      retryable: false,
      supportReference: null,
    };
  }

  // 5. Refund amount too large
  if (msg.includes("exceed") || msg.includes("greater than") || msg.includes("refundable balance")) {
    return {
      title: "Check refund amount",
      safeMessage: "The refund amount cannot exceed the remaining refundable balance.",
      category: "REFUND",
      retryable: false,
      supportReference: null,
    };
  }

  // 6. Bank payment returned
  if (msg.includes("returned") || msg.includes("bank return") || msg.includes("chargeback")) {
    return {
      title: "Refund unavailable",
      safeMessage: "This bank payment was returned and is no longer refundable.",
      category: "REFUND",
      retryable: false,
      supportReference: null,
    };
  }

  // 7. Permission failure
  if (msg.includes("unauthorized") || msg.includes("permission") || msg.includes("forbidden") || msg.includes("access denied")) {
    return {
      title: "Access denied",
      safeMessage: "You do not have permission to perform this action.",
      category: "PERMISSION",
      retryable: false,
      supportReference: null,
    };
  }

  // 8. Tenant mismatch or Record not found
  if (msg.includes("not found") || msg.includes("tenant mismatch") || msg.includes("could not be found")) {
    return {
      title: "Record unavailable",
      safeMessage: "This record could not be found.",
      category: "SYSTEM",
      retryable: false,
      supportReference: null,
    };
  }

  // 9. Rate limit
  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("429")) {
    return {
      title: "Please wait",
      safeMessage: "Too many requests were made. Please try again shortly.",
      category: "SYSTEM",
      retryable: true,
      supportReference: null,
    };
  }

  // 10. Network failure
  if (msg.includes("network") || msg.includes("fetch failed") || msg.includes("timeout") || msg.includes("connect")) {
    return {
      title: "Connection problem",
      safeMessage: "We could not reach the service. Please check your connection and try again.",
      category: "SYSTEM",
      retryable: true,
      supportReference: null,
    };
  }

  // 11. Unknown / unexpected server error -> Generate a secure support reference code
  const supportRef = generateSupportReference();
  
  // Log detailed technical details with redaction to secure server logs
  const redactedError = redactSensitiveData(error);
  const logBlock = {
    supportReference: supportRef,
    timestamp: new Date().toISOString(),
    context: context ? redactSensitiveData(context) : {},
    error: redactedError instanceof Error ? { message: redactedError.message, stack: redactedError.stack } : redactedError,
  };
  
  console.error("[WGC-SECURE-ERROR-LOG]", JSON.stringify(logBlock));

  return {
    title: "Something went wrong",
    safeMessage: `We could not complete your request. Please try again. If the problem continues, contact WGC Support and provide reference ${supportRef}.`,
    category: "SYSTEM",
    retryable: false,
    supportReference: supportRef,
  };
}

// Convert a normalized error into a clean server response without exposing any processor response details
export function toSafeErrorResponse(error: any, status = 500, context?: ErrorContext) {
  const normalized = normalizeUserFacingError(error, context);
  return NextResponse.json(
    {
      error: {
        code: normalized.category === "REFUND" ? "REFUND_NOT_ELIGIBLE" : "SYSTEM_ERROR",
        message: normalized.safeMessage,
        reference: normalized.supportReference,
        title: normalized.title,
      },
    },
    { status }
  );
}

export interface PaymentErrorResponse {
  success: false;
  code: "PAYMENT_FAILED" | "PAYMENT_STATUS_UNCERTAIN" | "PAYMENT_CONFIGURATION_ERROR" | "VALIDATION_ERROR";
  message: string;
  reference: string;
  retryable: boolean;
}

export function toSafePaymentErrorResponse(
  error: any,
  code: PaymentErrorResponse["code"],
  defaultMessage: string,
  retryable: boolean,
  context?: ErrorContext
) {
  const supportRef = generateSupportReference();
  const redactedError = redactSensitiveData(error);
  const logBlock = {
    supportReference: supportRef,
    timestamp: new Date().toISOString(),
    context: context ? redactSensitiveData(context) : {},
    error: redactedError instanceof Error ? { message: redactedError.message, stack: redactedError.stack } : redactedError,
  };
  console.error("[WGC-SECURE-PAYMENT-ERROR]", JSON.stringify(logBlock));

  // Determine if it was a network timeout or abort
  if (error instanceof Error || (error && typeof error === "object")) {
    const msg = String(error.message || JSON.stringify(error)).toLowerCase();
    if (msg.includes("timeout") || msg.includes("abort") || msg.includes("econnreset") || msg.includes("network")) {
      return NextResponse.json(
        {
          success: false,
          code: "PAYMENT_STATUS_UNCERTAIN",
          message: "We’re confirming your payment. Please do not submit another payment.",
          reference: supportRef,
          retryable: false,
        },
        { status: 503 }
      );
    }
  }

  return NextResponse.json(
    {
      success: false,
      code,
      message: `${defaultMessage} (DEBUG: ${error instanceof Error ? error.message : (error?.details?._embedded?.errors?.[0]?.message || JSON.stringify(error))})`,
      reference: supportRef,
      retryable,
    },
    { status: code === "VALIDATION_ERROR" ? 400 : 402 }
  );
}
