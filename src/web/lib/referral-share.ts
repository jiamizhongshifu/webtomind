/**
 * 分享链接的邀请码缓存。
 *
 * 登录用户分享 prompt case / 生成结果时，分享 URL 自动带上 `ref=<邀请码>`；
 * 新用户经该链接注册时 AuthModal 已支持读取 `ref` 并绑定推荐关系。
 * 邀请码在登录后预取一次并缓存到 sessionStorage，避免每个分享按钮异步等待。
 */

const REFERRAL_SHARE_CODE_KEY = 'webtomind:referral-share-code:v1';
const MAX_CODE_LENGTH = 64;

export function getReferralShareCode(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(REFERRAL_SHARE_CODE_KEY);
    const code = raw?.trim();
    return code ? code.slice(0, MAX_CODE_LENGTH) : undefined;
  } catch {
    return undefined;
  }
}

export function setReferralShareCode(code: string): void {
  if (typeof window === 'undefined') return;
  const trimmed = code.trim();
  if (!trimmed) return;
  try {
    window.sessionStorage.setItem(
      REFERRAL_SHARE_CODE_KEY,
      trimmed.slice(0, MAX_CODE_LENGTH)
    );
  } catch {
    // Cache is best-effort; sharing still works without a ref param.
  }
}

export function primeReferralShareCode(
  loadCode: () => Promise<string>
): void {
  if (typeof window === 'undefined') return;
  if (getReferralShareCode()) return;
  loadCode()
    .then((code) => {
      if (code) setReferralShareCode(code);
    })
    .catch(() => {
      // Referral attribution must never block or break sharing.
    });
}

export function withReferralParam(url: string): string {
  const code = getReferralShareCode();
  if (!code) return url;
  // 只处理绝对 URL：相对路径没有 host，隐式绝对化会改变调用方语义。
  if (!/^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(url)) return url;
  try {
    const parsed = new URL(url, 'https://webtomind.com');
    if (!parsed.searchParams.has('ref')) {
      parsed.searchParams.set('ref', code);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}
