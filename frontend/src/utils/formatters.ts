export function formatTimestamp(
  timestamp: number,
  t: (key: string, options?: Record<string, unknown>) => string,
  prefix = 'notesPage',
): string {
  const now = new Date();
  const date = new Date(timestamp * 1000);
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t(`${prefix}.today`);
  if (diffDays === 1) return t(`${prefix}.yesterday`);
  if (diffDays < 7) return t(`${prefix}.daysAgo`, { count: diffDays });
  if (diffDays < 30) return t(`${prefix}.weeksAgo`, { count: Math.floor(diffDays / 7) });
  return t(`${prefix}.monthsAgo`, { count: Math.floor(diffDays / 30) });
}
