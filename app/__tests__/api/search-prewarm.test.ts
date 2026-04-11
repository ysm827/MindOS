import { describe, it, expect } from 'vitest';
import { seedFile } from '../setup';
import { GET } from '../../app/api/search/prewarm/route';
import { invalidateCache } from '../../lib/fs';

describe('GET /api/search/prewarm', () => {
  it('builds the UI search index on the first request', async () => {
    seedFile('doc.md', 'This document is used to warm the search index');
    invalidateCache();

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      warmed: true,
      cacheState: 'built',
      documentCount: 1,
    });
  });

  it('returns cache hit on subsequent requests', async () => {
    seedFile('cached.md', 'Cache hit should not rebuild the index');
    invalidateCache();

    await GET();
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      warmed: true,
      cacheState: 'hit',
      documentCount: 1,
    });
  });
});
