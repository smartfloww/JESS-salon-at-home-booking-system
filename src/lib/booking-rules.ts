/**
 * Booking combination rules.
 *
 * Allowed combinations (from the brief):
 *  - Up to 5 haircuts, with no major service.
 *  - 1 haircut + 1 major service.
 *  - 1 or 2 major services, with no haircut.
 *
 * A "unit" is one selected service line. For haircuts each line is one person.
 */

export interface ComboCounts {
  haircuts: number;
  majors: number;
}

export interface ComboCheckResult {
  ok: boolean;
  reason?: string;
}

const MAX_HAIRCUTS = 5;
const MAX_MAJORS = 2;

export function countCombo(items: { unitCategory: "haircut" | "major"; quantity: number }[]): ComboCounts {
  let haircuts = 0;
  let majors = 0;
  for (const it of items) {
    if (it.unitCategory === "haircut") haircuts += it.quantity;
    else majors += it.quantity;
  }
  return { haircuts, majors };
}

export function validateCombo(counts: ComboCounts): ComboCheckResult {
  const { haircuts, majors } = counts;

  if (haircuts === 0 && majors === 0) {
    return { ok: true };
  }

  // No haircuts → up to 2 majors.
  if (haircuts === 0) {
    if (majors > MAX_MAJORS) {
      return { ok: false, reason: "Maximum 2 major services per appointment." };
    }
    return { ok: true };
  }

  // Haircuts selected.
  if (haircuts > MAX_HAIRCUTS) {
    return { ok: false, reason: "Maximum 5 haircuts per appointment." };
  }

  if (majors === 0) {
    return { ok: true };
  }

  // Haircut + major: only ONE major allowed.
  if (majors > 1) {
    return {
      ok: false,
      reason: "When a major service is added to a haircut, only 1 major service is allowed.",
    };
  }

  // Haircut + 1 major: only ONE haircut allowed.
  if (haircuts > 1) {
    return {
      ok: false,
      reason: "When a major service is added, only 1 haircut is allowed.",
    };
  }

  return { ok: true };
}

/**
 * Given the current selection, decide whether ADDING one more unit of `category`
 * would still be valid. Used by the UI to disable buttons proactively.
 */
export function canAddUnit(
  current: ComboCounts,
  category: "haircut" | "major",
): ComboCheckResult {
  const next: ComboCounts =
    category === "haircut"
      ? { haircuts: current.haircuts + 1, majors: current.majors }
      : { haircuts: current.haircuts, majors: current.majors + 1 };
  return validateCombo(next);
}

export function isGroupBooking(counts: ComboCounts): boolean {
  // ~20–30 people — anything that hits or exceeds the haircut cap is treated
  // as a likely group request.
  return counts.haircuts >= 5 || counts.haircuts + counts.majors >= 6;
}

export const BOOKING_RULES_TEXT = [
  "Up to 5 haircuts (no major service).",
  "1 haircut + 1 major service.",
  "1 or 2 major services (no haircut).",
  "Planning a group appointment (~20–30 people)? Please contact JESS directly.",
];

export const MAX_HAIRCUTS_PER_BOOKING = MAX_HAIRCUTS;
export const MAX_MAJORS_PER_BOOKING = MAX_MAJORS;
