import { getManilaDateTime } from '@/lib/booking';

export type DashboardPeriod = 'today' | 'week' | 'month';

export interface DashboardDateRange {
  startDate: string;
  endDate: string;
  dates: string[];
}

export interface AdminDashboardStats {
  startDate: string;
  endDate: string;
  bookingCount: number;
  pendingCount: number;
  paidCount: number;
  completedCount: number;
  revenue: number;
  daily: Array<{
    date: string;
    bookingCount: number;
    revenue: number;
  }>;
}

export interface DashboardBooking {
  appointment_date: string;
  status: string;
  total_price: number;
}

function formatUTCDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getDashboardDateRange(
  period: DashboardPeriod,
  now: Date = new Date(),
): DashboardDateRange {
  const [year, month, day] = getManilaDateTime(now).date.split('-').map(Number);
  const today = new Date(Date.UTC(year, month - 1, day));
  let start = new Date(today);
  let end = new Date(today);

  if (period === 'week') {
    const mondayOffset = (today.getUTCDay() + 6) % 7;
    start.setUTCDate(today.getUTCDate() - mondayOffset);
    end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
  } else if (period === 'month') {
    start = new Date(Date.UTC(year, month - 1, 1));
    end = new Date(Date.UTC(year, month, 0));
  }

  const dates: string[] = [];
  for (const date = new Date(start); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    dates.push(formatUTCDate(date));
  }

  return {
    startDate: formatUTCDate(start),
    endDate: formatUTCDate(end),
    dates,
  };
}

export function summarizeDashboardBookings(
  bookings: DashboardBooking[],
  range: DashboardDateRange,
): AdminDashboardStats {
  const dailyByDate = new Map(
    range.dates.map((date) => [date, { date, bookingCount: 0, revenue: 0 }]),
  );
  const stats: AdminDashboardStats = {
    startDate: range.startDate,
    endDate: range.endDate,
    bookingCount: 0,
    pendingCount: 0,
    paidCount: 0,
    completedCount: 0,
    revenue: 0,
    daily: [],
  };

  for (const booking of bookings) {
    const daily = dailyByDate.get(booking.appointment_date);
    if (!daily || !['pending', 'paid', 'completed'].includes(booking.status)) continue;

    stats.bookingCount++;
    daily.bookingCount++;

    if (booking.status === 'pending') stats.pendingCount++;
    if (booking.status === 'paid') stats.paidCount++;
    if (booking.status === 'completed') {
      stats.completedCount++;
      stats.revenue += booking.total_price;
      daily.revenue += booking.total_price;
    }
  }

  stats.daily = range.dates.map((date) => dailyByDate.get(date)!);
  return stats;
}
