/**
 * JESS Salon at Home — business-logic unit tests.
 *
 * Pure tests for the booking rules (service combinations, pricing,
 * scheduling). No database, no network, no mocks of external services.
 *
 * Run with:  npm test
 * (which runs `tsx --test tests/booking.test.ts`)
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  validateCombination,
  calculatePricing,
  haircutTotal,
  serviceHours,
  calculateDuration,
  roundUpToHour,
  getDepartureSlots,
  getManilaDateTime,
  buildBlock,
  blocksOverlap,
  formatCurrency,
  formatTime,
  toISODate,
  type BookingSelection,
  type TimeBlock,
} from '../src/lib/booking';
import { findMajorService, findVariant, SERVICE_AREAS } from '../src/lib/catalogue';

function sel(haircutQuantity: number, majorIds: [string, string][]): BookingSelection {
  return {
    haircutQuantity,
    majorSelections: majorIds.map(([serviceId, variantId]) => ({ serviceId, variantId })),
    serviceAreaId: 'metro-manila',
  };
}

/* ------------------------------------------------------------------ */
/* Combination rules                                                   */
/* ------------------------------------------------------------------ */

test('combination: 1-5 haircuts alone are allowed', () => {
  for (let n = 1; n <= 5; n++) {
    assert.equal(validateCombination(n, 0).valid, true, `${n} haircuts should be allowed`);
  }
});

test('combination: 6 haircuts are not allowed', () => {
  const r = validateCombination(6, 0);
  assert.equal(r.valid, false);
  assert.match(r.reason ?? '', /5 haircuts|larger groups/i);
});

test('combination: 1 haircut + 1 major is allowed', () => {
  assert.equal(validateCombination(1, 1).valid, true);
});

test('combination: 1 haircut + 2 majors is NOT allowed', () => {
  const r = validateCombination(1, 2);
  assert.equal(r.valid, false);
});

test('combination: 2 major services alone are allowed', () => {
  assert.equal(validateCombination(0, 2).valid, true);
});

test('combination: 3 major services are NOT allowed', () => {
  const r = validateCombination(0, 3);
  assert.equal(r.valid, false);
});

test('combination: 2 haircuts + 1 major is NOT allowed', () => {
  const r = validateCombination(2, 1);
  assert.equal(r.valid, false);
});

test('combination: empty selection is not valid', () => {
  assert.equal(validateCombination(0, 0).valid, false);
});

/* ------------------------------------------------------------------ */
/* Pricing                                                             */
/* ------------------------------------------------------------------ */

test('pricing: haircut total uses first-person + additional model', () => {
  assert.equal(haircutTotal(1), 999);
  assert.equal(haircutTotal(2), 1499); // 999 + 500
  assert.equal(haircutTotal(3), 1999); // 999 + 500 + 500
  assert.equal(haircutTotal(5), 2999);
  assert.equal(haircutTotal(0), 0);
});

test('pricing: haircuts reserve 500 per person', () => {
  const s = sel(3, []); // 3 haircuts
  const p = calculatePricing(s);
  assert.equal(p.reservationFee, 1500); // 3 * 500
  assert.equal(p.totalPrice, 1999);
  assert.equal(p.remainingBalance, 1999 - 1500);
});

test('pricing: major services below 1500 reserve 500 each', () => {
  const s = sel(0, [
    ['hair-blending', 'standard'],
    ['hair-blending', 'standard'],
  ]);
  const p = calculatePricing(s);
  assert.equal(p.majorTotal, 2000);
  assert.equal(p.reservationFee, 1000);
  assert.equal(p.remainingBalance, 1000);
});

test('pricing: 1 haircut + 1 major service', () => {
  const svc = findMajorService('basic-hair-color')!;
  const variant = findVariant(svc, 'medium')!; // 2500, 3h
  const s: BookingSelection = {
    haircutQuantity: 1,
    majorSelections: [{ serviceId: svc.id, variantId: variant.id }],
    serviceAreaId: 'metro-manila',
  };
  const p = calculatePricing(s);
  assert.equal(p.haircutTotal, 999);
  assert.equal(p.majorTotal, 2500);
  assert.equal(p.totalPrice, 3499);
  assert.equal(p.reservationFee, 500 + 1500); // 2000
  assert.equal(p.remainingBalance, 3499 - 2000);
});

test('pricing: 2 major services alone', () => {
  const a = findMajorService('hair-rebonding')!;
  const av = findVariant(a, 'short')!; // 2800, 4h
  const b = findMajorService('modern-ventosa')!;
  const bv = findVariant(b, 'standard')!; // 1500, 1h
  const s: BookingSelection = {
    haircutQuantity: 0,
    majorSelections: [
      { serviceId: a.id, variantId: av.id },
      { serviceId: b.id, variantId: bv.id },
    ],
    serviceAreaId: 'cavite',
  };
  const p = calculatePricing(s);
  assert.equal(p.totalPrice, 2800 + 1500);
  assert.equal(p.reservationFee, 3000); // 2 * 1500
  assert.equal(p.remainingBalance, 4300 - 3000);
});

test('pricing: the same major service can be selected twice', () => {
  const service = findMajorService('modern-ventosa')!;
  const variant = findVariant(service, 'standard')!;
  const selection: BookingSelection = {
    haircutQuantity: 0,
    majorSelections: [
      { serviceId: service.id, variantId: variant.id },
      { serviceId: service.id, variantId: variant.id },
    ],
    serviceAreaId: 'metro-manila',
  };
  const pricing = calculatePricing(selection);
  assert.equal(pricing.majorTotal, variant.price * 2);
  assert.equal(pricing.reservationFee, 3000);
  assert.equal(serviceHours(selection), variant.durationHours * 2);
});

/* ------------------------------------------------------------------ */
/* Duration & scheduling                                               */
/* ------------------------------------------------------------------ */

test('duration: service hours = haircut hours + major hours', () => {
  const svc = findMajorService('deep-treatment')!;
  const v = findVariant(svc, 'medium')!; // 3h
  const s: BookingSelection = {
    haircutQuantity: 1,
    majorSelections: [{ serviceId: svc.id, variantId: v.id }],
    serviceAreaId: 'metro-manila',
  };
  assert.equal(serviceHours(s), 1 + 3); // 1h haircut + 3h treatment
});

test('roundUpToHour rounds 2.5 -> 3 and 5 -> 5', () => {
  assert.equal(roundUpToHour(2.5), 3);
  assert.equal(roundUpToHour(5), 5);
  assert.equal(roundUpToHour(0.1), 1);
  assert.equal(roundUpToHour(7), 7);
});

test('duration: committed hours = ceil(service + travel)', () => {
  // 1h haircut + 1.5h travel metro manila = 2.5 -> 3h
  const s1: BookingSelection = {
    haircutQuantity: 1,
    majorSelections: [],
    serviceAreaId: 'metro-manila',
  };
  const d1 = calculateDuration(s1);
  assert.equal(d1.serviceHours, 1);
  assert.equal(d1.travelHours, 1.5);
  assert.equal(d1.committedHours, 3);

  // 3h service + 2h travel cavite = 5h
  const svc = findMajorService('deep-treatment')!;
  const v = findVariant(svc, 'medium')!; // 3h
  const s2: BookingSelection = {
    haircutQuantity: 0,
    majorSelections: [{ serviceId: svc.id, variantId: v.id }],
    serviceAreaId: 'cavite',
  };
  const d2 = calculateDuration(s2);
  assert.equal(d2.committedHours, 5);
});

test('scheduling: blocksOverlap detects overlap and adjacency', () => {
  const a: TimeBlock = { startMin: 8 * 60, endMin: 11 * 60 }; // 8-11
  const overlap: TimeBlock = { startMin: 10 * 60, endMin: 12 * 60 }; // 10-12 overlaps
  const adjacent: TimeBlock = { startMin: 11 * 60, endMin: 13 * 60 }; // 11-13 adjacent, no overlap
  const separate: TimeBlock = { startMin: 14 * 60, endMin: 16 * 60 };
  assert.equal(blocksOverlap(a, overlap), true);
  assert.equal(blocksOverlap(a, adjacent), false); // touching ends don't overlap
  assert.equal(blocksOverlap(a, separate), false);
});

test('scheduling: buildBlock matches departure + committed hours', () => {
  const b = buildBlock(8, 3);
  assert.equal(b.startMin, 480);
  assert.equal(b.endMin, 660); // 11:00
});

test('scheduling: slots fit within 8-18 working window', () => {
  // 3h committed in metro manila -> latest departure 15:00 (18-3)
  const slots = getDepartureSlots(3, 1.5, '2099-01-01', []);
  const hours = slots.map((s) => s.hour);
  assert.equal(hours[0], 8);
  assert.equal(hours[hours.length - 1], 15); // 18 - 3
  assert.ok(hours.every((h) => h >= 8 && h <= 15));
  // all available when no existing bookings
  assert.ok(slots.every((s) => s.available));
});

test('scheduling: Manila time determines today and past departure slots', () => {
  const now = new Date('2026-01-01T01:30:00.000Z'); // 9:30 AM in Manila
  assert.deepEqual(getManilaDateTime(now), { date: '2026-01-01', minutes: 570 });

  const slots = getDepartureSlots(1, 0, '2026-01-01', [], now);
  assert.equal(slots.find((slot) => slot.hour === 9)?.available, false);
  assert.equal(slots.find((slot) => slot.hour === 10)?.available, true);
});

test('scheduling: Manila date can differ from the UTC date', () => {
  const now = new Date('2026-01-01T16:30:00.000Z');
  assert.deepEqual(getManilaDateTime(now), { date: '2026-01-02', minutes: 30 });
});

test('scheduling: a 7h committed block must fit (latest dep 11)', () => {
  const slots = getDepartureSlots(7, 3, '2099-01-01', []);
  const hours = slots.map((s) => s.hour);
  assert.equal(hours[0], 8);
  assert.equal(hours[hours.length - 1], 11); // 18 - 7
});

test('scheduling: existing blocks mark overlapping slots unavailable', () => {
  // Existing booking 8-11
  const existing: TimeBlock[] = [{ startMin: 480, endMin: 660 }];
  const slots = getDepartureSlots(3, 1.5, '2099-01-01', existing);
  // departure 8 -> block 8-11 overlaps -> unavailable
  const s8 = slots.find((s) => s.hour === 8)!;
  assert.equal(s8.available, false);
  // departure 11 -> block 11-14, no overlap -> available
  const s11 = slots.find((s) => s.hour === 11)!;
  assert.equal(s11.available, true);
});

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

test('formatCurrency formats pesos', () => {
  assert.equal(formatCurrency(1500), '₱1,500');
  assert.equal(formatCurrency(5991), '₱5,991');
  assert.equal(formatCurrency(0), '₱0');
});

test('formatTime formats 12-hour', () => {
  assert.equal(formatTime(8 * 60), '8:00 AM');
  assert.equal(formatTime(13 * 60), '1:00 PM');
  assert.equal(formatTime(18 * 60), '6:00 PM');
  assert.equal(formatTime(630), '10:30 AM');
});

test('toISODate produces local YYYY-MM-DD', () => {
  const d = new Date(2026, 0, 5); // Jan 5 2026 local
  assert.equal(toISODate(d), '2026-01-05');
});

/* ------------------------------------------------------------------ */
/* Catalogue integrity                                                */
/* ------------------------------------------------------------------ */

test('catalogue: every major service has at least one variant with price>0', () => {
  for (const s of require('../src/lib/catalogue').MAJOR_SERVICES) {
    assert.ok(s.variants.length >= 1, `${s.name} has no variants`);
    for (const v of s.variants) {
      assert.ok(v.price > 0, `${s.name}/${v.label} has no price`);
      assert.ok(v.durationHours >= 1, `${s.name}/${v.label} has no duration`);
    }
  }
});

test('catalogue: 4 service areas with travel times', () => {
  assert.equal(SERVICE_AREAS.length, 4);
  const mm = SERVICE_AREAS.find((a) => a.id === 'metro-manila')!;
  assert.equal(mm.travelHours, 1.5);
  const bat = SERVICE_AREAS.find((a) => a.id === 'batangas')!;
  assert.equal(bat.travelHours, 3);
});

test('catalogue: haircut reservation fee 500, major 1500', () => {
  const { RESERVATION_FEE_HAIRCUT, RESERVATION_FEE_MAJOR } = require('../src/lib/catalogue');
  assert.equal(RESERVATION_FEE_HAIRCUT, 500);
  assert.equal(RESERVATION_FEE_MAJOR, 1500);
});
