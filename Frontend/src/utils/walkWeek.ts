const DAY_MS = 24 * 60 * 60 * 1000;
const SEOUL_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;

const getSeoulCalendarDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const valueFor = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return {
    year: valueFor('year'),
    month: valueFor('month'),
    day: valueFor('day'),
  };
};

export const getCurrentSeoulWeekBounds = (referenceDate = new Date()) => {
  const { year, month, day } = getSeoulCalendarDate(referenceDate);
  const seoulCalendarTimestamp = Date.UTC(year, month - 1, day);
  const weekday = new Date(seoulCalendarTimestamp).getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const start =
    seoulCalendarTimestamp - daysSinceMonday * DAY_MS - SEOUL_UTC_OFFSET_MS;

  return { start, end: start + 7 * DAY_MS };
};

export const filterToCurrentSeoulWeek = <T>(
  items: T[],
  getStartedAt: (item: T) => string | undefined,
  referenceDate = new Date()
) => {
  const { start, end } = getCurrentSeoulWeekBounds(referenceDate);

  return items.filter((item) => {
    const startedAt = getStartedAt(item);
    const timestamp = startedAt ? new Date(startedAt).getTime() : Number.NaN;
    return Number.isFinite(timestamp) && timestamp >= start && timestamp < end;
  });
};
