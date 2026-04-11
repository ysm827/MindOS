export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { prewarmSearchIndex } from '@/lib/fs';
import { handleRouteErrorSimple } from '@/lib/errors';
import { telemetry } from '@/lib/telemetry';

export async function GET() {
  const stop = telemetry.startTimer('search.ui.prewarm.request');
  try {
    const result = prewarmSearchIndex();
    stop({ cacheState: result.cacheState, documentCount: result.documentCount, success: true });
    return NextResponse.json(result);
  } catch (err) {
    telemetry.track('search.ui.prewarm.error', {
      errorType: err instanceof Error ? err.name : 'unknown',
    });
    stop({ success: false });
    return handleRouteErrorSimple(err);
  }
}
