export type AuthoringErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "IMMUTABLE_VERSION"
  | "BLOCKING_ISSUES"
  | "STORAGE"
  | "EXPORT";

export class AuthoringError extends Error {
  public readonly code: AuthoringErrorCode;

  public readonly details?: Record<string, unknown>;

  constructor(code: AuthoringErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AuthoringError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toJSON(): {
    name: string;
    code: AuthoringErrorCode;
    message: string;
    details?: Record<string, unknown>;
  } {
    const payload: {
      name: string;
      code: AuthoringErrorCode;
      message: string;
      details?: Record<string, unknown>;
    } = {
      name: this.name,
      code: this.code,
      message: this.message,
    };

    if (this.details !== undefined) {
      payload.details = this.details;
    }

    return payload;
  }
}
