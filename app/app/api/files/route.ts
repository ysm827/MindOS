export const dynamic = 'force-dynamic';
import { collectAllFiles } from '@/lib/fs';
import { NextResponse } from 'next/server';
import { handleRouteErrorSimple } from '@/lib/errors';

export async function GET() {
  try {
    const files = collectAllFiles();
    return NextResponse.json(files);
  } catch (e) {
    return handleRouteErrorSimple(e);
  }
}
