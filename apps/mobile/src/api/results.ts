export type MobileApiMethod = 'DELETE' | 'GET' | 'PATCH' | 'POST' | 'PUT';

export type MobileApiUnavailableReason =
  | 'aborted'
  | 'auth'
  | 'invalid_response'
  | 'network'
  | 'server'
  | 'timeout';

export type MobileApiOutcome =
  | 'auth_required'
  | 'conflict'
  | 'not_found'
  | 'ok'
  | 'unauthorized'
  | 'unavailable'
  | 'validation';

export type MobileApiResultMeta = {
  durationMs: number;
  httpStatus: number | null;
  outcome: MobileApiOutcome;
};

export type MobileApiReadResult<T> =
  | { status: 'ok'; data: T; meta: MobileApiResultMeta }
  | { status: 'auth_required'; meta: MobileApiResultMeta }
  | { status: 'unauthorized'; meta: MobileApiResultMeta }
  | {
      status: 'unavailable';
      reason: MobileApiUnavailableReason;
      meta: MobileApiResultMeta;
    };

export type MobileApiMutationResult<T> =
  | { status: 'ok'; data: T; meta: MobileApiResultMeta }
  | {
      status: 'conflict';
      code:
        | 'STAGES_CHANGED'
        | 'STAGES_DAY_CHANGED'
        | 'IDEMPOTENCY_KEY_REUSED'
        | 'WEIGHT_CHANGED'
        | 'BODY_FUTURE_DATE'
        | 'MEASUREMENT_CHANGED'
        | 'MEASUREMENT_DATE_TAKEN'
        | 'CONFIG_CHANGED'
        | 'PHYSICAL_CHANGED'
        | 'CONFIG_DAY_CHANGED'
        | 'ENERGY_PROFILE_REQUIRED'
        | 'PHYSICAL_WEIGHT_REQUIRED'
        | 'QUICK_SOURCE_CHANGED'
        | 'QUICK_SOURCE_UNAVAILABLE'
        | 'QUICK_SOURCE_UNUSABLE'
        | 'SAVED_NAME_EXISTS'
        | 'SAVED_CHANGED'
        | 'SAVED_UNAVAILABLE'
        | 'SAVED_FOOD_CHANGED'
        | 'SAVED_FOOD_UNAVAILABLE'
        | 'FOOD_CHANGED'
        | 'FOOD_UNAVAILABLE'
        | 'FOOD_NAME_EXISTS'
        | 'METRICS_CHANGED'
        | 'METRIC_UNAVAILABLE'
        | 'METRIC_FUTURE_DATE'
        | 'METRIC_CHANGED'
        | 'METRIC_HAS_HISTORY'
        | 'SYSTEM_METRIC_IMMUTABLE'
        | 'SYSTEM_METRIC_PROTECTED'
        | 'METRIC_ORDER_CHANGED'
        | 'CONTEXT_CHANGED'
        | 'CONTEXT_UNAVAILABLE'
        | 'POSSIBLE_DUPLICATE'
        | 'MEAL_CHANGED'
        | 'MEAL_UNAVAILABLE'
        | 'DAY_HAS_HISTORICAL_SUMMARY'
        | 'ACTIVE_SESSION_EXISTS'
        | 'ROUTINE_LIST_CHANGED'
        | 'PROGRESS_VIEW_CHANGED'
        | 'PROGRESS_VIEW_LIST_CHANGED'
        | 'ROUTINE_CHANGED'
        | 'EXERCISE_CHANGED'
        | 'ROUTINE_TEMPLATE_CHANGED'
        | 'SESSION_EXERCISE_CHANGED'
        | 'SESSION_CHANGED'
        | 'SESSION_CLOSED'
        | 'SESSION_EXERCISE_REMOVED'
        | 'SESSION_EXERCISE_ALREADY_EXISTS'
        | 'NO_COMPLETED_SETS'
        | 'SESSION_NOT_COMPLETED'
        | 'SESSION_DISCARDED';
      message: string;
      data?: T;
      meta: MobileApiResultMeta;
    }
  | { status: 'validation'; message: string; meta: MobileApiResultMeta }
  | { status: 'not_found'; message: string; meta: MobileApiResultMeta }
  | { status: 'auth_required'; meta: MobileApiResultMeta }
  | { status: 'unauthorized'; meta: MobileApiResultMeta }
  | {
      status: 'unavailable';
      reason: MobileApiUnavailableReason;
      meta: MobileApiResultMeta;
    };

export type MobileApiRequestResult<T> = MobileApiMutationResult<T>;
