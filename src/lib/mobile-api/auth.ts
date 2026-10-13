import type { MobileApiErrorResponse } from "./contracts";

export class MobileApiUnauthorizedError extends Error {
  readonly httpStatus = 401;

  constructor() {
    super("Unauthorized");
    this.name = "MobileApiUnauthorizedError";
  }
}

export class MobileApiValidationError extends Error {
  readonly httpStatus = 400;

  constructor(message: string) {
    super(message);
    this.name = "MobileApiValidationError";
  }
}

export class MobileApiNotFoundError extends Error {
  readonly httpStatus = 404;

  constructor(message = "El recurso ya no está disponible.") {
    super(message);
    this.name = "MobileApiNotFoundError";
  }
}

export class MobileApiConflictError extends Error {
  readonly httpStatus = 409;

  constructor(
    message: string,
    public readonly code:
      | "IDEMPOTENCY_KEY_REUSED"
      | "ACTIVE_SESSION_EXISTS"
      | "ROUTINE_LIST_CHANGED"
      | "ROUTINE_CHANGED"
      | "EXERCISE_CHANGED"
      | "ROUTINE_TEMPLATE_CHANGED"
      | "SESSION_EXERCISE_CHANGED"
      | "SESSION_CHANGED"
      | "SESSION_CLOSED"
      | "SESSION_EXERCISE_REMOVED"
      | "SESSION_EXERCISE_ALREADY_EXISTS"
      | "NO_COMPLETED_SETS"
      | "SESSION_NOT_COMPLETED"
      | "SESSION_DISCARDED" =
      "IDEMPOTENCY_KEY_REUSED",
  ) {
    super(message);
    this.name = "MobileApiConflictError";
  }
}

export function isRejectedMobileAccessToken(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown; status?: unknown };
  const code = typeof record.code === "string"
    ? record.code.toLowerCase()
    : "";
  return (
    Number(record.status) === 401 ||
    code === "bad_jwt" ||
    code === "invalid_jwt" ||
    code === "user_not_found"
  );
}

export function mobileBearerToken(authorization: string | null): string {
  if (!authorization || authorization.length > 8_192) {
    throw new MobileApiUnauthorizedError();
  }

  const match = /^Bearer ([^\s]+)$/i.exec(authorization);
  if (!match?.[1]) {
    throw new MobileApiUnauthorizedError();
  }

  return match[1];
}

export type MobileAuthenticatedHandlerResult<T> =
  | { status: 200; body: T }
  | { status: 400 | 401 | 503; body: MobileApiErrorResponse };

export async function handleMobileAuthenticatedRequest<TContext, TBody>(
  authorization: string | null,
  dependencies: {
    authenticate: (accessToken: string) => Promise<TContext>;
    read: (context: TContext) => Promise<TBody>;
  },
): Promise<MobileAuthenticatedHandlerResult<TBody>> {
  try {
    const accessToken = mobileBearerToken(authorization);
    const context = await dependencies.authenticate(accessToken);
    return { status: 200, body: await dependencies.read(context) };
  } catch (error) {
    if (error instanceof MobileApiUnauthorizedError) {
      return { status: 401, body: { error: "UNAUTHORIZED" } };
    }
    if (error instanceof MobileApiValidationError) {
      return {
        status: 400,
        body: { error: "VALIDATION_ERROR", message: error.message },
      };
    }
    return { status: 503, body: { error: "DATA_UNAVAILABLE" } };
  }
}

export type MobileAuthenticatedResourceHandlerResult<T> =
  | { status: 200; body: T }
  | { status: 400 | 401 | 404 | 503; body: MobileApiErrorResponse };

export async function handleMobileAuthenticatedResourceRequest<TContext, TBody>(
  authorization: string | null,
  dependencies: {
    authenticate: (accessToken: string) => Promise<TContext>;
    read: (context: TContext) => Promise<TBody>;
  },
): Promise<MobileAuthenticatedResourceHandlerResult<TBody>> {
  try {
    const accessToken = mobileBearerToken(authorization);
    const context = await dependencies.authenticate(accessToken);
    return { status: 200, body: await dependencies.read(context) };
  } catch (error) {
    if (error instanceof MobileApiUnauthorizedError) {
      return { status: 401, body: { error: "UNAUTHORIZED" } };
    }
    if (error instanceof MobileApiValidationError) {
      return {
        status: 400,
        body: { error: "VALIDATION_ERROR", message: error.message },
      };
    }
    if (error instanceof MobileApiNotFoundError) {
      return {
        status: 404,
        body: { error: "NOT_FOUND", message: error.message },
      };
    }
    return { status: 503, body: { error: "DATA_UNAVAILABLE" } };
  }
}

export type MobileExplicitMutationHandlerResult<T> =
  | { status: 200 | 201 | 409; body: T }
  | {
      status: 409;
      body: {
        status: "conflict";
        code: "IDEMPOTENCY_KEY_REUSED";
        message: string;
      };
    }
  | { status: 400 | 401 | 404 | 409 | 503; body: MobileApiErrorResponse };

/** Used when the successful domain contract itself can be a 409 response. */
export async function handleMobileExplicitMutationRequest<TContext, TBody>(
  authorization: string | null,
  dependencies: {
    authenticate: (accessToken: string) => Promise<TContext>;
    mutate: (
      context: TContext,
    ) => Promise<{ status: 200 | 201 | 409; body: TBody }>;
  },
): Promise<MobileExplicitMutationHandlerResult<TBody>> {
  try {
    const accessToken = mobileBearerToken(authorization);
    const context = await dependencies.authenticate(accessToken);
    return await dependencies.mutate(context);
  } catch (error) {
    if (error instanceof MobileApiUnauthorizedError) {
      return { status: 401, body: { error: "UNAUTHORIZED" } };
    }
    if (error instanceof MobileApiValidationError) {
      return {
        status: 400,
        body: { error: "VALIDATION_ERROR", message: error.message },
      };
    }
    if (error instanceof MobileApiNotFoundError) {
      return {
        status: 404,
        body: { error: "NOT_FOUND", message: error.message },
      };
    }
    if (error instanceof MobileApiConflictError) {
      if (error.code === "IDEMPOTENCY_KEY_REUSED") {
        return {
          status: 409,
          body: {
            status: "conflict",
            code: "IDEMPOTENCY_KEY_REUSED",
            message: error.message,
          },
        };
      }
      return {
        status: 409,
        body: { error: error.code, message: error.message },
      };
    }
    return { status: 503, body: { error: "DATA_UNAVAILABLE" } };
  }
}

export type MobileMutationHandlerResult<T> =
  | { status: 200 | 201; body: T }
  | { status: 400 | 401 | 404 | 409 | 503; body: MobileApiErrorResponse };

export async function handleMobileMutationRequest<TContext, TBody>(
  authorization: string | null,
  dependencies: {
    authenticate: (accessToken: string) => Promise<TContext>;
    mutate: (context: TContext) => Promise<TBody>;
    successStatus?: 200 | 201;
  },
): Promise<MobileMutationHandlerResult<TBody>> {
  try {
    const accessToken = mobileBearerToken(authorization);
    const context = await dependencies.authenticate(accessToken);
    return {
      status: dependencies.successStatus ?? 200,
      body: await dependencies.mutate(context),
    };
  } catch (error) {
    if (error instanceof MobileApiUnauthorizedError) {
      return { status: 401, body: { error: "UNAUTHORIZED" } };
    }
    if (error instanceof MobileApiValidationError) {
      return {
        status: 400,
        body: { error: "VALIDATION_ERROR", message: error.message },
      };
    }
    if (error instanceof MobileApiNotFoundError) {
      return {
        status: 404,
        body: { error: "NOT_FOUND", message: error.message },
      };
    }
    if (error instanceof MobileApiConflictError) {
      return {
        status: 409,
        body: { error: error.code, message: error.message },
      };
    }
    return { status: 503, body: { error: "DATA_UNAVAILABLE" } };
  }
}
