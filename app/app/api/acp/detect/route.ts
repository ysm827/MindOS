export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { getDetectableAgents, resolveAgentCommand } from '@/lib/acp/agent-descriptors';
import { readSettings } from '@/lib/settings';
import { handleRouteErrorSimple } from '@/lib/errors';

/* ── Types ─────────────────────────────────────────────────────────────── */

interface InstalledAgent {
  id: string;
  name: string;
  binaryPath: string;
  resolvedCommand: {
    cmd: string;
    args: string[];
    source: 'user-override' | 'descriptor' | 'registry';
  };
}

interface NotInstalledAgent {
  id: string;
  name: string;
  installCmd: string;
  packageName?: string;
}

/* ── Server-side detection cache (30 min TTL) ─────────────────────────── */

const DETECT_CACHE_TTL_MS = 30 * 60 * 1000;
let detectCache: { data: { installed: InstalledAgent[]; notInstalled: NotInstalledAgent[] }; ts: number } | null = null;

/* ── Async detection helpers ──────────────────────────────────────────── */

/**
 * Single-shell batch detection. Runs one `which` per binary but via a
 * combined shell script so we spawn exactly ONE child process.
 * Output: one line per binary — either the path or empty.
 */
function whichBatch(binaries: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(binaries)];
  if (unique.length === 0) return Promise.resolve(new Map());

  const script = unique
    .map(bin => `which ${bin} 2>/dev/null || echo ""`)
    .join('; ');

  return new Promise((resolve) => {
    exec(script, { encoding: 'utf-8', timeout: 3000 }, (err, stdout) => {
      const map = new Map<string, string | null>();
      if (err) {
        for (const bin of unique) map.set(bin, null);
        resolve(map);
        return;
      }
      const lines = stdout.split('\n');
      for (let i = 0; i < unique.length; i++) {
        const line = (lines[i] ?? '').trim();
        map.set(unique[i], line || null);
      }
      resolve(map);
    });
  });
}

/* ── Route handler ─────────────────────────────────────────────────────── */

export async function GET(req: Request) {
  try {
    const force = new URL(req.url).searchParams.get('force') === '1';
    if (!force && detectCache && Date.now() - detectCache.ts < DETECT_CACHE_TTL_MS) {
      return NextResponse.json(detectCache.data);
    }

    // Pure local detection — no CDN fetch, instant response
    const agents = getDetectableAgents();
    const settings = readSettings();

    const binaryNames = [...new Set(agents.map(a => a.binary))];
    const whichMap = await whichBatch(binaryNames);

    const installed: InstalledAgent[] = [];
    const notInstalled: NotInstalledAgent[] = [];

    for (const agent of agents) {
      const binaryPath = whichMap.get(agent.binary) ?? null;

      if (binaryPath) {
        const userOverride = settings.acpAgents?.[agent.id];
        const resolved = resolveAgentCommand(agent.id, undefined, userOverride);
        installed.push({
          id: agent.id,
          name: agent.name,
          binaryPath,
          resolvedCommand: { cmd: resolved.cmd, args: resolved.args, source: resolved.source },
        });
      } else {
        const packageName = agent.installCmd?.match(/npm install -g (.+)/)?.[1];
        notInstalled.push({
          id: agent.id,
          name: agent.name,
          installCmd: agent.installCmd ?? (packageName ? `npm install -g ${packageName}` : ''),
          packageName,
        });
      }
    }

    const data = { installed, notInstalled };
    detectCache = { data, ts: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    return handleRouteErrorSimple(err);
  }
}
