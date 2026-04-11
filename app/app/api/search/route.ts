export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { searchFiles } from '@/lib/fs';
import { handleRouteErrorSimple } from '@/lib/errors';
import { telemetry } from '@/lib/telemetry';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  if (!q.trim()) {
    return NextResponse.json([]);
  }

  const stop = telemetry.startTimer('search.api.request', { queryLen: q.length });
  try {
    const results = searchFiles(q);
    stop({ resultCount: results.length, success: true });
    return NextResponse.json(results);
  } catch (err) {
    telemetry.track('search.api.error', {
      queryLen: q.length,
      errorType: err instanceof Error ? err.name : 'unknown',
    });
    stop({ success: false });
    console.error('Search error:', err);
    return handleRouteErrorSimple(err);
  }
}
