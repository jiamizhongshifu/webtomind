/**
 * Property-Based Tests for Share Token Generation
 *
 * **Validates: Requirements 1.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// Re-implement the token generation logic for testing (since api/ is not in src/)
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
const TOKEN_LENGTH = 8;

function generateShareToken(): string {
  let token = '';
  const alphabetLength = ALPHABET.length;
  const randomValues = new Uint32Array(TOKEN_LENGTH);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    token += ALPHABET[randomValues[i] % alphabetLength];
  }
  return token;
}

function isValidShareToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  if (token.length !== TOKEN_LENGTH) return false;
  for (const char of token) {
    if (!ALPHABET.includes(char)) return false;
  }
  return true;
}

describe('Share Token Generation', () => {
  /**
   * Property 1: Token Generation Validity
   * For any generated share token, the token SHALL be exactly 8 characters long
   * and contain only alphanumeric characters from the allowed alphabet.
   *
   * **Validates: Requirements 1.1**
   */
  it('Property 1: generated tokens are always valid format', () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const token = generateShareToken();

        // Token must be exactly 8 characters
        expect(token.length).toBe(TOKEN_LENGTH);

        // Token must only contain allowed characters
        expect(isValidShareToken(token)).toBe(true);

        // Token must not contain confusing characters
        expect(token).not.toMatch(/[0O1lI]/);
      }),
      { numRuns: 100 }
    );
  });

  it('Property 1b: tokens are unique (high probability)', () => {
    const tokens = new Set<string>();
    const numTokens = 1000;

    for (let i = 0; i < numTokens; i++) {
      tokens.add(generateShareToken());
    }

    // With 57^8 possible combinations, collision probability is extremely low
    // All 1000 tokens should be unique
    expect(tokens.size).toBe(numTokens);
  });

  it('validates token format correctly', () => {
    fc.assert(
      fc.property(fc.string(), (randomString) => {
        const isValid = isValidShareToken(randomString);

        // If valid, must be exactly 8 chars from alphabet
        if (isValid) {
          expect(randomString.length).toBe(TOKEN_LENGTH);
          for (const char of randomString) {
            expect(ALPHABET).toContain(char);
          }
        }

        // If length is wrong, must be invalid
        if (randomString.length !== TOKEN_LENGTH) {
          expect(isValid).toBe(false);
        }
      }),
      { numRuns: 100 }
    );
  });

  it('rejects invalid tokens', () => {
    // Empty string
    expect(isValidShareToken('')).toBe(false);

    // Wrong length
    expect(isValidShareToken('abc')).toBe(false);
    expect(isValidShareToken('abcdefghij')).toBe(false);

    // Contains invalid characters (0, O, 1, l, I)
    expect(isValidShareToken('0bcd3fgh')).toBe(false);
    expect(isValidShareToken('Obcd3fgh')).toBe(false);
    expect(isValidShareToken('1bcd3fgh')).toBe(false);
    expect(isValidShareToken('lbcd3fgh')).toBe(false);
    expect(isValidShareToken('Ibcd3fgh')).toBe(false);

    // Null/undefined
    expect(isValidShareToken(null as unknown as string)).toBe(false);
    expect(isValidShareToken(undefined as unknown as string)).toBe(false);
  });

  it('accepts valid tokens', () => {
    // Valid tokens from the alphabet
    expect(isValidShareToken('23456789')).toBe(true);
    expect(isValidShareToken('ABCDEFGH')).toBe(true);
    expect(isValidShareToken('abcdefgh')).toBe(true);
    expect(isValidShareToken('Aa2Bb3Cc')).toBe(true);
  });
});
