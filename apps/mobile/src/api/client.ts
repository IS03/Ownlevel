import type {
  MobileApiAccessTokenResult,
  MobileApiSessionRevalidationResult,
} from '@/auth/service';

import type { MobileApiConfig } from './config';
import type {
  MobileApiMethod,
  MobileApiReadResult,
  MobileApiRequestResult,
  MobileApiResultMeta,
  MobileApiUnavailableReason,
} from './results';
import { createMobileClientHeaders, type MobileClientRuntime } from './runtime';
import {
  mobileApiTelemetry,
  safeTelemetryPath,
  type MobileApiTelemetry,
  type MobileApiTelemetryOutcome,
} from './telemetry';

type RuntimeParser<T> = (value: unknown) => T | undefined;

export type MobileApiAuthPort = {
  getAccessToken: () => Promise<MobileApiAccessTokenResult>;
  revalidateAfterUnauthorized: (
    rejectedAccessToken: string,
  ) => Promise<MobileApiSessionRevalidationResult>;
};

export type MobileApiClientDependencies = {
  auth: MobileApiAuthPort;
  config: MobileApiConfig;
  fetchImplementation?: typeof fetch;
  now?: () => number;
  runtime: MobileClientRuntime;
  telemetry?: MobileApiTelemetry;
};

export type MobileApiRequestOptions<T> = {
  body?: unknown;
  method: MobileApiMethod;
  parse: RuntimeParser<T>;
  path: `/${string}`;
  signal?: AbortSignal;
};

export type MobileApiClient = {
  read: <T>(
    options: Omit<MobileApiRequestOptions<T>, 'method'> & { method?: 'GET' },
  ) => Promise<MobileApiReadResult<T>>;
  request: <T>(
    options: MobileApiRequestOptions<T>,
  ) => Promise<MobileApiRequestResult<T>>;
};

type RequestAttemptResult<T> = MobileApiRequestResult<T>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false };

function parseJson(text: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function responseMessage(value: unknown, fallback: string): string {
  return isRecord(value) && typeof value.message === 'string'
    ? value.message
    : fallback;
}

function meta(
  durationMs: number,
  httpStatus: number | null,
  outcome: MobileApiResultMeta['outcome'],
): MobileApiResultMeta {
  return { durationMs: Math.max(0, Math.round(durationMs)), httpStatus, outcome };
}

function telemetryOutcome(
  result: MobileApiRequestResult<unknown>,
): MobileApiTelemetryOutcome {
  return result.status === 'unavailable' ? result.reason : result.status;
}

function callerAborted(signal: AbortSignal | undefined): boolean {
  return Boolean(signal?.aborted);
}

async function fetchWithDeadline(
  fetchImplementation: typeof fetch,
  url: string,
  init: RequestInit,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let abortSource: 'caller' | 'timeout' | null = null;

  const abortFromCaller = () => {
    abortSource = 'caller';
    controller.abort();
  };

  if (callerSignal?.aborted) {
    abortFromCaller();
  } else {
    callerSignal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    abortSource = 'timeout';
    controller.abort();
  }, timeoutMs);

  try {
    return await new Promise<Response>((resolve, reject) => {
      const rejectForAbort = () => {
        reject(new MobileApiAbortError(abortSource ?? 'caller'));
      };
      controller.signal.addEventListener('abort', rejectForAbort, { once: true });

      if (controller.signal.aborted) {
        rejectForAbort();
        return;
      }

      fetchImplementation(url, { ...init, signal: controller.signal }).then(
        resolve,
        (error: unknown) => {
          if (controller.signal.aborted) {
            rejectForAbort();
          } else {
            reject(error);
          }
        },
      );
    });
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

class MobileApiAbortError extends Error {
  constructor(readonly source: 'caller' | 'timeout') {
    super(`Mobile API request aborted by ${source}`);
    this.name = 'MobileApiAbortError';
  }
}

function unavailable(
  reason: MobileApiUnavailableReason,
  durationMs: number,
  httpStatus: number | null,
): Extract<MobileApiRequestResult<never>, { status: 'unavailable' }> {
  return {
    status: 'unavailable',
    reason,
    meta: meta(durationMs, httpStatus, 'unavailable'),
  };
}

export function createMobileApiClient({
  auth,
  config,
  fetchImplementation = globalThis.fetch.bind(globalThis),
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  runtime,
  telemetry = mobileApiTelemetry,
}: MobileApiClientDependencies): MobileApiClient {
  const versionHeaders = createMobileClientHeaders(runtime);

  function record<T>(
    options: MobileApiRequestOptions<T>,
    result: MobileApiRequestResult<T>,
  ): void {
    telemetry.record({
      appEnv: config.appEnv,
      appVersion: runtime.appVersion,
      build: runtime.build,
      durationMs: result.meta.durationMs,
      httpStatus: result.meta.httpStatus,
      method: options.method,
      outcome: telemetryOutcome(result),
      path: safeTelemetryPath(options.path),
      platform: runtime.platform,
    });
  }

  async function attempt<T>(
    options: MobileApiRequestOptions<T>,
    accessToken: string,
  ): Promise<RequestAttemptResult<T>> {
    const startedAt = now();
    let result: MobileApiRequestResult<T>;

    try {
      const response = await fetchWithDeadline(
        fetchImplementation,
        `${config.baseUrl}${options.path}`,
        {
          method: options.method,
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
            ...(options.body === undefined
              ? {}
              : { 'Content-Type': 'application/json' }),
            ...versionHeaders,
          },
          ...(options.body === undefined
            ? {}
            : { body: JSON.stringify(options.body) }),
        },
        options.signal,
        config.timeoutMs,
      );
      const durationMs = now() - startedAt;

      if (response.status === 401) {
        result = {
          status: 'unauthorized',
          meta: meta(durationMs, 401, 'unauthorized'),
        };
      } else {
        const rawBody = await response.text();
        const parsedJson = parseJson(rawBody);
        const responseBody = parsedJson.ok ? parsedJson.value : undefined;

        // Stages uses strict status-tagged errors. Only this endpoint can opt into that wire shape.
        if (safeTelemetryPath(options.path) === '/api/mobile/v1/nutrition/stages' && options.method === 'POST' && (response.status === 400 || response.status === 409)) {
          const parsed = options.parse(responseBody);
          if (isRecord(parsed) && response.status === 400 && parsed.status === 'validation' && typeof parsed.message === 'string') {
            result = { status: 'validation', message: parsed.message, meta: meta(durationMs, 400, 'validation') };
          } else if (isRecord(parsed) && response.status === 409 && parsed.status === 'conflict' && ['STAGES_CHANGED', 'STAGES_DAY_CHANGED', 'IDEMPOTENCY_KEY_REUSED'].includes(String(parsed.error)) && typeof parsed.message === 'string') {
            result = { status: 'conflict', code: parsed.error as 'STAGES_CHANGED' | 'STAGES_DAY_CHANGED' | 'IDEMPOTENCY_KEY_REUSED', message: parsed.message, data: parsed, meta: meta(durationMs, 409, 'conflict') };
          } else result = unavailable('invalid_response', durationMs, response.status);
        } else if (response.status === 400) {
          result =
            isRecord(responseBody) && responseBody.error === 'VALIDATION_ERROR'
              ? {
                  status: 'validation',
                  message: responseMessage(responseBody, 'Revisá los datos ingresados.'),
                  meta: meta(durationMs, 400, 'validation'),
                }
              : unavailable('invalid_response', durationMs, 400);
        } else if (response.status === 404) {
          result =
            isRecord(responseBody) && responseBody.error === 'NOT_FOUND'
              ? {
                  status: 'not_found',
                  message: responseMessage(
                    responseBody,
                    'El registro ya no está disponible.',
                  ),
                  meta: meta(durationMs, 404, 'not_found'),
                }
              : unavailable('invalid_response', durationMs, 404);
        } else if (response.status === 409) {
          const conflictCode = isRecord(responseBody)
            ? (typeof responseBody.error === 'string'
                ? responseBody.error
                : responseBody.code)
            : undefined;
          const knownConflict =
            conflictCode === 'IDEMPOTENCY_KEY_REUSED' ||
            conflictCode === 'WEIGHT_CHANGED' ||
            conflictCode === 'BODY_FUTURE_DATE' ||
            conflictCode === 'MEASUREMENT_CHANGED' ||
            conflictCode === 'MEASUREMENT_DATE_TAKEN' ||
            conflictCode === 'CONFIG_CHANGED' ||
            conflictCode === 'PHYSICAL_CHANGED' ||
            conflictCode === 'CONFIG_DAY_CHANGED' ||
            conflictCode === 'ENERGY_PROFILE_REQUIRED' ||
            conflictCode === 'PHYSICAL_WEIGHT_REQUIRED' ||
            conflictCode === 'QUICK_SOURCE_CHANGED' ||
            conflictCode === 'QUICK_SOURCE_UNAVAILABLE' ||
            conflictCode === 'QUICK_SOURCE_UNUSABLE' ||
            conflictCode === 'SAVED_NAME_EXISTS' ||
            conflictCode === 'SAVED_CHANGED' ||
            conflictCode === 'SAVED_UNAVAILABLE' ||
            conflictCode === 'SAVED_FOOD_CHANGED' ||
            conflictCode === 'SAVED_FOOD_UNAVAILABLE' ||
            conflictCode === 'FOOD_CHANGED' ||
            conflictCode === 'FOOD_UNAVAILABLE' ||
            conflictCode === 'FOOD_NAME_EXISTS' ||
            conflictCode === 'METRICS_CHANGED' ||
            conflictCode === 'METRIC_UNAVAILABLE' ||
            conflictCode === 'METRIC_FUTURE_DATE' ||
            conflictCode === 'METRIC_CHANGED' ||
            conflictCode === 'METRIC_HAS_HISTORY' ||
            conflictCode === 'SYSTEM_METRIC_IMMUTABLE' ||
            conflictCode === 'SYSTEM_METRIC_PROTECTED' ||
            conflictCode === 'METRIC_ORDER_CHANGED' ||
            conflictCode === 'CONTEXT_CHANGED' ||
            conflictCode === 'CONTEXT_UNAVAILABLE' ||
            conflictCode === 'POSSIBLE_DUPLICATE' ||
            conflictCode === 'MEAL_CHANGED' ||
            conflictCode === 'MEAL_UNAVAILABLE' ||
            conflictCode === 'DAY_HAS_HISTORICAL_SUMMARY' ||
            conflictCode === 'ACTIVE_SESSION_EXISTS' ||
            conflictCode === 'ROUTINE_LIST_CHANGED' ||
            conflictCode === 'PROGRESS_VIEW_CHANGED' ||
            conflictCode === 'PROGRESS_VIEW_LIST_CHANGED' ||
            conflictCode === 'ROUTINE_CHANGED' ||
            conflictCode === 'EXERCISE_CHANGED' ||
            conflictCode === 'ROUTINE_TEMPLATE_CHANGED' ||
            conflictCode === 'SESSION_EXERCISE_CHANGED' ||
            conflictCode === 'SESSION_CHANGED' ||
            conflictCode === 'SESSION_CLOSED' ||
            conflictCode === 'SESSION_EXERCISE_REMOVED' ||
            conflictCode === 'SESSION_EXERCISE_ALREADY_EXISTS' ||
            conflictCode === 'NO_COMPLETED_SETS' ||
            conflictCode === 'SESSION_NOT_COMPLETED' ||
            conflictCode === 'SESSION_DISCARDED';
          if (knownConflict) {
            const conflictData = conflictCode === 'ACTIVE_SESSION_EXISTS' || conflictCode === 'MEAL_CHANGED'
              ? options.parse(responseBody)
              : undefined;
            result = (conflictCode === 'ACTIVE_SESSION_EXISTS' || conflictCode === 'MEAL_CHANGED') && conflictData === undefined
              ? unavailable('invalid_response', durationMs, 409)
              : {
                  status: 'conflict',
                  code: conflictCode,
                  message: responseMessage(
                    responseBody,
                    conflictCode === 'ACTIVE_SESSION_EXISTS'
                      ? 'Ya existe una sesión en curso.'
                      : 'Los datos cambiaron. Actualizá antes de reintentar.',
                  ),
                  ...(conflictData === undefined ? {} : { data: conflictData }),
                  meta: meta(durationMs, 409, 'conflict'),
                };
          } else {
            result = unavailable('invalid_response', durationMs, 409);
          }
        } else if (!response.ok) {
          result = unavailable(
            response.status >= 500 ? 'server' : 'invalid_response',
            durationMs,
            response.status,
          );
        } else {
          const parsed = parsedJson.ok
            ? options.parse(parsedJson.value)
            : undefined;
          result = parsed === undefined
            ? unavailable('invalid_response', durationMs, response.status)
            : {
                status: 'ok',
                data: parsed,
                meta: meta(durationMs, response.status, 'ok'),
              };
        }
      }
    } catch (error) {
      const durationMs = now() - startedAt;
      result =
        error instanceof MobileApiAbortError
          ? unavailable(error.source === 'timeout' ? 'timeout' : 'aborted', durationMs, null)
          : unavailable('network', durationMs, null);
    }

    record(options, result);
    return result;
  }

  async function request<T>(
    options: MobileApiRequestOptions<T>,
  ): Promise<MobileApiRequestResult<T>> {
    const startedAt = now();
    if (callerAborted(options.signal)) {
      const result = unavailable('aborted', now() - startedAt, null);
      record(options, result);
      return result;
    }

    let tokenResult: MobileApiAccessTokenResult;
    try {
      tokenResult = await auth.getAccessToken();
    } catch {
      const result = unavailable('auth', now() - startedAt, null);
      record(options, result);
      return result;
    }

    if (tokenResult.status === 'auth_required') {
      const result = {
        status: 'auth_required',
        meta: meta(now() - startedAt, null, 'auth_required'),
      } as const;
      record(options, result);
      return result;
    }
    if (tokenResult.status === 'unavailable') {
      const result = unavailable('auth', now() - startedAt, null);
      record(options, result);
      return result;
    }

    const firstResult = await attempt(options, tokenResult.accessToken);
    if (firstResult.status !== 'unauthorized') {
      return firstResult;
    }

    let revalidation: MobileApiSessionRevalidationResult;
    try {
      revalidation = await auth.revalidateAfterUnauthorized(tokenResult.accessToken);
    } catch {
      return unavailable('auth', firstResult.meta.durationMs, 401);
    }

    if (revalidation.status === 'invalid') {
      return firstResult;
    }
    if (revalidation.status === 'unavailable') {
      return unavailable('auth', firstResult.meta.durationMs, 401);
    }
    if (
      revalidation.status !== 'renewed' ||
      revalidation.accessToken === tokenResult.accessToken ||
      options.method !== 'GET'
    ) {
      return firstResult;
    }

    return attempt(options, revalidation.accessToken);
  }

  async function read<T>(
    options: Omit<MobileApiRequestOptions<T>, 'method'> & { method?: 'GET' },
  ): Promise<MobileApiReadResult<T>> {
    const result = await request({ ...options, method: 'GET' });
    if (
      result.status === 'validation' ||
      result.status === 'not_found' ||
      result.status === 'conflict'
    ) {
      return unavailable('invalid_response', result.meta.durationMs, result.meta.httpStatus);
    }
    return result;
  }

  return { read, request };
}
