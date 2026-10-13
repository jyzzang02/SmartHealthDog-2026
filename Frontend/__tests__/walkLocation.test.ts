import {
  evaluateWalkLocationTransition,
  splitPathBySegmentStartIndices,
  WalkCoordinate,
} from '../src/utils/walkLocation';

const defaults = {
  minDistanceKm: 0.005,
  maxSpeedMetersPerSecond: 8,
  maxGapMs: 5 * 60_000,
};

const evaluate = (
  previous: WalkCoordinate | null,
  previousAtMs: number | null,
  current: WalkCoordinate,
  currentAtMs: number,
) =>
  evaluateWalkLocationTransition({
    previous,
    previousAtMs,
    current,
    currentAtMs,
    ...defaults,
  });

describe('evaluateWalkLocationTransition', () => {
  it('counts both legs when returning along the same route', () => {
    const start = { latitude: 37.5, longitude: 126.9 };
    const turnaround = { latitude: 37.5036, longitude: 126.9 };

    const outbound = evaluate(start, 0, turnaround, 5 * 60_000);
    const inbound = evaluate(turnaround, 5 * 60_000, start, 10 * 60_000);

    expect(outbound.type).toBe('accumulate');
    expect(inbound.type).toBe('accumulate');
    expect(outbound.distanceKm + inbound.distanceKm).toBeGreaterThan(0.79);
  });

  it('starts a new baseline instead of counting an unknown long-gap jump', () => {
    const beforeGap = { latitude: 37.5, longitude: 126.9 };
    const afterGap = { latitude: 37.5135, longitude: 126.9 };

    expect(evaluate(beforeGap, 0, afterGap, 10 * 60_000)).toEqual({
      type: 'baseline',
      distanceKm: 0,
    });
  });

  it('rejects duplicate or out-of-order timestamps', () => {
    const previous = { latitude: 37.5, longitude: 126.9 };
    const current = { latitude: 37.501, longitude: 126.9 };

    expect(evaluate(previous, 10_000, current, 10_000).type).toBe('reject');
    expect(evaluate(previous, 10_000, current, 9_000).type).toBe('reject');
  });

  it('rejects a location jump faster than walking', () => {
    const previous = { latitude: 37.5, longitude: 126.9 };
    const current = { latitude: 37.51, longitude: 126.9 };

    expect(evaluate(previous, 0, current, 10_000).type).toBe('reject');
  });
});

describe('splitPathBySegmentStartIndices', () => {
  it('keeps route gaps as separate drawable segments', () => {
    const points = ['a', 'b', 'c', 'd', 'e'];

    expect(splitPathBySegmentStartIndices(points, [2, 4])).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e'],
    ]);
  });

  it('ignores duplicate and out-of-range segment starts', () => {
    const points = ['a', 'b', 'c'];

    expect(splitPathBySegmentStartIndices(points, [0, 2, 2, 5])).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
  });
});
