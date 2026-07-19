/**
 * Cookie-first persistence for theme & language preferences.
 *
 * Cookies are the primary store: they are readable before authentication
 * (e.g. on the login page) and survive across sessions, so a user's choice
 * on the login screen is still applied the next time they land there.
 * localStorage is kept as a fallback/mirror for environments where cookies
 * are unavailable (and for any pre-existing locally-stored value).
 */

export type Theme = 'light' | 'dark';
export type Language = 'fa' | 'en';

export const THEME_COOKIE_NAME = 'najva_theme';
export const LANGUAGE_COOKIE_NAME = 'najva_lang';

const THEME_STORAGE_KEY = THEME_COOKIE_NAME;
const LANGUAGE_STORAGE_KEY = LANGUAGE_COOKIE_NAME;

/** 1 year, per the plan's cookie-lifetime requirement. */
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

const VALID_THEMES: readonly Theme[] = ['light', 'dark'];
const VALID_LANGUAGES: readonly Language[] = ['fa', 'en'];

function isBrowser(): boolean {
  return typeof document !== 'undefined' && typeof window !== 'undefined';
}

/** Pure string builder — kept separate from the DOM write so it's easy to unit test. */
export function buildCookieString(
  name: string,
  value: string,
  maxAgeSeconds: number = COOKIE_MAX_AGE_SECONDS,
  secure: boolean = false
): string {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; SameSite=Lax${
    secure ? '; Secure' : ''
  }`;
}

export function readCookie(name: string): string | null {
  if (!isBrowser()) return null;
  const escapedName = name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&');
  const match = document.cookie.match(new RegExp('(?:^|; )' + escapedName + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeCookie(name: string, value: string): void {
  if (!isBrowser()) return;
  const secure = window.location.protocol === 'https:';
  document.cookie = buildCookieString(name, value, COOKIE_MAX_AGE_SECONDS, secure);
}

function readLocalStorage(key: string): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocalStorage(key: string, value: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage can be unavailable (private browsing / quota) — the cookie
    // write already happened, so preferences still persist.
  }
}

function readValidated<T extends string>(
  cookieName: string,
  storageKey: string,
  valid: readonly T[]
): T | null {
  const cookieVal = readCookie(cookieName);
  if (cookieVal && (valid as readonly string[]).includes(cookieVal)) return cookieVal as T;
  const storedVal = readLocalStorage(storageKey);
  if (storedVal && (valid as readonly string[]).includes(storedVal)) return storedVal as T;
  return null;
}

export function getStoredTheme(): Theme | null {
  return readValidated(THEME_COOKIE_NAME, THEME_STORAGE_KEY, VALID_THEMES);
}

export function setStoredTheme(theme: Theme): void {
  writeCookie(THEME_COOKIE_NAME, theme);
  writeLocalStorage(THEME_STORAGE_KEY, theme);
}

export function getStoredLanguage(): Language | null {
  return readValidated(LANGUAGE_COOKIE_NAME, LANGUAGE_STORAGE_KEY, VALID_LANGUAGES);
}

export function setStoredLanguage(language: Language): void {
  writeCookie(LANGUAGE_COOKIE_NAME, language);
  writeLocalStorage(LANGUAGE_STORAGE_KEY, language);
}
