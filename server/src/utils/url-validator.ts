/**
 * URL Validator 模块
 * URL 验证和 SSRF 防护
 */

/**
 * URL 验证结果
 */
export interface URLValidationResult {
  /** 是否有效 */
  valid: boolean;
  /** 错误信息（如果无效） */
  error?: string;
  /** 规范化后的 URL */
  normalizedUrl?: string;
}

/**
 * 私有 IP 范围
 */
const PRIVATE_IP_RANGES = [
  // 10.0.0.0 - 10.255.255.255
  { start: [10, 0, 0, 0], end: [10, 255, 255, 255] },
  // 172.16.0.0 - 172.31.255.255
  { start: [172, 16, 0, 0], end: [172, 31, 255, 255] },
  // 192.168.0.0 - 192.168.255.255
  { start: [192, 168, 0, 0], end: [192, 168, 255, 255] },
  // 127.0.0.0 - 127.255.255.255 (loopback)
  { start: [127, 0, 0, 0], end: [127, 255, 255, 255] },
  // 169.254.0.0 - 169.254.255.255 (link-local)
  { start: [169, 254, 0, 0], end: [169, 254, 255, 255] },
  // 0.0.0.0 - 0.255.255.255
  { start: [0, 0, 0, 0], end: [0, 255, 255, 255] },
];

/**
 * 被阻止的主机名
 */
const BLOCKED_HOSTNAMES = [
  'localhost',
  'localhost.localdomain',
  'local',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '::',
  // 云服务元数据端点
  'metadata.google.internal',
  '169.254.169.254',
  'metadata.aws.internal',
];

/**
 * 解析 IPv4 地址为数字数组
 */
function parseIPv4(ip: string): number[] | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  
  const nums = parts.map(p => parseInt(p, 10));
  if (nums.some(n => isNaN(n) || n < 0 || n > 255)) return null;
  
  return nums;
}

/**
 * 检查 IP 是否在指定范围内
 */
function isIPInRange(ip: number[], start: number[], end: number[]): boolean {
  for (let i = 0; i < 4; i++) {
    if (ip[i] < start[i] || ip[i] > end[i]) {
      // 如果当前位小于起始或大于结束，需要检查前面的位
      if (i > 0) {
        // 如果前面的位在范围内，继续检查
        let inRange = true;
        for (let j = 0; j < i; j++) {
          if (ip[j] < start[j] || ip[j] > end[j]) {
            inRange = false;
            break;
          }
        }
        if (!inRange) return false;
      }
      if (ip[i] < start[i] || ip[i] > end[i]) {
        return false;
      }
    }
  }
  return true;
}

/**
 * 检查是否为私有 IP 地址
 * @param ip - IP 地址字符串
 * @returns 是否为私有 IP
 */
export function isPrivateIP(ip: string): boolean {
  // 检查 IPv6 loopback
  if (ip === '::1' || ip === '::') {
    return true;
  }
  
  // 解析 IPv4
  const parsed = parseIPv4(ip);
  if (!parsed) {
    // 无法解析的 IP 视为不安全
    return true;
  }
  
  // 检查是否在私有范围内
  for (const range of PRIVATE_IP_RANGES) {
    if (isIPInRange(parsed, range.start, range.end)) {
      return true;
    }
  }
  
  return false;
}

/**
 * 验证 URL 安全性（SSRF 防护）
 * @param url - 要验证的 URL
 * @returns 验证结果
 */
export async function validateURL(url: string): Promise<URLValidationResult> {
  try {
    // 解析 URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
    
    // 检查协议
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, error: 'Only http and https protocols are allowed' };
    }
    
    // 检查主机名是否在黑名单中
    const hostname = parsedUrl.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return { valid: false, error: 'URL blocked for security reasons' };
    }
    
    // 检查主机名是否为 IP 地址
    const ipMatch = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
    if (ipMatch) {
      if (isPrivateIP(hostname)) {
        return { valid: false, error: 'URL blocked for security reasons' };
      }
    }
    
    // DNS 解析检查（仅在 Node.js 环境）
    if (typeof process !== 'undefined' && process.versions?.node) {
      try {
        const dns = await import('dns');
        const { promisify } = await import('util');
        const lookup = promisify(dns.lookup);
        
        const result = await lookup(hostname);
        if (result && typeof result === 'object' && 'address' in result) {
          const resolvedIP = result.address as string;
          if (isPrivateIP(resolvedIP)) {
            return { valid: false, error: 'URL blocked for security reasons' };
          }
        }
      } catch {
        // DNS 解析失败，可能是无效域名
        // 允许继续，让实际请求处理错误
      }
    }
    
    return {
      valid: true,
      normalizedUrl: parsedUrl.href,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'URL validation failed',
    };
  }
}

/**
 * 同步验证 URL（不进行 DNS 解析）
 * 用于快速检查，不需要异步操作
 */
export function validateURLSync(url: string): URLValidationResult {
  try {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
    
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return { valid: false, error: 'Only http and https protocols are allowed' };
    }
    
    const hostname = parsedUrl.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.includes(hostname)) {
      return { valid: false, error: 'URL blocked for security reasons' };
    }
    
    const ipMatch = hostname.match(/^(\d{1,3}\.){3}\d{1,3}$/);
    if (ipMatch && isPrivateIP(hostname)) {
      return { valid: false, error: 'URL blocked for security reasons' };
    }
    
    return { valid: true, normalizedUrl: parsedUrl.href };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'URL validation failed',
    };
  }
}
