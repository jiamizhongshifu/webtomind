/**
 * JWT Parser 模块
 * 统一的 JWT 解析工具，用于从 token 中提取用户信息
 */

/**
 * JWT Payload 接口
 */
export interface JWTPayload {
  /** 用户 ID (subject) */
  sub: string;
  /** 过期时间戳 (秒) */
  exp: number;
  /** 签发时间戳 (秒) */
  iat?: number;
  /** 其他自定义字段 */
  [key: string]: unknown;
}

/**
 * Base64URL 解码
 * 处理 URL 安全的 base64 编码
 */
function base64UrlDecode(str: string): string {
  // 替换 URL 安全字符
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  
  // 添加填充
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  
  // Node.js 环境使用 Buffer
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
  
  // 浏览器环境使用 atob
  return decodeURIComponent(
    atob(base64)
      .split('')
      .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join('')
  );
}

/**
 * 解析 JWT token 并提取 payload
 * @param token - JWT token 字符串
 * @returns 解析后的 payload 或 null（如果无效/过期）
 */
export function parseJWT(token: string): JWTPayload | null {
  try {
    // 验证 token 结构 (header.payload.signature)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    // 解码 payload (第二部分)
    const payloadStr = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadStr) as JWTPayload;

    // 验证必需字段
    if (!payload.sub || typeof payload.sub !== 'string') {
      return null;
    }

    // 检查过期时间
    if (payload.exp && typeof payload.exp === 'number') {
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp < now) {
        return null; // Token 已过期
      }
    }

    return payload;
  } catch {
    // 任何解析错误都返回 null
    return null;
  }
}

/**
 * 从 Authorization header 提取用户 ID
 * @param authHeader - Authorization header 值 (如 "Bearer xxx")
 * @returns 用户 ID 或 null
 */
export function getUserIdFromAuth(authHeader: string | null | undefined): string | null {
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }

  // 检查 Bearer 前缀
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  // 提取 token
  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  // 解析 JWT 并返回用户 ID
  const payload = parseJWT(token);
  return payload?.sub ?? null;
}

/**
 * 从 Request 对象提取用户 ID
 * @param request - HTTP Request 对象
 * @returns 用户 ID 或 null
 */
export function getUserIdFromRequest(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  return getUserIdFromAuth(authHeader);
}
