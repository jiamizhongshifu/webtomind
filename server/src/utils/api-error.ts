/**
 * 统一 API 错误处理
 * 提供一致的错误响应格式和日志记录
 */

import { corsHeaders } from './cors-handler.js';

/**
 * API 错误类型
 */
export type ApiErrorCode = 
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE';

/**
 * 错误代码到 HTTP 状态码映射
 */
const ERROR_STATUS_MAP: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

/**
 * API 错误响应结构
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, unknown>;
    timestamp: string;
    requestId?: string;
  };
}

/**
 * 生成请求 ID
 */
function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * 创建 API 错误响应
 */
export function createApiError(
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
  requestId?: string
): Response {
  const status = ERROR_STATUS_MAP[code];
  const errorResponse: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      details,
      timestamp: new Date().toISOString(),
      requestId: requestId || generateRequestId(),
    },
  };

  // 记录错误日志
  console.error(`[API Error] ${code}: ${message}`, {
    status,
    details,
    requestId: errorResponse.error.requestId,
  });

  return new Response(JSON.stringify(errorResponse), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Request-Id': errorResponse.error.requestId!,
    },
  });
}

/**
 * 预定义错误工厂
 */
export const ApiErrors = {
  badRequest: (message = '请求参数无效', details?: Record<string, unknown>) =>
    createApiError('BAD_REQUEST', message, details),

  unauthorized: (message = '未授权访问') =>
    createApiError('UNAUTHORIZED', message),

  forbidden: (message = '无权访问此资源') =>
    createApiError('FORBIDDEN', message),

  notFound: (message = '资源不存在') =>
    createApiError('NOT_FOUND', message),

  methodNotAllowed: (message = '不支持的请求方法') =>
    createApiError('METHOD_NOT_ALLOWED', message),

  conflict: (message = '资源冲突', details?: Record<string, unknown>) =>
    createApiError('CONFLICT', message, details),

  validationError: (message: string, details?: Record<string, unknown>) =>
    createApiError('VALIDATION_ERROR', message, details),

  rateLimited: (message = '请求过于频繁，请稍后重试') =>
    createApiError('RATE_LIMITED', message),

  internalError: (message = '服务器内部错误', details?: Record<string, unknown>) =>
    createApiError('INTERNAL_ERROR', message, details),

  serviceUnavailable: (message = '服务暂时不可用') =>
    createApiError('SERVICE_UNAVAILABLE', message),
};

/**
 * 成功响应结构
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId?: string;
  };
}

/**
 * 创建成功响应
 */
export function createApiSuccess<T>(
  data: T,
  status = 200,
  requestId?: string
): Response {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: requestId || generateRequestId(),
    },
  };

  return new Response(JSON.stringify(response), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-Request-Id': response.meta!.requestId!,
    },
  });
}

/**
 * 包装异步处理函数，统一错误处理
 */
export function withErrorHandler(
  handler: (request: Request) => Promise<Response>
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const requestId = generateRequestId();
    
    try {
      const response = await handler(request);
      // 添加请求 ID 到响应头
      const headers = new Headers(response.headers);
      if (!headers.has('X-Request-Id')) {
        headers.set('X-Request-Id', requestId);
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch (error) {
      console.error(`[API Error] Unhandled exception:`, error);
      
      if (error instanceof Error) {
        return createApiError(
          'INTERNAL_ERROR',
          error.message,
          { stack: process.env.NODE_ENV === 'development' ? error.stack : undefined },
          requestId
        );
      }
      
      return createApiError(
        'INTERNAL_ERROR',
        '未知错误',
        undefined,
        requestId
      );
    }
  };
}
