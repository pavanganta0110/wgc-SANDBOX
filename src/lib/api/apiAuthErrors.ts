import type { ApiErrorType } from "@/lib/api/response";

export class ApiAuthError extends Error {
  readonly type: ApiErrorType;
  constructor(type: ApiErrorType, message: string) {
    super(message);
    this.name = "ApiAuthError";
    this.type = type;
  }
}
