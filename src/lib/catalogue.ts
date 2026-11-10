/**
 * JESS Salon at Home — service catalogue seed data.
 *
 * All prices are in Philippine peso CENTAVOS (₱1 = 100).
 * All durations are in MINUTES.
 *
 * Source of truth: project brief (Pasted Content_1794309633321.txt).
 */

export type ServiceCategory = "haircut" | "major";

export interface SeedVariant {
  name: string;
  price: number; // centavos
  duration: number; // minutes
}

export interface SeedService {
  slug: string;
  name: string;
  category: ServiceCategory;
  group: string;
  basePrice: number; // centavos
  baseDuration: number; // minutes
  note?: string;
  order: number;
  variants?: SeedVariant[];
}

const HAIR_LENGTHS = [
  "Roots Regrowth",
  "Short",
  "Medium",
  "Long",
  "Extra Long",
  "Super Long",
] as const;

const TREATMENT_SIZES = [
  "Regular",
  "Small",
  "Medium",
  "Large",
  "Extra Large",
  "Extra Extra",
  "Super Long",
] as const;

// helper: ₱ -> centavos
const php = (n: number) => n * 100;
// helper: hours -> minutes
const hrs = (n: number) => n * 60;

// ---------------------------------------------------------------------------
// HAIRCUTS
// ---------------------------------------------------------------------------
const HAIRCUT_NAMES_MEN = ["Classic Haircut", "Modern Haircut"];
const HAIRCUT_NAMES_WOMEN = [
  "Pixie Cut",
  "Bob Cut",
  "Bixie Cut",
  "Wolf Cut",
  "Layered Cut",
  "Curtain Bangs",
];
const HAIRCUT_NAMES_EXTRA = [
  "Haircut for Busy Moms",
  "Kids' Haircut",
  "Haircut for Busy Professionals",
  "Haircut for Senior Citizens",
  "Haircut for Basketball Players",
  "Haircut for Persons with Disabilities (PWD)",
  "Haircut for Persons with Special Needs",
];

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

let haircutOrder = 0;
const haircutServices: SeedService[] = [
  ...HAIRCUT_NAMES_MEN,
  ...HAIRCUT_NAMES_WOMEN,
  ...HAIRCUT_NAMES_EXTRA,
].map((name) => ({
  slug: slugify(name),
  name,
  category: "haircut" as const,
  group: "Haircuts",
  basePrice: php(999),
  baseDuration: hrs(1),
  order: haircutOrder++,
}));

// ---------------------------------------------------------------------------
// Other Haircut Services — documented assumption:
// "Haircut and Hairstyling for Toupee Hair" and "Hair Blending" are treated
// as HAIRCUT units for the booking-combination rule (they are stylist-time
// priced like haircuts, 1 hour each, and behave as one customer slot).
// ---------------------------------------------------------------------------
const otherHaircutServices: SeedService[] = [
  {
    slug: "toupee-haircut-and-hairstyling",
    name: "Haircut and Hairstyling for Toupee Hair",
    category: "haircut",
    group: "Toupee Haircut & Hairstyling",
    basePrice: php(1500),
    baseDuration: hrs(1),
    order: 100,
  },
  {
    slug: "hair-blending",
    name: "Hair Blending",
    category: "haircut",
    group: "Toupee Haircut & Hairstyling",
    basePrice: php(1000),
    baseDuration: hrs(1),
    order: 101,
  },
];

// ---------------------------------------------------------------------------
// Hair Color
// ---------------------------------------------------------------------------
const basicColorVariants: SeedVariant[] = [
  { name: "Roots Regrowth", price: php(1500), duration: hrs(2) },
  { name: "Short", price: php(2000), duration: hrs(3) },
  { name: "Medium", price: php(2500), duration: hrs(3) },
  { name: "Long", price: php(3000), duration: hrs(4) },
  { name: "Extra Long", price: php(3500), duration: hrs(4) },
  { name: "Super Long", price: php(4000), duration: hrs(4) },
];

const fashionColorVariants: SeedVariant[] = [
  { name: "Roots Regrowth", price: php(4999), duration: hrs(5) },
  { name: "Short", price: php(5500), duration: hrs(5) },
  { name: "Medium", price: php(6000), duration: hrs(6) },
  { name: "Long", price: php(6500), duration: hrs(7) },
  { name: "Extra Long", price: php(7000), duration: hrs(7) },
  { name: "Super Long", price: php(7500), duration: hrs(7) },
];

const hairColorServices: SeedService[] = [
  {
    slug: "basic-hair-color",
    name: "Basic Hair Color",
    category: "major",
    group: "Hair Coloring",
    basePrice: php(1500),
    baseDuration: hrs(2),
    order: 200,
    variants: basicColorVariants,
  },
  {
    slug: "fashion-color",
    name: "Fashion Color",
    category: "major",
    group: "Hair Coloring",
    basePrice: php(4999),
    baseDuration: hrs(5),
    order: 201,
    variants: fashionColorVariants,
  },
  {
    slug: "special-hair-color",
    name: "Special Hair Color",
    category: "major",
    group: "Hair Coloring",
    basePrice: php(5991),
    baseDuration: hrs(6),
    order: 202,
  },
  {
    slug: "hair-color-correction",
    name: "Hair Color Correction",
    category: "major",
    group: "Hair Coloring",
    basePrice: php(5991),
    baseDuration: hrs(7),
    order: 203,
    note: "Displayed price is ₱5,991. Final price may depend on hair length and complexity. A consultation may be required for complicated corrections. Final pricing rule to be confirmed by JESS.",
  },
];

// ---------------------------------------------------------------------------
// Hair Treatments
// ---------------------------------------------------------------------------
const deepTreatmentVariants: SeedVariant[] = [
  { name: "Roots Regrowth", price: php(1500), duration: hrs(3) },
  { name: "Short", price: php(2000), duration: hrs(3) },
  { name: "Medium", price: php(2500), duration: hrs(3) },
  { name: "Long", price: php(3000), duration: hrs(6) },
  { name: "Extra Long", price: php(3500), duration: hrs(6) },
  { name: "Super Long", price: php(4000), duration: hrs(6) },
];

const hotOilVariants: SeedVariant[] = [
  { name: "Regular", price: php(500), duration: hrs(3) },
  { name: "Small", price: php(1000), duration: hrs(3) },
  { name: "Medium", price: php(1500), duration: hrs(3) },
  { name: "Large", price: php(2000), duration: hrs(3) },
  { name: "Extra Large", price: php(2300), duration: hrs(6) },
  { name: "Extra Extra", price: php(2500), duration: hrs(6) },
  { name: "Super Long", price: php(2500), duration: hrs(6) },
];

const hairMaskVariants: SeedVariant[] = [
  { name: "Regular", price: php(1500), duration: hrs(3) },
  { name: "Small", price: php(1600), duration: hrs(3) },
  { name: "Medium", price: php(2000), duration: hrs(3) },
  { name: "Large", price: php(2500), duration: hrs(3) },
  { name: "Extra Large", price: php(3000), duration: hrs(6) },
  { name: "Extra Extra", price: php(3500), duration: hrs(6) },
  { name: "Super Long", price: php(3500), duration: hrs(6) },
];

const keratinVariants: SeedVariant[] = [
  { name: "Regular", price: php(1500), duration: hrs(3) },
  { name: "Small", price: php(2000), duration: hrs(3) },
  { name: "Medium", price: php(2500), duration: hrs(3) },
  { name: "Large", price: php(3000), duration: hrs(3) },
  { name: "Extra Large", price: php(3500), duration: hrs(6) },
  { name: "Extra Extra", price: php(3500), duration: hrs(6) },
  { name: "Super Long", price: php(3500), duration: hrs(6) },
];

const brazilianBotoxVariants: SeedVariant[] = keratinVariants.map((v) => ({
  ...v,
}));

const collagenVariants: SeedVariant[] = [
  { name: "Regular", price: php(3500), duration: hrs(3) },
  { name: "Small", price: php(4000), duration: hrs(3) },
  { name: "Medium", price: php(5000), duration: hrs(3) },
  { name: "Large", price: php(5500), duration: hrs(3) },
  { name: "Extra Large", price: php(6000), duration: hrs(6) },
  { name: "Extra Extra", price: php(6000), duration: hrs(6) },
  { name: "Super Long", price: php(6000), duration: hrs(6) },
];

const brazilianHairTreatmentVariants: SeedVariant[] = [
  { name: "Roots Regrowth", price: php(5991), duration: hrs(3) },
  { name: "Short", price: php(5991), duration: hrs(3) },
  { name: "Medium", price: php(5991), duration: hrs(3) },
  { name: "Long", price: php(5991), duration: hrs(6) },
  { name: "Extra Long", price: php(5991), duration: hrs(6) },
  { name: "Super Long", price: php(5991), duration: hrs(6) },
];

const hairTreatmentServices: SeedService[] = [
  {
    slug: "deep-treatment",
    name: "Deep Treatment",
    category: "major",
    group: "Hair Treatments",
    basePrice: php(1500),
    baseDuration: hrs(3),
    order: 300,
    variants: deepTreatmentVariants,
  },
  {
    slug: "hot-oil-treatment",
    name: "Hot Oil Treatment",
    category: "major",
    group: "Hair Treatments",
    basePrice: php(500),
    baseDuration: hrs(3),
    order: 301,
    variants: hotOilVariants,
  },
  {
    slug: "hair-mask-treatment",
    name: "Hair Mask Treatment",
    category: "major",
    group: "Hair Treatments",
    basePrice: php(1500),
    baseDuration: hrs(3),
    order: 302,
    variants: hairMaskVariants,
  },
  {
    slug: "keratin-treatment",
    name: "Keratin Treatment",
    category: "major",
    group: "Hair Treatments",
    basePrice: php(1500),
    baseDuration: hrs(3),
    order: 303,
    variants: keratinVariants,
  },
  {
    slug: "brazilian-botox-treatment",
    name: "Brazilian Botox Treatment",
    category: "major",
    group: "Hair Treatments",
    basePrice: php(1500),
    baseDuration: hrs(3),
    order: 304,
    variants: brazilianBotoxVariants,
  },
  {
    slug: "collagen-treatment",
    name: "Collagen Treatment",
    category: "major",
    group: "Hair Treatments",
    basePrice: php(3500),
    baseDuration: hrs(3),
    order: 305,
    variants: collagenVariants,
  },
  {
    slug: "brazilian-hair-treatment",
    name: "Brazilian Hair Treatment",
    category: "major",
    group: "Hair Treatments",
    basePrice: php(5991),
    baseDuration: hrs(3),
    order: 306,
    variants: brazilianHairTreatmentVariants,
  },
];

// ---------------------------------------------------------------------------
// Straightening, Rebonding, Perming
// ---------------------------------------------------------------------------
const hairStraighteningVariants: SeedVariant[] = [
  { name: "Roots Regrowth", price: php(5991), duration: hrs(4) },
  { name: "Short", price: php(5991), duration: hrs(4) },
  { name: "Medium", price: php(5991), duration: hrs(5) },
  { name: "Long", price: php(5991), duration: hrs(7) },
  { name: "Extra Long", price: php(5991), duration: hrs(7) },
  { name: "Super Long", price: php(5991), duration: hrs(7) },
];

const hairRebondingVariants: SeedVariant[] = [
  { name: "Roots Regrowth (1–3 inches)", price: php(2500), duration: hrs(4) },
  { name: "Short", price: php(2800), duration: hrs(4) },
  { name: "Medium", price: php(3100), duration: hrs(4) },
  { name: "Long", price: php(3500), duration: hrs(4) },
  { name: "Extra Long", price: php(4000), duration: hrs(4) },
  { name: "Super Long", price: php(5000), duration: hrs(4) },
];

const hairPermingVariants: SeedVariant[] = [
  { name: "Roots Regrowth", price: php(2000), duration: hrs(4) },
  { name: "Short", price: php(2500), duration: hrs(4) },
  { name: "Medium", price: php(3000), duration: hrs(4) },
  { name: "Long", price: php(3500), duration: hrs(4) },
  { name: "Extra Long", price: php(4000), duration: hrs(4) },
  { name: "Super Long", price: php(5000), duration: hrs(4) },
];

const rebondColorKeratinVariants: SeedVariant[] = [
  { name: "Roots Regrowth", price: php(3000), duration: hrs(4) },
  { name: "Short", price: php(3500), duration: hrs(4) },
  { name: "Medium", price: php(4000), duration: hrs(6) },
  { name: "Long", price: php(4500), duration: hrs(7) },
  { name: "Extra Long", price: php(5000), duration: hrs(7) },
  { name: "Super Long", price: php(6000), duration: hrs(7) },
];

const straighteningServices: SeedService[] = [
  {
    slug: "hair-straightening",
    name: "Hair Straightening",
    category: "major",
    group: "Hair Straightening",
    basePrice: php(5991),
    baseDuration: hrs(4),
    order: 400,
    variants: hairStraighteningVariants,
  },
  {
    slug: "hair-rebonding",
    name: "Hair Rebonding",
    category: "major",
    group: "Hair Rebonding",
    basePrice: php(2500),
    baseDuration: hrs(4),
    order: 401,
    variants: hairRebondingVariants,
  },
  {
    slug: "hair-perming",
    name: "Hair Perming",
    category: "major",
    group: "Hair Perming",
    basePrice: php(2000),
    baseDuration: hrs(4),
    order: 402,
    variants: hairPermingVariants,
  },
  {
    slug: "rebond-color-keratin",
    name: "Rebond + Color + Keratin",
    category: "major",
    group: "Rebond Promo Package",
    basePrice: php(3000),
    baseDuration: hrs(4),
    order: 403,
    variants: rebondColorKeratinVariants,
  },
];

// ---------------------------------------------------------------------------
// Massage & Ventosa
// ---------------------------------------------------------------------------
const massageServices: SeedService[] = [
  {
    slug: "full-body-massage",
    name: "Full Body Massage",
    category: "major",
    group: "Massage Services",
    basePrice: php(1500),
    baseDuration: hrs(1),
    order: 500,
  },
  {
    slug: "swedish-massage",
    name: "Swedish Massage",
    category: "major",
    group: "Massage Services",
    basePrice: php(1500),
    baseDuration: hrs(1),
    order: 501,
  },
  {
    slug: "back-massage",
    name: "Back Massage",
    category: "major",
    group: "Massage Services",
    basePrice: php(5991),
    baseDuration: hrs(1),
    order: 502,
  },
  {
    slug: "hand-and-foot-massage",
    name: "Hand and Foot Massage",
    category: "major",
    group: "Massage Services",
    basePrice: php(5991),
    baseDuration: hrs(1),
    order: 503,
  },
  {
    slug: "hand-and-foot-reflexology",
    name: "Hand and Foot Reflexology",
    category: "major",
    group: "Massage Services",
    basePrice: php(5991),
    baseDuration: hrs(1),
    order: 504,
  },
  {
    slug: "modern-ventosa",
    name: "Modern Ventosa",
    category: "major",
    group: "Modern Ventosa",
    basePrice: php(1500),
    baseDuration: hrs(1),
    order: 505,
  },
];

export const SEED_SERVICES: SeedService[] = [
  ...haircutServices,
  ...otherHaircutServices,
  ...hairColorServices,
  ...hairTreatmentServices,
  ...straighteningServices,
  ...massageServices,
];

export const SEED_AREAS = [
  { name: "Metro Manila", travelMinutes: 90, order: 0 },
  { name: "Cavite", travelMinutes: 120, order: 1 },
  { name: "Laguna", travelMinutes: 120, order: 2 },
  { name: "Batangas", travelMinutes: 180, order: 3 },
];

// Keep these for reference / tests
export const RESERVATION_FEE_HAIRCUT = php(500);
export const RESERVATION_FEE_MAJOR = php(1500);
export const ADDITIONAL_HAIRCUT_PERSON = php(500);
export const HAIRCUT_BASE_PRICE = php(999);
export const HAIRCUT_BASE_DURATION = hrs(1);
