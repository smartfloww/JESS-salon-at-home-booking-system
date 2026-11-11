/**
 * JESS Salon at Home — Service Catalogue
 *
 * This file is the single source of truth for all service information,
 * extracted directly from the existing website's Services page.
 *
 * The Services page (public display) and the Book page (booking flow)
 * both read from this catalogue. Backend price/duration calculations
 * also use these values — the browser is NEVER trusted for prices.
 *
 * Booking combination rules (see booking-rules.ts):
 *   - A "haircut" unit = one person getting any haircut from the Haircuts category.
 *   - A "major service" = any service NOT in the Haircuts category (coloring,
 *     treatments, straightening, rebonding, perming, toupee styling, massage, ventosa).
 *
 * Pricing notes (from existing site):
 *   - Haircuts: first person ₱999, each additional person +₱500. Duration 1 hr per person.
 *   - Major services: price & duration depend on the chosen variant (length/option).
 *
 * Classification assumption (documented): every service outside the "Haircuts"
 * category is treated as a major service. This includes Toupee styling, Massage
 * and Modern Ventosa, because they live in their own categories with their own pricing.
 */

export type ServiceType = 'haircut' | 'major';

export interface ServiceVariant {
  id: string;
  label: string;
  price: number; // whole pesos (PHP)
  durationHours: number;
}

export interface Service {
  id: string;
  name: string;
  type: ServiceType;
  category: string;
  description?: string;
  variants: ServiceVariant[];
  /** Optional note shown under the price (e.g. consultation required). */
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Service areas & travel times                                        */
/* ------------------------------------------------------------------ */

export interface ServiceArea {
  id: string;
  label: string;
  travelHours: number;
}

/** One-way travel time from Batasan Hills, Quezon City. */
export const SERVICE_AREAS: ServiceArea[] = [
  { id: 'metro-manila', label: 'Metro Manila', travelHours: 1.5 },
  { id: 'cavite', label: 'Cavite', travelHours: 2 },
  { id: 'laguna', label: 'Laguna', travelHours: 2 },
  { id: 'batangas', label: 'Batangas', travelHours: 3 },
];

/* ------------------------------------------------------------------ */
/* Working hours & scheduling constants                                */
/* ------------------------------------------------------------------ */

/** JESS works every day. */
export const WORKING_START_HOUR = 8; // 8:00 AM
export const WORKING_END_HOUR = 18; // 6:00 PM
/** Length of the daily working window in hours. */
export const DAILY_WORKING_HOURS = WORKING_END_HOUR - WORKING_START_HOUR; // 10
/** Departure times are offered on fixed one-hour intervals. */
export const DEPARTURE_INTERVAL_HOURS = 1;
/** Temporary slot lock duration while a customer pays. */
export const SLOT_LOCK_MINUTES = 10;

/* ------------------------------------------------------------------ */
/* Reservation fees                                                    */
/* ------------------------------------------------------------------ */

export const RESERVATION_FEE_HAIRCUT = 500; // per haircut / person
export const RESERVATION_FEE_MAJOR = 1500; // per major service / person

/* ------------------------------------------------------------------ */
/* Haircut types (display + optional booking note)                     */
/* ------------------------------------------------------------------ */

export interface HaircutGroup {
  heading: string;
  services: string[];
}

export const HAIRCUT_GROUPS: HaircutGroup[] = [
  { heading: 'For Men', services: ['Classic Haircut', 'Modern Haircut'] },
  {
    heading: 'For Women',
    services: ['Pixie Cut', 'Bob Cut', 'Bixie Cut', 'Wolf Cut', 'Layered Cut', 'Curtain Bangs'],
  },
  {
    heading: 'Additional haircut options',
    services: [
      'Haircut for Busy Moms',
      "Kids' Haircut",
      'Haircut for Busy Professionals',
      'Haircut for Senior Citizens',
      'Haircut for Basketball Players',
      'Haircut for Persons with Disabilities (PWD)',
      'Haircut for Persons with Special Needs',
    ],
  },
];

/** Flat list of all haircut type names. */
export const HAIRCUT_TYPE_NAMES: string[] = HAIRCUT_GROUPS.flatMap((g) => g.services);

/** Haircut pricing (from existing site). */
export const HAIRCUT_FIRST_PERSON_PRICE = 999;
export const HAIRCUT_ADDITIONAL_PERSON_PRICE = 500;
export const HAIRCUT_HOURS_PER_PERSON = 1;

/** Maximum number of haircut people in a single booking. */
export const MAX_HAIRCUTS = 5;
/** Maximum number of major services in a single booking (when no haircut). */
export const MAX_MAJORS_ONLY = 2;

/* ------------------------------------------------------------------ */
/* Major services catalogue                                            */
/* ------------------------------------------------------------------ */

const lengthVariants = (rows: [string, number, number][]): ServiceVariant[] =>
  rows.map(([label, price, durationHours]) => ({
    id: slugify(label),
    label,
    price,
    durationHours,
  }));

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const MAJOR_SERVICES: Service[] = [
  // ---- Toupee Haircut & Hairstyling ----
  {
    id: 'toupee-hairstyling',
    name: 'Haircut and Hairstyling for Toupee Hair',
    type: 'major',
    category: 'Toupee Haircut & Hairstyling',
    variants: [{ id: 'standard', label: 'Standard', price: 1500, durationHours: 1 }],
  },
  {
    id: 'hair-blending',
    name: 'Hair Blending',
    type: 'major',
    category: 'Toupee Haircut & Hairstyling',
    variants: [{ id: 'standard', label: 'Standard', price: 1000, durationHours: 1 }],
  },

  // ---- Hair Coloring ----
  {
    id: 'basic-hair-color',
    name: 'Basic Hair Color',
    type: 'major',
    category: 'Hair Coloring',
    variants: lengthVariants([
      ['Roots Regrowth', 1500, 2],
      ['Short', 2000, 3],
      ['Medium', 2500, 3],
      ['Long', 3000, 4],
      ['Extra Long', 3500, 4],
      ['Super Long', 4000, 4],
    ]),
  },
  {
    id: 'fashion-color',
    name: 'Fashion Color',
    type: 'major',
    category: 'Hair Coloring',
    variants: lengthVariants([
      ['Roots Regrowth', 4999, 5],
      ['Short', 5500, 5],
      ['Medium', 6000, 6],
      ['Long', 6500, 7],
      ['Extra Long', 7000, 7],
      ['Super Long', 7500, 7],
    ]),
  },
  {
    id: 'special-hair-color',
    name: 'Special Hair Color',
    type: 'major',
    category: 'Hair Coloring',
    variants: [{ id: 'standard', label: 'Standard', price: 5991, durationHours: 6 }],
  },
  {
    id: 'hair-color-correction',
    name: 'Hair Color Correction',
    type: 'major',
    category: 'Hair Coloring',
    variants: [{ id: 'standard', label: 'Standard', price: 5991, durationHours: 7 }],
    note: 'Price depends on hair length and complexity. Consultation may be required for complicated corrections. Duration: up to 7 hrs.',
  },

  // ---- Hair Treatments ----
  {
    id: 'deep-treatment',
    name: 'Deep Treatment',
    type: 'major',
    category: 'Hair Treatments',
    variants: lengthVariants([
      ['Roots Regrowth', 1500, 3],
      ['Short', 2000, 3],
      ['Medium', 2500, 3],
      ['Long', 3000, 6],
      ['Extra Long', 3500, 6],
      ['Super Long', 4000, 6],
    ]),
  },
  {
    id: 'hot-oil-treatment',
    name: 'Hot Oil Treatment',
    type: 'major',
    category: 'Hair Treatments',
    variants: lengthVariants([
      ['Regular', 500, 3],
      ['Small', 1000, 3],
      ['Medium', 1500, 3],
      ['Large', 2000, 3],
      ['Extra Large', 2300, 6],
      ['Extra Extra', 2500, 6],
      ['Super Long', 2500, 6],
    ]),
  },
  {
    id: 'hair-mask-treatment',
    name: 'Hair Mask Treatment',
    type: 'major',
    category: 'Hair Treatments',
    variants: lengthVariants([
      ['Regular', 1500, 3],
      ['Small', 1600, 3],
      ['Medium', 2000, 3],
      ['Large', 2500, 3],
      ['Extra Large', 3000, 6],
      ['Extra Extra', 3500, 6],
      ['Super Long', 3500, 6],
    ]),
  },
  {
    id: 'keratin-treatment',
    name: 'Keratin Treatment',
    type: 'major',
    category: 'Hair Treatments',
    variants: lengthVariants([
      ['Regular', 1500, 3],
      ['Small', 2000, 3],
      ['Medium', 2500, 3],
      ['Large', 3000, 3],
      ['Extra Large', 3500, 6],
      ['Extra Extra', 3500, 6],
      ['Super Long', 3500, 6],
    ]),
  },
  {
    id: 'brazilian-botox-treatment',
    name: 'Brazilian Botox Treatment',
    type: 'major',
    category: 'Hair Treatments',
    variants: lengthVariants([
      ['Regular', 1500, 3],
      ['Small', 2000, 3],
      ['Medium', 2500, 3],
      ['Large', 3000, 3],
      ['Extra Large', 3500, 6],
      ['Extra Extra', 3500, 6],
      ['Super Long', 3500, 6],
    ]),
  },
  {
    id: 'collagen-treatment',
    name: 'Collagen Treatment',
    type: 'major',
    category: 'Hair Treatments',
    variants: lengthVariants([
      ['Regular', 3500, 3],
      ['Small', 4000, 3],
      ['Medium', 5000, 3],
      ['Large', 5500, 3],
      ['Extra Large', 6000, 6],
      ['Extra Extra', 6000, 6],
      ['Super Long', 6000, 6],
    ]),
  },
  {
    id: 'brazilian-hair-treatment',
    name: 'Brazilian Hair Treatment',
    type: 'major',
    category: 'Hair Treatments',
    variants: lengthVariants([
      ['Roots Regrowth', 5991, 3],
      ['Short', 5991, 3],
      ['Medium', 5991, 3],
      ['Long', 5991, 6],
      ['Extra Long', 5991, 6],
      ['Super Long', 5991, 6],
    ]),
  },

  // ---- Hair Straightening ----
  {
    id: 'hair-straightening',
    name: 'Hair Straightening',
    type: 'major',
    category: 'Hair Straightening',
    variants: lengthVariants([
      ['Roots Regrowth', 5991, 4],
      ['Short', 5991, 4],
      ['Medium', 5991, 5],
      ['Long', 5991, 7],
      ['Extra Long', 5991, 7],
      ['Super Long', 5991, 7],
    ]),
  },

  // ---- Hair Rebonding ----
  {
    id: 'hair-rebonding',
    name: 'Hair Rebonding',
    type: 'major',
    category: 'Hair Rebonding',
    variants: lengthVariants([
      ['Roots Regrowth (1–3 inches)', 2500, 4],
      ['Short', 2800, 4],
      ['Medium', 3100, 4],
      ['Long', 3500, 4],
      ['Extra Long', 4000, 4],
      ['Super Long', 5000, 4],
    ]),
  },

  // ---- Hair Perming ----
  {
    id: 'hair-perming',
    name: 'Hair Perming',
    type: 'major',
    category: 'Hair Perming',
    variants: lengthVariants([
      ['Roots Regrowth', 2000, 4],
      ['Short', 2500, 4],
      ['Medium', 3000, 4],
      ['Long', 3500, 4],
      ['Extra Long', 4000, 4],
      ['Super Long', 5000, 4],
    ]),
  },

  // ---- Rebond Promo Package ----
  {
    id: 'rebond-color-keratin',
    name: 'Rebond + Color + Keratin',
    type: 'major',
    category: 'Rebond Promo Package',
    variants: lengthVariants([
      ['Roots Regrowth', 3000, 4],
      ['Short', 3500, 4],
      ['Medium', 4000, 6],
      ['Long', 4500, 7],
      ['Extra Long', 5000, 7],
      ['Super Long', 6000, 7],
    ]),
  },

  // ---- Massage Services ----
  {
    id: 'full-body-massage',
    name: 'Full Body Massage',
    type: 'major',
    category: 'Massage Services',
    variants: [{ id: 'standard', label: 'Standard', price: 1500, durationHours: 1 }],
  },
  {
    id: 'swedish-massage',
    name: 'Swedish Massage',
    type: 'major',
    category: 'Massage Services',
    variants: [{ id: 'standard', label: 'Standard', price: 1500, durationHours: 1 }],
  },
  {
    id: 'back-massage',
    name: 'Back Massage',
    type: 'major',
    category: 'Massage Services',
    variants: [{ id: 'standard', label: 'Standard', price: 5991, durationHours: 1 }],
  },
  {
    id: 'hand-foot-massage',
    name: 'Hand and Foot Massage',
    type: 'major',
    category: 'Massage Services',
    variants: [{ id: 'standard', label: 'Standard', price: 5991, durationHours: 1 }],
  },
  {
    id: 'hand-foot-reflexology',
    name: 'Hand and Foot Reflexology',
    type: 'major',
    category: 'Massage Services',
    variants: [{ id: 'standard', label: 'Standard', price: 5991, durationHours: 1 }],
  },

  // ---- Modern Ventosa ----
  {
    id: 'modern-ventosa',
    name: 'Modern Ventosa',
    type: 'major',
    category: 'Modern Ventosa',
    variants: [{ id: 'standard', label: 'Standard', price: 1500, durationHours: 1 }],
  },
];

/** Category display order for the Services page (mirrors the existing site). */
export const MAJOR_CATEGORIES: { title: string; services: string[] }[] = [
  { title: 'Toupee Haircut & Hairstyling', services: ['Haircut and Hairstyling for Toupee Hair', 'Hair Blending'] },
  { title: 'Hair Coloring', services: ['Basic Hair Color', 'Fashion Color', 'Special Hair Color', 'Hair Color Correction'] },
  {
    title: 'Hair Treatments',
    services: ['Deep Treatment', 'Hot Oil Treatment', 'Hair Mask Treatment', 'Keratin Treatment', 'Brazilian Botox Treatment', 'Collagen Treatment', 'Brazilian Hair Treatment'],
  },
  { title: 'Hair Straightening', services: ['Hair Straightening'] },
  { title: 'Hair Rebonding', services: ['Hair Rebonding'] },
  { title: 'Hair Perming', services: ['Hair Perming'] },
  { title: 'Rebond Promo Package', services: ['Rebond + Color + Keratin'] },
  {
    title: 'Massage Services',
    services: ['Full Body Massage', 'Swedish Massage', 'Back Massage', 'Hand and Foot Massage', 'Hand and Foot Reflexology'],
  },
  { title: 'Modern Ventosa', services: ['Modern Ventosa'] },
];

/** Look up a major service by id. */
export function findMajorService(id: string): Service | undefined {
  return MAJOR_SERVICES.find((s) => s.id === id);
}

/** Look up a variant within a service. */
export function findVariant(service: Service, variantId: string): ServiceVariant | undefined {
  return service.variants.find((v) => v.id === variantId);
}

/** All category titles for the services menu (Haircuts first). */
export const HAIRCUT_CATEGORY_TITLE = 'Haircuts';

/** Contact / business info reused across the site. */
export const BUSINESS = {
  name: 'JESS Salon at Home',
  base: 'Batasan Hills, Quezon City',
  phone: '+63 997 749 1555',
  phoneHref: 'tel:+639977491555',
  whatsapp: 'https://wa.me/639977491555?text=Hi%20JESS%20Salon%20at%20Home!%20I%27d%20like%20to%20inquire%20about%20your%20hair%20services%20and%20book%20an%20appointment.',
  messenger: 'https://m.me/61580949253081',
  facebook: 'https://www.facebook.com/profile.php?id=61580949253081',
  workingHours: 'Daily · 8 AM–6 PM',
};
