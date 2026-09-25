/**
 * CORS Handler 模块
 * 统一的跨域请求处理工具
 */

/**
 * 标准 CORS Headers
 * 用于所有 API 端点
 */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 处理 CORS 预检请求 (OPTIONS)
 * @returns 204 No Content 响应
 */
export function handleCorsPreflightRequest(): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * 为响应添加 CORS headers
 * @param response - 原始响应
 * @returns 添加了 CORS headers 的新响应
 */
export function addCorsHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  
  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

/**
 * 创建带 CORS headers 的 JSON 响应
 * @param data - 响应数据
 * @param status - HTTP 状态码，默认 200
 * @param extraHeaders - 额外的响应头
 * @returns JSON 响应
 */
export function jsonResponse(
  data: unknown, 
  status: number = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

/**
 * 创建带 CORS headers 的错误响应
 * @param error - 错误消息
 * @param status - HTTP 状态码，默认 500
 * @returns 错误响应
 */
export function errorResponse(error: string, status: number = 500): Response {
  return jsonResponse({ error }, status);
}

/**
 * 常用错误响应快捷方法
 */
export const errors = {
  /** 401 未授权 */
  unauthorized: (message: string = '请先登录') => errorResponse(message, 401),
  
  /** 400 请求错误 */
  badRequest: (message: string = '请求参数错误') => errorResponse(message, 400),
  
  /** 404 未找到 */
  notFound: (message: string = '资源不存在') => errorResponse(message, 404),
  
  /** 405 方法不允许 */
  methodNotAllowed: () => errorResponse('Method not allowed', 405),
  
  /** 500 服务器错误 */
  serverError: (message: string = '服务器内部错误') => errorResponse(message, 500),
};
