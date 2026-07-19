/**
 * Persistent flag set after a flow-D (cryptographic-loss) reset so the app can
 * keep reminding the user that their pre-reset messages are permanently
 * unreadable. Lives in localStorage so the notice survives reloads until the
 * user explicitly dismisses it.
 */
const KEY = 'najva:history-lost';

export const markHistoryLost = (): void => {
  try {
    localStorage.setItem(KEY, String(Date.now()));
  } catch {
    // Non-fatal: the banner just won't persist if storage is unavailable.
  }
};

export const isHistoryLost = (): boolean => {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
};

export const clearHistoryLost = (): void => {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
};
