export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { readSettings, writeSettings, ServerSettings } from '@/lib/settings';
import { invalidateCache } from '@/lib/fs';
import { PROVIDER_PRESETS, ALL_PROVIDER_IDS, getApiKeyEnvVar, getApiKeyFromEnv } from '@/lib/agent/providers';
import { parseCustomProviders, type CustomProvider } from '@/lib/custom-endpoints';

function maskToken(token: string | undefined): string {
  if (!token) return '';
  const parts = token.split('-');
  if (parts.length >= 2) {
    return parts[0] + '-' + parts.slice(1, -1).map(() => '••••').join('-') + '-' + parts[parts.length - 1];
  }
  return token.length > 8 ? token.slice(0, 4) + '••••••••' + token.slice(-4) : '***set***';
}

export async function GET() {
  const settings = readSettings();

  // Build env values/overrides dynamically from all provider presets
  const envOverrides: Record<string, boolean> = {
    AI_PROVIDER: !!process.env.AI_PROVIDER,
    MIND_ROOT:   !!process.env.MIND_ROOT,
  };
  const envValues: Record<string, string> = {
    AI_PROVIDER: process.env.AI_PROVIDER || '',
    MIND_ROOT:   process.env.MIND_ROOT || '',
  };

  for (const id of ALL_PROVIDER_IDS) {
    const envKey = getApiKeyEnvVar(id);
    if (envKey) {
      envOverrides[envKey] = !!getApiKeyFromEnv(id);
      envValues[envKey] = getApiKeyFromEnv(id) ? '***set***' : '';
    }
  }

  // Return provider configs with real keys (local app — keys are already in config.json)
  const providers: Record<string, { apiKey: string; model: string; baseUrl?: string }> = {};
  for (const [id, cfg] of Object.entries(settings.ai.providers)) {
    if (!cfg) continue;
    providers[id] = {
      apiKey: cfg.apiKey ?? '',
      model: cfg.model ?? '',
      ...(cfg.baseUrl !== undefined ? { baseUrl: cfg.baseUrl } : {}),
    };
  }

  return NextResponse.json({
    ai: {
      provider: settings.ai.provider,
      providers,
    },
    mindRoot: settings.mindRoot,
    webPassword: settings.webPassword ?? '',
    authToken: maskToken(settings.authToken),
    mcpPort: settings.mcpPort ?? 8781,
    agent: settings.agent ?? {},
    envOverrides,
    envValues,
    customProviders: settings.customProviders ?? [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as Partial<ServerSettings>;
    const current = readSettings();

    // Merge providers dynamically
    const mergedProviders = { ...current.ai.providers };
    if (body.ai?.providers) {
      for (const [id, incoming] of Object.entries(body.ai.providers)) {
        if (!incoming) continue;
        const cur = mergedProviders[id as keyof typeof mergedProviders] ?? { apiKey: '', model: '' };
        mergedProviders[id as keyof typeof mergedProviders] = {
          ...cur,
          ...incoming,
          apiKey: incoming.apiKey ?? cur.apiKey ?? '',
          model: incoming.model ?? cur.model ?? '',
        };
      }
    }

    const resolvedWebPassword = body.webPassword ?? current.webPassword;

    // authToken is read-only via POST (use /api/settings/reset-token to regenerate)
    // but allow clearing it by passing empty string
    const incomingAuthToken = body.authToken;
    const resolvedAuthToken = (incomingAuthToken === '' || incomingAuthToken === undefined)
      ? (incomingAuthToken === '' ? '' : current.authToken)
      : current.authToken;

    // Handle connectionMode: validate if provided, otherwise keep existing
    let resolvedConnectionMode = current.connectionMode ?? { cli: true, mcp: false };
    if (body.connectionMode && typeof body.connectionMode === 'object') {
      const incomingMode = body.connectionMode as Record<string, unknown>;
      if (typeof incomingMode.cli === 'boolean' && typeof incomingMode.mcp === 'boolean') {
        resolvedConnectionMode = {
          cli: incomingMode.cli,
          mcp: incomingMode.mcp,
        };
      }
    }

    // Handle customProviders
    let resolvedCustomProviders = current.customProviders ?? [];
    if (body.customProviders !== undefined) {
      resolvedCustomProviders = parseCustomProviders(body.customProviders);
    }

    const next: ServerSettings = {
      ai: {
        provider: body.ai?.provider ?? current.ai.provider,
        providers: mergedProviders,
      },
      mindRoot: body.mindRoot ?? current.mindRoot,
      agent: body.agent ?? current.agent,
      webPassword: resolvedWebPassword,
      authToken: resolvedAuthToken,
      port: typeof body.port === 'number' ? body.port : current.port,
      mcpPort: typeof body.mcpPort === 'number' ? body.mcpPort : current.mcpPort,
      startMode: body.startMode ?? current.startMode,
      connectionMode: resolvedConnectionMode,
      customProviders: resolvedCustomProviders,
    };

    writeSettings(next);
    // Clear proxy compat cache when AI config changes — stale cache causes
    // the non-streaming fallback to be used even when streaming would work.
    if (JSON.stringify(next.ai) !== JSON.stringify(current.ai)) {
      const { readSettings: rs, writeSettings: ws } = await import('@/lib/settings');
      const s = rs();
      if (s.baseUrlCompat && Object.keys(s.baseUrlCompat).length > 0) {
        ws({ ...s, baseUrlCompat: {} });
      }
    }
    if (next.mindRoot !== current.mindRoot) invalidateCache();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
