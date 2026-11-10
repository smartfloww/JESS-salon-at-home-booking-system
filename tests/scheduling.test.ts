/**
 * Smoke tests for the scheduling helpers.
 *
 * Run with:  bun test tests/scheduling.test.ts
 *
 * These tests cover the pure functions in src/lib/scheduling.ts that don't
 * touch the database: roundUpToHour, computeReservedMinutes, formatTime,
 * rawDepartureOptions.
 */

import { expect, test, describe } from "bun:test";
import {
  roundUpToHour,
  computeReservedMinutes,
  formatTime,
  rawDepartureOptions,
  WORK_START_MIN,
  WORK_END_MIN,
} from "../src/lib/scheduling";

describe("roundUpToHour", () => {
  test("0 stays 0", () => expect(roundUpToHour(0)).toBe(0));
  test("150 (2.5h) rounds up to 180 (3h)", () => {
    expect(roundUpToHour(150)).toBe(180);
  });
  test("180 (3h) stays 180", () => {
    expect(roundUpToHour(180)).toBe(180);
  });
  test("181 rounds up to 240", () => {
    expect(roundUpToHour(181)).toBe(240);
  });
});

describe("computeReservedMinutes (brief examples)", () => {
  // | Service | Travel | Actual total | Reserved block |
  // | 1 hr    | 1.5 hr | 2.5 hr       | 3 hr          |
  // | 3 hr    | 2 hr   | 5 hr         | 5 hr          |
  // | 4 hr    | 1.5 hr | 5.5 hr       | 6 hr          |
  // | 6 hr    | 3 hr   | 9 hr         | 9 hr          |
  // | 7 hr    | 3 hr   | 10 hr        | 10 hr         |
  test("1h service + 1.5h travel = 3h reserved", () => {
    expect(computeReservedMinutes(60, 90)).toBe(180);
  });
  test("3h service + 2h travel = 5h reserved", () => {
    expect(computeReservedMinutes(180, 120)).toBe(300);
  });
  test("4h service + 1.5h travel = 6h reserved", () => {
    expect(computeReservedMinutes(240, 90)).toBe(360);
  });
  test("6h service + 3h travel = 9h reserved", () => {
    expect(computeReservedMinutes(360, 180)).toBe(540);
  });
  test("7h service + 3h travel = 10h reserved", () => {
    expect(computeReservedMinutes(420, 180)).toBe(600);
  });
});

describe("formatTime", () => {
  test("8:00 AM = 480 min", () => {
    expect(formatTime(480)).toBe("8:00 AM");
  });
  test("3:00 PM = 900 min", () => {
    expect(formatTime(900)).toBe("3:00 PM");
  });
  test("6:00 PM = 1080 min", () => {
    expect(formatTime(1080)).toBe("6:00 PM");
  });
});

describe("rawDepartureOptions", () => {
  test("3-hour block fits in 8AM-6PM window with 1-hour intervals", () => {
    const opts = rawDepartureOptions(180); // 3-hour reserved block
    // 8 AM start, must end by 6 PM (1080)
    // 8 + 3 = 11 → ok; 9 + 3 = 12 → ok; ...; 15 + 3 = 18 → ok (1080)
    // 16 + 3 = 19 → out of window
    expect(opts[0]).toBe(480); // 8 AM
    expect(opts[opts.length - 1]).toBe(900); // 3 PM
    expect(opts.length).toBe(8); // 8, 9, 10, 11, 12, 13, 14, 15 (hours)
  });
  test("10-hour block (max) only fits at 8 AM", () => {
    const opts = rawDepartureOptions(600); // 10-hour block
    expect(opts).toEqual([480]); // only 8 AM
  });
  test("11-hour block does NOT fit", () => {
    const opts = rawDepartureOptions(660); // 11-hour block
    expect(opts).toEqual([]);
  });
});
