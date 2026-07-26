export const TRAIL_PATH_CAP_FIXTURES = Object.freeze({
  ordered: Object.freeze([
    Object.freeze({ tick: 0, time: 1_720_000_000_000, value: 1.1 }),
    Object.freeze({ tick: 1, time: 1_720_000_060_000, value: 1.2 }),
  ]),
  sameTickReplacement: Object.freeze({ tick: 1, time: 1_720_000_060_001, value: 1.25 }),
  invalid: Object.freeze([
    Object.freeze({ tick: 2, time: 1_720_000_120_000, value: Number.NaN }),
    Object.freeze({ tick: 2, time: Number.POSITIVE_INFINITY, value: 1.3 }),
    Object.freeze({ tick: -1, time: 1_720_000_120_000, value: 1.3 }),
    Object.freeze({ tick: 0, time: 1_719_999_000_000, value: 0.9 }),
  ]),
});

export function makeTrailPoint(tick) {
  return Object.freeze({
    tick,
    time: 1_720_000_000_000 + tick * 60_000,
    value: 1.1 + tick / 100_000,
  });
}
