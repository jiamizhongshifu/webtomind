export interface ImageGenerationFailureDescriptor {
  retryable?: boolean;
  category?: string | null;
  code?: string | null;
  errorCategory?: string | null;
  errorCode?: string | null;
}

const NON_RETRYABLE_FAILURE_PATTERN =
  /provider_policy|content_policy|safety|auth|credit|invalid_request/i;

export function canRetryImageGenerationFailure(
  failure: ImageGenerationFailureDescriptor
): boolean {
  const descriptor = [
    failure.category,
    failure.code,
    failure.errorCategory,
    failure.errorCode
  ]
    .filter(Boolean)
    .join(' ');
  if (NON_RETRYABLE_FAILURE_PATTERN.test(descriptor)) return false;
  if (typeof failure.retryable === 'boolean') return failure.retryable;
  return true;
}

export function resolveImageGenerationFailureDetails(input: {
  payloadDetails?: unknown;
  failureCategory?: string | null;
  failureCode?: string | null;
}) {
  const payload =
    input.payloadDetails && typeof input.payloadDetails === 'object'
      ? (input.payloadDetails as Record<string, unknown>)
      : {};
  const category =
    (typeof payload.category === 'string' && payload.category) ||
    input.failureCategory ||
    undefined;
  const code =
    (typeof payload.code === 'string' && payload.code) ||
    input.failureCode ||
    undefined;
  const explicitRetryable =
    typeof payload.retryable === 'boolean' ? payload.retryable : undefined;

  return {
    category,
    code,
    retryable: canRetryImageGenerationFailure({
      retryable: explicitRetryable,
      category,
      code
    })
  };
}
