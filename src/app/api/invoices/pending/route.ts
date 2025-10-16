import { NextRequest, NextResponse } from 'next/server';
import { drainInvoices, size } from '@/lib/server-queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const maxParam = parseInt(url.searchParams.get('max') || '50', 10);
    const max = Math.max(1, Math.min(200, isNaN(maxParam) ? 50 : maxParam));
    const items = drainInvoices(max);
    return NextResponse.json({ count: items.length, remaining: size(), invoices: items });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to fetch pending invoices' }, { status: 500 });
  }
}


