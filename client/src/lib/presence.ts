/**
 * Telegram-style "last seen" formatting.
 * Wave 0 stub — implemented by Agent B (Task B.1).
 *
 * @param status  user status string ('ONLINE' | 'OFFLINE' | 'AWAY')
 * @param lastSeen ISO timestamp string of the user's last activity
 * @param t        i18next translation function
 */
export const formatLastSeen = (
  _status: string,
  _lastSeen?: string,
  _t?: (key: string, opts?: any) => string
): string => {
  // TODO(Agent B): implement presence buckets (online, just now, minutes ago,
  // last seen today, yesterday, days ago, weeks ago, long time ago).
  return '';
};
