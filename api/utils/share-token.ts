/**
 * Share Token Generation Utility
 *
 * Generates URL-safe tokens for public share links.
 * Uses a custom alphabet to avoid confusing characters (0/O, 1/l/I).
 */

// Custom alphabet: excludes 0, O, 1, l, I to avoid confusion
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
const TOKEN_LENGTH = 8;

/**
 * Generate a random share token
 * @returns 8-character alphanumeric token
 */
export function generateShareToken(): string {
  let token = '';
  const alphabetLength = ALPHABET.length;

  const cryptoProvider = (globalThis as typeof globalThis & {
    crypto?: { getRandomValues<T extends ArrayBufferView>(array: T): T };
  }).crypto;

  if (!cryptoProvider?.getRandomValues) {
    throw new Error('Crypto.getRandomValues is not available in this runtime.');
  }

  // Use Web Crypto API (compatible with Edge Runtime)
  const randomValues = new Uint8Array(TOKEN_LENGTH);
  cryptoProvider.getRandomValues(randomValues);

  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += ALPHABET[randomValues[i] % alphabetLength];
  }

  return token;
}

/**
 * Validate a share token format
 * @param token - Token to validate
 * @returns true if token is valid format
 */
export function isValidShareToken(token: string): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }
  
  if (token.length !== TOKEN_LENGTH) {
    return false;
  }
  
  // Check all characters are in the allowed alphabet
  for (const char of token) {
    if (!ALPHABET.includes(char)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Build a full share URL from a token
 * @param token - Share token
 * @param baseUrl - Base URL (defaults to production URL)
 * @returns Full share URL
 */
export function buildShareUrl(token: string, baseUrl?: string): string {
  const base = baseUrl || process.env.NEXT_PUBLIC_BASE_URL || 'https://webtomind.com';
  return `${base}/s/${token}`;
}

// Export constants for testing
export const SHARE_TOKEN_LENGTH = TOKEN_LENGTH;
export const SHARE_TOKEN_ALPHABET = ALPHABET;
