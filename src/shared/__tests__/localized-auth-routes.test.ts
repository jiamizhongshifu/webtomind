import { describe, expect, it } from 'vitest';
import {
  isLocalizedAuthCallbackRoute,
  isLocalizedLoginRoute,
  stripLocaleRoutePrefix
} from '../seo-route-paths';

describe('localized auth route helpers', () => {
  it('normalizes supported locale prefixes before route checks', () => {
    expect(stripLocaleRoutePrefix('/login')).toBe('/login');
    expect(stripLocaleRoutePrefix('/zh-CN/login')).toBe('/login');
    expect(stripLocaleRoutePrefix('/en-US/auth/callback')).toBe(
      '/auth/callback'
    );
    expect(stripLocaleRoutePrefix('/zh-CN/prompts/case-one/')).toBe(
      '/prompts/case-one'
    );
  });

  it('recognizes localized login routes', () => {
    expect(isLocalizedLoginRoute('/login')).toBe(true);
    expect(isLocalizedLoginRoute('/zh-CN/login')).toBe(true);
    expect(isLocalizedLoginRoute('/en-US/login')).toBe(true);
    expect(isLocalizedLoginRoute('/zh-CN/login/help')).toBe(false);
  });

  it('recognizes localized auth callback routes', () => {
    expect(isLocalizedAuthCallbackRoute('/auth/callback')).toBe(true);
    expect(isLocalizedAuthCallbackRoute('/zh-CN/auth/callback')).toBe(true);
    expect(isLocalizedAuthCallbackRoute('/en-US/auth/callback')).toBe(true);
    expect(isLocalizedAuthCallbackRoute('/en-US/auth/callback/extra')).toBe(
      false
    );
  });
});
