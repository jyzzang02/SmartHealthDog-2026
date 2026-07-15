export const filterToLatestWeek = <T>(
  items: T[],
  getStartedAt: (item: T) => string | undefined
) => {
  const datedItems = items
    .map((item) => {
      const startedAt = getStartedAt(item);
      const timestamp = startedAt ? new Date(startedAt).getTime() : Number.NaN;
      return { item, timestamp };
    })
    .filter(({ timestamp }) => Number.isFinite(timestamp));

  if (datedItems.length === 0) return [];

  const latestTimestamp = Math.max(...datedItems.map(({ timestamp }) => timestamp));
  const weekStart = new Date(latestTimestamp);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());

  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(nextWeekStart.getDate() + 7);

  return datedItems
    .filter(({ timestamp }) => timestamp >= weekStart.getTime() && timestamp < nextWeekStart.getTime())
    .map(({ item }) => item);
};
