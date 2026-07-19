// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  THEME_COOKIE_NAME,
  LANGUAGE_COOKIE_NAME,
  buildCookieString,
  readCookie,
  writeCookie,
  getStoredTheme,
  setStoredTheme,
  getStoredLanguage,
  setStoredLanguage,
} from '../preferences';

function clearAllCookies() {
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0].trim();
    if (name) {
      document.cookie = `${name}=; max-age=0; path=/`;
    }
  });
}

beforeEach(() => {
  clearAllCookies();
  window.localStorage.clear();
});

describe('buildCookieString', () => {
  it('sets a 1-year max-age, root path, and SameSite=Lax', () => {
    const str = buildCookieString('najva_theme', 'dark');
    expect(str).toContain('najva_theme=dark');
    expect(str).toMatch(/Max-Age=31536000/i);
    expect(str).toMatch(/Path=\//i);
    expect(str).toMatch(/SameSite=Lax/i);
  });

  it('URI-encodes the value', () => {
    const str = buildCookieString('najva_lang', 'a b');
    expect(str).toContain('najva_lang=a%20b');
  });

  it('only appends Secure when requested', () => {
    expect(buildCookieString('x', 'y', 60, false)).not.toMatch(/Secure/i);
    expect(buildCookieString('x', 'y', 60, true)).toMatch(/Secure/i);
  });
});

describe('readCookie / writeCookie', () => {
  it('returns null when the cookie is absent', () => {
    expect(readCookie('does_not_exist')).toBeNull();
  });

  it('round-trips a written value', () => {
    writeCookie('sample', 'hello');
    expect(readCookie('sample')).toBe('hello');
  });

  it('decodes URI-encoded values', () => {
    writeCookie('sample', 'a b/c');
    expect(readCookie('sample')).toBe('a b/c');
  });

  it('does not confuse cookies whose names share a prefix', () => {
    writeCookie('najva_theme', 'dark');
    writeCookie('najva_theme_extra', 'ignored');
    expect(readCookie('najva_theme')).toBe('dark');
  });
});

describe('theme preference: cookie-first, localStorage fallback', () => {
  it('returns null when nothing is stored', () => {
    expect(getStoredTheme()).toBeNull();
  });

  it('setStoredTheme writes both the cookie and localStorage', () => {
    setStoredTheme('light');
    expect(readCookie(THEME_COOKIE_NAME)).toBe('light');
    expect(window.localStorage.getItem('najva_theme')).toBe('light');
    expect(getStoredTheme()).toBe('light');
  });

  it('prefers the cookie over localStorage when both are present', () => {
    window.localStorage.setItem('najva_theme', 'dark');
    writeCookie(THEME_COOKIE_NAME, 'light');
    expect(getStoredTheme()).toBe('light');
  });

  it('falls back to localStorage when the cookie is absent', () => {
    window.localStorage.setItem('najva_theme', 'dark');
    expect(getStoredTheme()).toBe('dark');
  });

  it('ignores invalid stored values', () => {
    writeCookie(THEME_COOKIE_NAME, 'not-a-theme');
    expect(getStoredTheme()).toBeNull();
  });
});

describe('language preference: cookie-first, localStorage fallback', () => {
  it('returns null when nothing is stored', () => {
    expect(getStoredLanguage()).toBeNull();
  });

  it('setStoredLanguage writes both the cookie and localStorage', () => {
    setStoredLanguage('en');
    expect(readCookie(LANGUAGE_COOKIE_NAME)).toBe('en');
    expect(window.localStorage.getItem('najva_lang')).toBe('en');
    expect(getStoredLanguage()).toBe('en');
  });

  it('prefers the cookie over localStorage when both are present', () => {
    window.localStorage.setItem('najva_lang', 'en');
    writeCookie(LANGUAGE_COOKIE_NAME, 'fa');
    expect(getStoredLanguage()).toBe('fa');
  });

  it('falls back to localStorage when the cookie is absent', () => {
    window.localStorage.setItem('najva_lang', 'en');
    expect(getStoredLanguage()).toBe('en');
  });

  it('ignores invalid stored values', () => {
    writeCookie(LANGUAGE_COOKIE_NAME, 'xx');
    expect(getStoredLanguage()).toBeNull();
  });
});
