import { NextResponse } from 'next/server';
import { getAdminDashboardStats } from '@/lib/booking-server';
import { isSupabaseConfigured } from '@/lib/env';
import type { DashboardPeriod } from '@/lib/admin-dashboard';

const periods: DashboardPeriod[] = ['today', 'week', 'month'];

/** GET /api/admin/revenue?period=today|week|month */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const period = new URL(request.url).searchParams.get('period') ?? 'today';
  if (!periods.includes(period as DashboardPeriod)) {
    return NextResponse.json({ error: 'Invalid dashboard period.' }, { status: 400 });
  }

  try {
    const stats = await getAdminDashboardStats(period as DashboardPeriod);
    return NextResponse.json({ stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load revenue data.';
    const status = message.toLowerCase().includes('unauthorized') ? 401 : 500;
    if (status !== 401) console.error('Admin revenue aggregation failed:', error);
    return NextResponse.json(
      { error: status === 401 ? 'Unauthorized.' : 'Failed to load revenue data.' },
      { status },
    );
  }
}
