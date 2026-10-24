import type { ErrorCode } from "@bc/shared";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const STATUS: Record<ErrorCode, ContentfulStatusCode> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  VALIDATION_ERROR: 400,
  UPSTREAM_TERAC: 502,
  UPSTREAM_WHOP: 502,
  RATE_LIMITED: 429,
};

/** Error con el formato del doc 07: { error: { code, message, details } }. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  get status() {
    return STATUS[this.code];
  }

  toJSON() {
    return { error: { code: this.code, message: this.message, details: this.details } };
  }
}
