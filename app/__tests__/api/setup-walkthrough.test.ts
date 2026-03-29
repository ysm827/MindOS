import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempHome: string;
let configPath: string;
let savedHome: string | undefined;

beforeEach(() => {
  tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mindos-guide-test-'));
  savedHome = process.env.HOME;
  process.env.HOME = tempHome;
  configPath = path.join(tempHome, '.mindos', 'config.json');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    ai: {
      provider: 'anthropic',
      providers: {
        anthropic: { apiKey: '', model: 'claude-sonnet-4-6' },
        openai: { apiKey: '', model: 'gpt-5.4', baseUrl: '' },
      },
    },
    mindRoot: '/tmp/mind',
    guideState: {
      active: true,
      dismissed: false,
      template: 'en',
      step1Done: false,
      askedAI: false,
      nextStepIndex: 0,
    },
  }));
  vi.resetModules();
});

afterEach(() => {
  process.env.HOME = savedHome;
  fs.rmSync(tempHome, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('PATCH /api/setup walkthrough persistence', () => {
  it('persists walkthrough fields into an existing active guideState', async () => {
    const route = await import('@/app/api/setup/route');

    const req = new NextRequest('http://localhost/api/setup', {
      method: 'PATCH',
      body: JSON.stringify({
        guideState: {
          walkthroughStep: 2,
          walkthroughDismissed: true,
        },
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await route.PATCH(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.guideState.walkthroughStep).toBe(2);
    expect(body.guideState.walkthroughDismissed).toBe(true);
  });

  it('returns walkthrough fields in the PATCH response for an active guideState', async () => {
    const route = await import('@/app/api/setup/route');

    const patchReq = new NextRequest('http://localhost/api/setup', {
      method: 'PATCH',
      body: JSON.stringify({
        guideState: {
          walkthroughStep: 1,
          walkthroughDismissed: false,
        },
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await route.PATCH(patchReq);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.guideState.walkthroughStep).toBe(1);
    expect(body.guideState.walkthroughDismissed).toBe(false);
  });

  it('route and settings source both explicitly preserve walkthrough fields', async () => {
    const routeSource = fs.readFileSync('/tmp/mindos-fix-walkthrough-XyNOJw/app/app/api/setup/route.ts', 'utf-8');
    const settingsSource = fs.readFileSync('/tmp/mindos-fix-walkthrough-XyNOJw/app/lib/settings.ts', 'utf-8');

    expect(routeSource).toContain('patch.walkthroughStep');
    expect(routeSource).toContain('patch.walkthroughDismissed');
    expect(settingsSource).toContain('typeof obj.walkthroughDismissed === \'boolean\' ? obj.walkthroughDismissed : undefined');
  });
});
