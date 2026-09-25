import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserIdFromRequest } from '../../api/utils/auth';
import { consumeModelRateLimit } from '../../api/utils/model-rate-limit';
import { handleAiMarksRequest } from '../../api/tools/ai-marks';
import { normalizeAiMarksServiceMode } from '../../api/tools/ai-marks-runtime';

vi.mock('../../api/utils/auth', async () => {
  const actual = await vi.importActual<typeof import('../../api/utils/auth')>(
    '../../api/utils/auth'
  );
  return {
    ...actual,
    getUserIdFromRequest: vi.fn()
  };
});

vi.mock('../../api/utils/model-rate-limit', () => ({
  consumeModelRateLimit: vi.fn(),
  createModelRateLimitResponse: vi.fn(
    (result: { retryAfter: number }, corsHeaders: Record<string, string>) =>
      new Response(JSON.stringify({ error: 'RATE_LIMITED' }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(result.retryAfter)
        }
      })
  )
}));

const originalServiceUrl = process.env.WATERMARKS_SERVICE_URL;
const originalApiKey = process.env.WATERMARKS_SERVICE_API_KEY;
const originalServiceMode = process.env.WATERMARKS_SERVICE_MODE;
const testServiceApiKey = 'test-service-key-123456789012345678901234567890';

function makeRequest(
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  authorization = 'Bearer test-token',
  clientIp = 'test-ip'
): Request {
  return new Request('http://localhost/api/tools/ai-marks', {
    method,
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:5173',
      'CF-Connecting-IP': clientIp,
      ...(authorization ? { Authorization: authorization } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

describe('AI marks service proxy', () => {
  beforeEach(() => {
    delete process.env.WATERMARKS_SERVICE_URL;
    process.env.WATERMARKS_SERVICE_API_KEY = testServiceApiKey;
    delete process.env.WATERMARKS_SERVICE_MODE;
    vi.stubGlobal('fetch', vi.fn());
    vi.mocked(getUserIdFromRequest).mockResolvedValue('user-1');
    vi.mocked(consumeModelRateLimit).mockResolvedValue({
      allowed: true,
      status: 200,
      retryAfter: 60,
      remaining: 10
    });
  });

  it('normalizes service mode casing before selecting a transport', () => {
    expect(normalizeAiMarksServiceMode(' CONTAINER ')).toBe('container');
    expect(normalizeAiMarksServiceMode('HTTP')).toBe('http');
    expect(normalizeAiMarksServiceMode('unexpected')).toBeNull();
  });

  afterEach(() => {
    if (originalServiceUrl === undefined) {
      delete process.env.WATERMARKS_SERVICE_URL;
    } else {
      process.env.WATERMARKS_SERVICE_URL = originalServiceUrl;
    }
    if (originalApiKey === undefined) {
      delete process.env.WATERMARKS_SERVICE_API_KEY;
    } else {
      process.env.WATERMARKS_SERVICE_API_KEY = originalApiKey;
    }
    if (originalServiceMode === undefined) {
      delete process.env.WATERMARKS_SERVICE_MODE;
    } else {
      process.env.WATERMARKS_SERVICE_MODE = originalServiceMode;
    }
    vi.unstubAllGlobals();
  });

  it('returns an explicit configuration error when the service is not configured', async () => {
    const response = await handleAiMarksRequest(makeRequest('GET'));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      code: 'AI_MARKS_SERVICE_NOT_CONFIGURED'
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects file operations without a valid application session', async () => {
    process.env.WATERMARKS_SERVICE_URL = 'https://marks.example.test';
    vi.mocked(getUserIdFromRequest).mockResolvedValue(null);

    const response = await handleAiMarksRequest(
      makeRequest(
        'POST',
        {
          action: 'inspect',
          file: 'aGVsbG8=',
          name: 'notes.txt'
        },
        ''
      )
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: 'AUTH_REQUIRED'
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('proxies health and capabilities without exposing configuration to the browser', async () => {
    process.env.WATERMARKS_SERVICE_URL = 'https://marks.example.test/';
    process.env.WATERMARKS_SERVICE_API_KEY = testServiceApiKey;
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      return url.endsWith('/health')
        ? Response.json({ status: 'ok', version: '1.0.0' })
        : Response.json({ pixel_backends: { ctrlregen: false } });
    });

    const response = await handleAiMarksRequest(makeRequest('GET'));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      health: { status: 'ok' },
      capabilities: { pixel_backends: { ctrlregen: false } }
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        `Bearer ${testServiceApiKey}`
      );
    }
  });

  it('routes Container mode through the injected internal service transport', async () => {
    process.env.WATERMARKS_SERVICE_MODE = ' CONTAINER ';
    process.env.WATERMARKS_SERVICE_API_KEY = testServiceApiKey;
    const serviceFetch = vi
      .fn<typeof fetch>()
      .mockImplementation(async (input) => {
        const url = String(input);
        return url.endsWith('/health')
          ? Response.json({ status: 'ok' })
          : Response.json({ pixel_backends: {} });
      });

    const response = await handleAiMarksRequest(makeRequest('GET'), {
      serviceFetch
    });

    expect(response.status).toBe(200);
    expect(serviceFetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
    expect(serviceFetch.mock.calls.map(([input]) => String(input))).toEqual([
      'http://watermarks-container/health',
      'http://watermarks-container/capabilities'
    ]);
  });

  it('forwards inspect and clean payloads to the matching upstream endpoint', async () => {
    process.env.WATERMARKS_SERVICE_URL = 'https://marks.example.test';
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(Response.json({ ok: true, suspicious: true }))
      .mockResolvedValueOnce(
        Response.json({ ok: true, cleaned: 'Y2xlYW5lZA==', kind: 'text' })
      );

    const inspectResponse = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'inspect',
        file: 'aGVsbG8=',
        name: 'notes.txt'
      }, 'Bearer test-token', 'visible-missing')
    );
    const cleanResponse = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'clean',
        file: 'aGVsbG8=',
        name: 'notes.txt',
        options: { strip_all_metadata: true }
      }, 'Bearer test-token', 'visible-out-of-image')
    );

    expect(inspectResponse.status).toBe(200);
    expect(cleanResponse.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://marks.example.test/inspect'
    );
    expect(fetchMock.mock.calls[1][0]).toBe('https://marks.example.test/clean');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      file: 'aGVsbG8=',
      name: 'notes.txt'
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      file: 'aGVsbG8=',
      name: 'notes.txt',
      options: { strip_all_metadata: true }
    });
    expect(consumeModelRateLimit).toHaveBeenNthCalledWith(1, {
      userId: 'user-1',
      bucket: 'ai_marks_inspect',
      maxRequests: 12
    });
    expect(consumeModelRateLimit).toHaveBeenNthCalledWith(2, {
      userId: 'user-1',
      bucket: 'ai_marks_clean',
      maxRequests: 4
    });
  });

  it('forwards visible watermark selections to the configured service', async () => {
    process.env.WATERMARKS_SERVICE_URL = 'https://marks.example.test';
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      Response.json({
        ok: true,
        cleaned: 'aW1hZ2U=',
        kind: 'image',
        report: { visible_removal: { applied: true } }
      })
    );

    const response = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'clean',
        file: 'aW1hZ2U=',
        name: 'logo.png',
        options: {
          remove_visible: true,
          visible_boxes: [{ x: 0.7, y: 0.8, width: 0.2, height: 0.1 }],
          visible_inpaint_method: 'telea'
        }
      })
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      file: 'aW1hZ2U=',
      name: 'logo.png',
      options: {
        remove_visible: true,
        visible_boxes: [{ x: 0.7, y: 0.8, width: 0.2, height: 0.1 }],
        visible_inpaint_method: 'telea'
      }
    });
  });

  it('rejects visible cleanup without a selection or with an invalid box', async () => {
    process.env.WATERMARKS_SERVICE_URL = 'https://marks.example.test';

    const missingSelection = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'clean',
        file: 'aW1hZ2U=',
        name: 'logo.png',
        options: { remove_visible: true }
      }, 'Bearer test-token', 'visible-missing')
    );
    const outOfImage = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'clean',
        file: 'aW1hZ2U=',
        name: 'logo.png',
        options: {
          remove_visible: true,
          visible_boxes: [{ x: 0.9, y: 0.9, width: 0.2, height: 0.1 }]
        }
      }, 'Bearer test-token', 'visible-out-of-image')
    );
    const zeroSize = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'clean',
        file: 'aW1hZ2U=',
        name: 'logo.png',
        options: {
          remove_visible: true,
          visible_boxes: [{ x: 0.2, y: 0.2, width: 0, height: 0.1 }]
        }
      }, 'Bearer test-token', 'visible-zero-size')
    );
    const emptyArray = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'clean',
        file: 'aW1hZ2U=',
        name: 'logo.png',
        options: { remove_visible: true, visible_boxes: [] }
      }, 'Bearer test-token', 'visible-empty-array')
    );

    expect(missingSelection.status).toBe(400);
    expect(outOfImage.status).toBe(400);
    expect(zeroSize.status).toBe(400);
    expect(emptyArray.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a rate-limit response before calling the upstream service', async () => {
    process.env.WATERMARKS_SERVICE_URL = 'https://marks.example.test';
    vi.mocked(consumeModelRateLimit).mockResolvedValue({
      allowed: false,
      status: 429,
      retryAfter: 45,
      remaining: 0,
      error: 'RATE_LIMITED'
    });

    const response = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'clean',
        file: 'aGVsbG8=',
        name: 'notes.txt'
      })
    );

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('45');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid files and unknown cleanup options at the proxy boundary', async () => {
    process.env.WATERMARKS_SERVICE_URL = 'https://marks.example.test';

    const invalidFileResponse = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'inspect',
        file: 'not-base64',
        name: 'notes.txt'
      })
    );
    expect(invalidFileResponse.status).toBe(400);

    const invalidOptionResponse = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'clean',
        file: 'aGVsbG8=',
        name: 'notes.txt',
        options: { allow_remote: true }
      })
    );
    expect(invalidOptionResponse.status).toBe(400);

    const unsupportedUpstreamOptionResponse = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'clean',
        file: 'aGVsbG8=',
        name: 'notes.txt',
        options: { detect_before: true }
      })
    );
    expect(unsupportedUpstreamOptionResponse.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects an oversized raster before waking the upstream service', async () => {
    process.env.WATERMARKS_SERVICE_URL = 'https://marks.example.test';
    const pngHeader = new Uint8Array(24);
    pngHeader.set([0x89, 0x50, 0x4e, 0x47], 0);
    pngHeader[16] = 0x00;
    pngHeader[17] = 0x00;
    pngHeader[18] = 0x27;
    pngHeader[19] = 0x10;
    pngHeader[20] = 0x00;
    pngHeader[21] = 0x00;
    pngHeader[22] = 0x27;
    pngHeader[23] = 0x10;
    const file = Buffer.from(pngHeader).toString('base64');

    const response = await handleAiMarksRequest(
      makeRequest('POST', {
        action: 'inspect',
        file,
        name: 'oversized.png'
      })
    );

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: '图片像素尺寸过大，请先缩小后重试。'
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});
