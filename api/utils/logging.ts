type SafeLogValue = string | number | boolean | null | undefined;

export type SafeLogFields = Record<string, SafeLogValue>;

const MAX_LOG_STRING_LENGTH = 180;

function isDebugLoggingEnabled(): boolean {
  return typeof process !== 'undefined' && process.env.NODE_ENV !== 'production';
}

function redactLogString(value: string): string {
  return value
    .replace(/data:(image|video)\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, '[data-url]')
    .replace(/https?:\/\/[^\s"'<>)}\]]+/gi, '[url]')
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
      '[uuid]'
    )
    .slice(0, MAX_LOG_STRING_LENGTH);
}

function normalizeLogFields(fields?: SafeLogFields): SafeLogFields | undefined {
  if (!fields) return undefined;

  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === 'string' ? redactLogString(value) : value
    ])
  );
}

export function safeErrorSummary(error: unknown): SafeLogFields {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: redactLogString(error.message)
    };
  }

  if (error && typeof error === 'object') {
    const record = error as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
    };

    return {
      name: typeof record.name === 'string' ? redactLogString(record.name) : undefined,
      message:
        typeof record.message === 'string'
          ? redactLogString(record.message)
          : undefined,
      code:
        typeof record.code === 'string' || typeof record.code === 'number'
          ? record.code
          : undefined,
      status:
        typeof record.status === 'string' || typeof record.status === 'number'
          ? record.status
          : typeof record.statusCode === 'string' || typeof record.statusCode === 'number'
            ? record.statusCode
            : undefined
    };
  }

  return {
    message: typeof error === 'string' ? redactLogString(error) : 'Unknown error'
  };
}

export function debugLog(message: string, fields?: SafeLogFields): void {
  if (isDebugLoggingEnabled()) {
    console.debug(message, normalizeLogFields(fields));
  }
}

export function safeWarnLog(message: string, fields?: SafeLogFields): void {
  console.warn(message, normalizeLogFields(fields));
}

export function safeErrorLog(
  message: string,
  error: unknown,
  fields?: SafeLogFields
): void {
  console.error(message, {
    ...normalizeLogFields(fields),
    error: safeErrorSummary(error)
  });
}
