export class ModelRequestTimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${Math.ceil(timeoutMs / 1000)}s`);
    this.name = 'ModelRequestTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export async function fetchModelWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: { timeoutMs: number; label: string }
): Promise<Response> {
  const timeoutMs = Math.max(100, Math.floor(options.timeoutMs));
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort(init.signal?.reason);
  if (init.signal?.aborted) controller.abort(init.signal.reason);
  else init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) {
      throw new ModelRequestTimeoutError(options.label, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function readResponseArrayBufferWithLimit(
  response: Response,
  maxBytes: number,
  options: { timeoutMs?: number; label?: string } = {}
): Promise<ArrayBuffer> {
  const normalizedMax = Math.max(1, Math.floor(maxBytes));
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > normalizedMax) {
    throw new Error(`Response body exceeds ${normalizedMax} bytes`);
  }
  if (!response.body) return new ArrayBuffer(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const timeoutMs = Math.max(100, Math.floor(options.timeoutMs ?? 60_000));
  const deadline = Date.now() + timeoutMs;
  let reading = true;
  while (reading) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      await reader.cancel('response body timeout').catch(() => undefined);
      throw new ModelRequestTimeoutError(options.label || 'response body', timeoutMs);
    }
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new ModelRequestTimeoutError(options.label || 'response body', timeoutMs)),
        remaining
      );
    });
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await Promise.race([reader.read(), timeout]);
    } catch (error) {
      await reader.cancel('response body timeout').catch(() => undefined);
      throw error;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    const { done, value } = chunk;
    if (done) {
      reading = false;
      continue;
    }
    total += value.byteLength;
    if (total > normalizedMax) {
      await reader.cancel('response body too large').catch(() => undefined);
      throw new Error(`Response body exceeds ${normalizedMax} bytes`);
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}
