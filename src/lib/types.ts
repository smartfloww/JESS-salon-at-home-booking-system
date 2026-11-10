/**
 * Shared client-side types matching the API responses.
 */

export type BookingStatus =
  | "pending_payment"
  | "paid"
  | "completed"
  | "cancelled";

export type PaymentStatus = "pending" | "successful" | "failed";

export interface ServiceVariantDTO {
  id: string;
  name: string;
  price: number; // centavos
  duration: number; // minutes
}

export interface ServiceDTO {
  id: string;
  slug: string;
  name: string;
  category: "haircut" | "major";
  group: string;
  basePrice: number;
  baseDuration: number;
  note?: string | null;
  order: number;
  variants: ServiceVariantDTO[];
}

export interface ServiceGroupDTO {
  group: string;
  items: ServiceDTO[];
}

export interface AreaDTO {
  id: string;
  name: string;
  travelMinutes: number;
}

export interface AvailabilitySlot {
  minutes: number;
  label: string;
}

export interface SelectedItem {
  serviceSlug: string;
  serviceName: string;
  variantName?: string | null;
  quantity: number;
  unitCategory: "haircut" | "major";
  unitPrice: number; // centavos
  unitDuration: number; // minutes
}

export interface CustomerInfo {
  fullName: string;
  phone: string;
  email?: string;
  address: string;
  barangay: string;
  city: string;
  province: string;
  landmark?: string;
}

export interface BookingDetailItem {
  serviceName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
  unitPriceLabel: string;
  linePrice: number;
  linePriceLabel: string;
  unitDuration: number;
  lineDuration: number;
  lineDurationLabel: string;
  unitCategory: "haircut" | "major";
}

export interface BookingDetail {
  reference: string;
  status: BookingStatus;
  cancellationReason: string | null;
  appointmentDate: string;
  departureTime: number;
  departureLabel: string;
  arrivalLabel: string;
  completionLabel: string;
  reservedMinutes: number;
  reservedLabel: string;
  serviceMinutes: number;
  serviceLabel: string;
  travelMinutes: number;
  travelLabel: string;
  area: string;
  totalServicePrice: number;
  totalServicePriceLabel: string;
  reservationFee: number;
  reservationFeeLabel: string;
  remainingBalance: number;
  remainingBalanceLabel: string;
  items: BookingDetailItem[];
  paymentStatus: PaymentStatus;
}

export interface AdminBooking extends BookingDetail {
  id: string;
  paymentDeadline: string | null;
  paymentProviderRef: string | null;
  paymentReconciliationStatus: "none" | "refund_required" | "resolved";
  createdAt: string;
  customer: {
    fullName: string;
    phone: string;
    email: string | null;
    address: string;
    barangay: string;
    city: string;
    province: string;
    landmark: string | null;
  };
}

export function formatPHP(centavos: number): string {
  const pesos = centavos / 100;
  return "₱" + pesos.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr${h > 1 ? "s" : ""}`;
  return `${h} hr${h > 1 ? "s" : ""} ${m} min`;
}
