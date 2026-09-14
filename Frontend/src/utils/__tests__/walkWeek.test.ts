import {
  filterToCurrentSeoulWeek,
  getCurrentSeoulWeekBounds,
} from '../walkWeek';

type Walk = { startedAt?: string };

describe('filterToCurrentSeoulWeek', () => {
  const sundayInSeoul = new Date('2026-08-23T03:00:00.000Z');

  it('keeps Monday through Sunday walks when the current day is Sunday in Seoul', () => {
    const walks: Walk[] = [
      { startedAt: '2026-08-16T14:59:59.999Z' },
      { startedAt: '2026-08-16T15:00:00.000Z' },
      { startedAt: '2026-08-22T14:59:59.999Z' },
      { startedAt: '2026-08-22T15:00:00.000Z' },
      { startedAt: '2026-08-23T14:59:59.999Z' },
    ];

    expect(filterToCurrentSeoulWeek(walks, (walk) => walk.startedAt, sundayInSeoul)).toEqual(
      walks.slice(1)
    );
  });

  it('does not treat an old record as part of the current week', () => {
    const walks: Walk[] = [{ startedAt: '2026-08-01T00:00:00.000Z' }];

    expect(filterToCurrentSeoulWeek(walks, (walk) => walk.startedAt, sundayInSeoul)).toEqual([]);
  });

  it('uses Monday 00:00 through the following Monday 00:00 in Seoul', () => {
    expect(getCurrentSeoulWeekBounds(sundayInSeoul)).toEqual({
      start: Date.parse('2026-08-16T15:00:00.000Z'),
      end: Date.parse('2026-08-23T15:00:00.000Z'),
    });
  });
});
