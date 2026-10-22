export type ExportPeriod = 'week' | 'month' | 'year' | 'all';

const DAY_MS = 24 * 60 * 60 * 1000;

export const EXPORT_PERIOD_OPTIONS: { value: ExportPeriod; label: string }[] = [
  { value: 'week', label: 'Past 7 days' },
  { value: 'month', label: 'Past 30 days' },
  { value: 'year', label: 'Past 12 months' },
  { value: 'all', label: 'All retained data' },
];

export function filterByPeriod<T>(
  items: T[],
  getTimestamp: (item: T) => number,
  period: ExportPeriod,
  now = Date.now(),
) {
  if (period === 'all') return items;
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
  const cutoff = now - days * DAY_MS;
  return items.filter((item) => getTimestamp(item) >= cutoff && getTimestamp(item) <= now);
}
