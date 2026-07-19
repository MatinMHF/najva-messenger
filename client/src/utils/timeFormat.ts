export function formatLastSeen(
  lastSeen: Date | string | null,
  status: 'ONLINE' | 'OFFLINE' | string,
  t: any
): string {
  if (status === 'ONLINE') {
    return t('presence.online', 'online');
  }

  if (!lastSeen) {
    return t('presence.longTimeAgo', 'last seen a long time ago');
  }

  const date = typeof lastSeen === 'string' ? new Date(lastSeen) : lastSeen;
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return t('presence.justNow', 'last seen recently');
  }

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return t('presence.minutesAgo', { count: diffInMinutes }) || `last seen ${diffInMinutes} minutes ago`;
  }

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    // Check if same calendar day
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return t('presence.lastSeenToday', { time: timeStr }) || `last seen today at ${timeStr}`;
    }
    return t('presence.yesterday', 'last seen yesterday');
  }

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) {
    return t('presence.daysAgo', { count: diffInDays }) || `last seen ${diffInDays} days ago`;
  }

  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 4) {
    return t('presence.weeksAgo', { count: diffInWeeks }) || `last seen ${diffInWeeks} weeks ago`;
  }

  return t('presence.longTimeAgo', 'last seen a long time ago');
}
