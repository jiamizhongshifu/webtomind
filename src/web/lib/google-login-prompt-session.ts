const DISMISSED_KEY = 'webtomind:google-login-fallback-dismissed';

export function isGoogleLoginPromptDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissGoogleLoginPromptForSession(): void {
  try {
    sessionStorage.setItem(DISMISSED_KEY, '1');
  } catch {
    // In-memory state still suppresses the prompt when storage is unavailable.
  }
}
