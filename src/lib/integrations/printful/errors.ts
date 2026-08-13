export class PrintfulConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintfulConfigError";
  }
}

export class PrintfulConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrintfulConnectionError";
  }
}

export class PrintfulApiError extends Error {
  status?: number;
  details?: unknown;
  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = "PrintfulApiError";
    this.status = status;
    this.details = details;
  }
}

export class ProductUnavailableError extends Error {
  constructor(message = "This product is no longer available.") {
    super(message);
    this.name = "ProductUnavailableError";
  }
}

export class VariantUnavailableError extends Error {
  constructor(message = "This variant is no longer available.") {
    super(message);
    this.name = "VariantUnavailableError";
  }
}

export class ShippingUnavailableError extends Error {
  constructor(message = "Shipping is not available for this address.") {
    super(message);
    this.name = "ShippingUnavailableError";
  }
}

export class OrderSubmissionError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "OrderSubmissionError";
    this.retryable = retryable;
  }
}

/**
 * Maps any internal error to a safe, generic donor/merchant-facing message —
 * never surfaces raw provider/API error text (spec item 63). Detailed
 * errors should already have been console.error'd by the caller before this
 * is used to build the HTTP response.
 */
export function toSafeMerchandiseErrorMessage(err: unknown): string {
  if (err instanceof ProductUnavailableError) return err.message;
  if (err instanceof VariantUnavailableError) return err.message;
  if (err instanceof ShippingUnavailableError) return err.message;
  if (err instanceof OrderSubmissionError) return "We could not submit your order for fulfillment. Please try again.";
  if (err instanceof PrintfulConnectionError) return "This organization's merchandise store is temporarily unavailable.";
  if (err instanceof PrintfulConfigError) return "Merchandise is not available right now.";
  return "Something went wrong processing your order. Please try again.";
}
