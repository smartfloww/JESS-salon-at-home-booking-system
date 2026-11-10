/**
 * Smoke tests for the booking-combination rules.
 *
 * Run with:  bun test tests/booking-rules.test.ts
 *
 * These tests verify the pure booking-rule logic from src/lib/booking-rules.ts
 * — no database, no network. They cover the allowed/forbidden combinations
 * table from the project brief.
 */

import { expect, test, describe } from "bun:test";
import {
  countCombo,
  validateCombo,
  canAddUnit,
  isGroupBooking,
} from "../src/lib/booking-rules";

describe("countCombo", () => {
  test("sums haircut and major quantities", () => {
    expect(
      countCombo([
        { unitCategory: "haircut", quantity: 2 },
        { unitCategory: "major", quantity: 1 },
      ]),
    ).toEqual({ haircuts: 2, majors: 1 });
  });
});

describe("validateCombo (from the brief's table)", () => {
  test("1 haircut → allowed", () => {
    expect(validateCombo({ haircuts: 1, majors: 0 }).ok).toBe(true);
  });
  test("3 haircuts → allowed", () => {
    expect(validateCombo({ haircuts: 3, majors: 0 }).ok).toBe(true);
  });
  test("5 haircuts → allowed", () => {
    expect(validateCombo({ haircuts: 5, majors: 0 }).ok).toBe(true);
  });
  test("6 haircuts → NOT allowed", () => {
    expect(validateCombo({ haircuts: 6, majors: 0 }).ok).toBe(false);
  });
  test("1 haircut + 1 major → allowed", () => {
    expect(validateCombo({ haircuts: 1, majors: 1 }).ok).toBe(true);
  });
  test("1 haircut + 2 majors → NOT allowed", () => {
    expect(validateCombo({ haircuts: 1, majors: 2 }).ok).toBe(false);
  });
  test("2 majors → allowed", () => {
    expect(validateCombo({ haircuts: 0, majors: 2 }).ok).toBe(true);
  });
  test("3 majors → NOT allowed", () => {
    expect(validateCombo({ haircuts: 0, majors: 3 }).ok).toBe(false);
  });
  test("2 haircuts + 1 major → NOT allowed", () => {
    expect(validateCombo({ haircuts: 2, majors: 1 }).ok).toBe(false);
  });
});

describe("canAddUnit (proactive disabling)", () => {
  test("can add 1st major when 2 majors already selected? NO", () => {
    // 2 majors already → adding a 3rd should be blocked
    expect(canAddUnit({ haircuts: 0, majors: 2 }, "major").ok).toBe(false);
  });
  test("can add a major when 3 haircuts selected? NO", () => {
    expect(canAddUnit({ haircuts: 3, majors: 0 }, "major").ok).toBe(false);
  });
  test("can add a major when 1 haircut selected? YES", () => {
    expect(canAddUnit({ haircuts: 1, majors: 0 }, "major").ok).toBe(true);
  });
  test("can add a 2nd major when 1 major selected (no haircuts)? YES", () => {
    expect(canAddUnit({ haircuts: 0, majors: 1 }, "major").ok).toBe(true);
  });
  test("can add a 6th haircut? NO", () => {
    expect(canAddUnit({ haircuts: 5, majors: 0 }, "haircut").ok).toBe(false);
  });
});

describe("isGroupBooking", () => {
  test("5 haircuts = group", () => {
    expect(isGroupBooking({ haircuts: 5, majors: 0 })).toBe(true);
  });
  test("3 haircuts = not group", () => {
    expect(isGroupBooking({ haircuts: 3, majors: 0 })).toBe(false);
  });
});
