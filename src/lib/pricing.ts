/**
 * Price calculation utilities — server-side authoritative source.
 *
 * Frontend prices are NEVER trusted. The backend recalculates everything
 * from the database `Service` / `ServiceVariant` rows.
 *
 * Reservation fee rules (from the brief):
 *   - ₱500 per haircut unit
 *   - ₱1,500 per major service unit
 * The reservation fee is deducted from the total service price; the balance
 * is paid in cash at the appointment.
 *
 * All amounts are in PHP centavos (₱1 = 100).
 */

import { getSupabaseAdminClient } from "./db";
import {
  HAIRCUT_BASE_DURATION,
  HAIRCUT_BASE_PRICE,
  ADDITIONAL_HAIRCUT_PERSON,
  RESERVATION_FEE_HAIRCUT,
  RESERVATION_FEE_MAJOR,
} from "./catalogue";

export interface SelectedLineInput {
  serviceSlug: string;
  // null/undefined for services without variants
  variantName?: string | null;
  // for haircuts, the quantity represents the number of people
  quantity: number;
}

export interface PricedLine {
  serviceId: string;
  serviceName: string;
  variantName: string | null;
  unitPrice: number; // centavos
  unitDuration: number; // minutes
  unitCategory: "haircut" | "major";
  quantity: number;
  linePrice: number; // unit * qty
  lineDuration: number; // unit * qty
}

export interface PriceBreakdown {
  lines: PricedLine[];
  totalServicePrice: number; // centavos
  totalServiceMinutes: number; // minutes
  reservationFee: number; // centavos
  remainingBalance: number; // centavos
  haircutCount: number;
  majorCount: number;
}

export class ServicePricingUnavailableError extends Error {
  constructor() {
    super("Service pricing could not be loaded.");
    this.name = "ServicePricingUnavailableError";
  }
}

/**
 * Price a haircut line.
 *
 * The brief says:
 *   Haircut base price: ₱999
 *   Base duration: 1 hour per person
 *   Additional person charge: ₱500 per additional person
 *
 * The exact additional *time* required for extra haircut customers has not
 * been finalized. We therefore bill each additional person at ₱500 with the
 * SAME 1-hour duration per person (so a 3-person haircut = ₱999 + ₱500 + ₱500
 * = ₱1,999 total price, 3 hours total duration). This rule is documented in
 * the README as the current assumption and is easy to change in one place.
 */
function priceHaircutLine(
  serviceId: string,
  serviceName: string,
  quantity: number,
): PricedLine {
  if (quantity <= 0) {
    return {
      serviceId,
      serviceName,
      variantName: null,
      unitPrice: 0,
      unitDuration: 0,
      unitCategory: "haircut",
      quantity: 0,
      linePrice: 0,
      lineDuration: 0,
    };
  }

  // first person ₱999, every additional person ₱500
  const linePrice = HAIRCUT_BASE_PRICE + Math.max(0, quantity - 1) * ADDITIONAL_HAIRCUT_PERSON;
  // 1 hour per person
  const lineDuration = quantity * HAIRCUT_BASE_DURATION;

  return {
    serviceId,
    serviceName,
    variantName: null,
    unitPrice: quantity === 1 ? HAIRCUT_BASE_PRICE : Math.round(linePrice / quantity),
    unitDuration: HAIRCUT_BASE_DURATION,
    unitCategory: "haircut",
    quantity,
    linePrice,
    lineDuration,
  };
}

export async function priceSelection(lines: SelectedLineInput[]): Promise<PriceBreakdown> {
  const db = getSupabaseAdminClient();
  const priced: PricedLine[] = [];

  for (const line of lines) {
    const { data: svc, error } = await db
      .from("services")
      .select(
        "id, name, category, base_price, base_duration, variants:service_variants(name, price, duration)",
      )
      .eq("slug", line.serviceSlug)
      .maybeSingle();
    if (error) {
      console.error("Could not load service pricing:", error);
      throw new ServicePricingUnavailableError();
    }
    if (!svc) throw new Error(`Unknown service: ${line.serviceSlug}`);

    if (svc.category === "haircut") {
      // Haircuts ignore variants. quantity = number of people.
      priced.push(priceHaircutLine(svc.id, svc.name, line.quantity));
      continue;
    }

    // Major service: must pick exactly one variant if variants exist.
    let unitPrice = svc.base_price;
    let unitDuration = svc.base_duration;
    let variantName: string | null = null;

    if (svc.variants.length > 0) {
      if (!line.variantName) {
        throw new Error(`${svc.name} requires a variant selection.`);
      }
      const v = svc.variants.find((x) => x.name === line.variantName);
      if (!v) {
        throw new Error(`Variant "${line.variantName}" not found for ${svc.name}.`);
      }
      unitPrice = v.price;
      unitDuration = v.duration;
      variantName = v.name;
    }

    const qty = Math.max(1, Math.floor(line.quantity || 1));
    priced.push({
      serviceId: svc.id,
      serviceName: svc.name,
      variantName,
      unitPrice,
      unitDuration,
      unitCategory: "major",
      quantity: qty,
      linePrice: unitPrice * qty,
      lineDuration: unitDuration * qty,
    });
  }

  const totalServicePrice = priced.reduce((s, l) => s + l.linePrice, 0);
  const totalServiceMinutes = priced.reduce((s, l) => s + l.lineDuration, 0);
  const haircutCount = priced.filter((l) => l.unitCategory === "haircut").reduce((s, l) => s + l.quantity, 0);
  const majorCount = priced.filter((l) => l.unitCategory === "major").reduce((s, l) => s + l.quantity, 0);
  const reservationFee = haircutCount * RESERVATION_FEE_HAIRCUT + majorCount * RESERVATION_FEE_MAJOR;
  const remainingBalance = Math.max(0, totalServicePrice - reservationFee);

  return {
    lines: priced,
    totalServicePrice,
    totalServiceMinutes,
    reservationFee,
    remainingBalance,
    haircutCount,
    majorCount,
  };
}

// ---------------------------------------------------------------------------
// Reference generator
// ---------------------------------------------------------------------------

export function generateBookingReference(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I, O
  const pick = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  const digits = Math.floor(10 + Math.random() * 90); // 10–99
  return `JESS-${pick(2)}${digits}${pick(2)}`;
}

// ---------------------------------------------------------------------------
// Formatting helpers (shared by frontend + admin)
// ---------------------------------------------------------------------------

export function formatPHP(centavos: number): string {
  const pesos = centavos / 100;
  return "₱" + pesos.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
