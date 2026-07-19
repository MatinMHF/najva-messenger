/**
 * Local avatar helpers — render initials + a deterministic gradient from a name,
 * so we never leak contact names to an external avatar service (e.g. ui-avatars).
 */
export function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

export function avatarGradient(name: string): string {
  let h = 0;
  const s = name || '?';
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(135deg, hsl(${hue} 52% 46%), hsl(${(hue + 26) % 360} 54% 38%))`;
}
