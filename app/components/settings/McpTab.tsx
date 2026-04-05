import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Loader2, Copy, Check, Monitor, Globe, AlertCircle, RotateCcw, RefreshCw, Eye, EyeOff, ChevronDown, ChevronRight, Link2, Shield, Terminal, Plug } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useMcpDataOptional } from '@/lib/stores/mcp-store';
import { generateSnippet } from '@/lib/mcp-snippets';
import { copyToClipboard } from '@/lib/clipboard';
import { apiFetch } from '@/lib/api';
import CustomSelect from '@/components/CustomSelect';
import type { SelectItem } from '@/components/CustomSelect';
import type { McpTabProps, McpStatus, AgentInfo } from './types';
import AgentInstall from './McpAgentInstall';
import SkillsSection from './McpSkillsSection';

/* ── Main Connections Tab ────────────────────────────────────────── */

export function McpTab({ t }: McpTabProps) {
  const mcp = useMcpDataOptional();
  const m = t.settings?.mcp;

  const [restarting, setRestarting] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'http'>('stdio');
  const restartPollRef = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => () => clearInterval(restartPollRef.current), []);

  if (!mcp || mcp.loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 size={18} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const connectedAgents = mcp.agents.filter(a => a.present && a.installed);
  const detectedAgents = mcp.agents.filter(a => a.present && !a.installed);
  const notFoundAgents = mcp.agents.filter(a => !a.present);
  const effectiveSelected = selectedAgent || (mcp.agents[0]?.key ?? '');
  const currentAgent = mcp.agents.find(a => a.key === effectiveSelected);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await apiFetch('/api/mcp/restart', { method: 'POST' });
    } catch (err) {
      console.error('[McpTab] Restart request failed:', err);
      setRestarting(false);
      return;
    }
    const deadline = Date.now() + 60_000;
    clearInterval(restartPollRef.current);
    restartPollRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(restartPollRef.current);
        setRestarting(false);
        return;
      }
      try {
        const s = await apiFetch<McpStatus>('/api/mcp/status', { timeout: 3000 });
        if (s.running) {
          clearInterval(restartPollRef.current);
          setRestarting(false);
          mcp.refresh();
        }
      } catch { /* continue polling */ }
    }, 3000);
  };

  return (
    <div className="space-y-6">
      {/* 1. Connect an AI Agent — primary content */}
      <ConnectGuide status={mcp.status} m={m} />

      {/* 2. MCP Server & Agent Config (collapsed — MCP users only) */}
      <CollapsibleSection title={m?.serverTitle ?? 'MCP Server & Agent Config'} defaultOpen={false}>
        <div className="space-y-4">
          <McpStatusCard status={mcp.status} restarting={restarting} onRestart={handleRestart} onRefresh={mcp.refresh} m={m} />
          {mcp.agents.length > 0 && (
            <AgentConfigViewer
              connectedAgents={connectedAgents}
              detectedAgents={detectedAgents}
              notFoundAgents={notFoundAgents}
              currentAgent={currentAgent ?? null}
              mcpStatus={mcp.status}
              selectedAgent={effectiveSelected}
              onSelectAgent={(key) => setSelectedAgent(key)}
              transport={transport}
              onTransportChange={setTransport}
              onCopy={async (snippet) => {
                const ok = await copyToClipboard(snippet);
                if (ok) toast.copy();
              }}
              m={m}
            />
          )}
          <AgentInstall agents={mcp.agents} t={t} onRefresh={mcp.refresh} />
        </div>
      </CollapsibleSection>

      {/* 3. Skills management */}
      <CollapsibleSection title={m?.skillsTitle ?? 'Skills'} defaultOpen={false}>
        <SkillsSection t={t} />
      </CollapsibleSection>
    </div>
  );
}

/* ── Collapsible Section ── */

function CollapsibleSection({ title, defaultOpen = true, children }: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {title}
      </button>
      {open && children}
    </div>
  );
}

/* ── Connect Guide — CLI / MCP dual mode ── */

function ConnectGuide({ status, m }: {
  status: McpStatus | null;
  m: Record<string, any> | undefined;
}) {
  const [mode, setMode] = useState<'cli' | 'mcp'>('cli');
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => () => setRevealed(false), []);
  useEffect(() => {
    if (!copiedField) return;
    const t = setTimeout(() => setCopiedField(null), 2000);
    return () => clearTimeout(t);
  }, [copiedField]);

  const handleCopy = useCallback(async (text: string, field: string) => {
    if (!text) return;
    const ok = await copyToClipboard(text);
    if (ok) { setCopiedField(field); toast.copy(); }
  }, []);

  if (!status) return null;

  const hasToken = status.authConfigured && !!status.authToken;
  const displayToken = revealed ? (status.authToken ?? '') : (status.maskedToken ?? '');
  const serverUrl = status.endpoint || `http://127.0.0.1:${status.port}/mcp`;
  const remoteHost = status.localIP || 'localhost';
  const webPort = typeof window !== 'undefined' ? window.location.port || '3456' : '3456';
  const remoteUrl = `http://${remoteHost}:${webPort}`;
  const maskedAuthToken = status.maskedToken ?? '';

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <div className="w-7 h-7 rounded-lg bg-[var(--amber-subtle)] flex items-center justify-center shrink-0">
          <Link2 size={14} className="text-[var(--amber)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{m?.connectionTitle ?? 'Connect an AI Agent'}</h3>
        </div>
      </div>

      {/* Tab switcher — CLI vs MCP with descriptions */}
      <div className="grid grid-cols-2 mx-4 mb-3 rounded-lg border border-border overflow-hidden">
        <button
          onClick={() => setMode('cli')}
          className={`flex flex-col items-start px-3 py-2.5 text-left transition-colors ${
            mode === 'cli' ? 'bg-muted' : 'hover:bg-muted/50'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Terminal size={12} className={mode === 'cli' ? 'text-[var(--amber)]' : 'text-muted-foreground'} />
            <span className={`text-xs font-semibold ${mode === 'cli' ? 'text-foreground' : 'text-muted-foreground'}`}>CLI</span>
            <span className="text-2xs px-1 py-0.5 rounded bg-[var(--amber-subtle)] text-[var(--amber-text)] font-medium leading-none">Recommended</span>
          </span>
          <span className="text-2xs text-muted-foreground mt-0.5">Claude Code · Gemini CLI · Codex</span>
        </button>
        <button
          onClick={() => setMode('mcp')}
          className={`flex flex-col items-start px-3 py-2.5 text-left transition-colors border-l border-border ${
            mode === 'mcp' ? 'bg-muted' : 'hover:bg-muted/50'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Plug size={12} className={mode === 'mcp' ? 'text-foreground' : 'text-muted-foreground'} />
            <span className={`text-xs font-semibold ${mode === 'mcp' ? 'text-foreground' : 'text-muted-foreground'}`}>MCP</span>
          </span>
          <span className="text-2xs text-muted-foreground mt-0.5">Claude Desktop · Cursor</span>
        </button>
      </div>

      {/* Content for selected mode */}
      <div className="px-4 pb-4 space-y-3">
        {mode === 'cli' ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              <span className="text-[var(--amber-text)]">~90% lower token cost.</span> Skill included — just install and go.
            </p>
            <CodeBlock label="Install" code="npm install -g @geminilight/mindos" onCopy={handleCopy} copiedField={copiedField} fieldId="cli-install" />
            <div className="space-y-1">
              <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">Remote</span>
              <CodeBlock code={`mindos config set url ${remoteUrl}`} onCopy={handleCopy} copiedField={copiedField} fieldId="cli-url" compact />
              <CodeBlock code={`mindos config set authToken ${hasToken ? maskedAuthToken : '<token>'}`} onCopy={handleCopy} copiedField={copiedField} fieldId="cli-token" compact />
            </div>
            <CodeBlock label="Verify" code="mindos file list" onCopy={handleCopy} copiedField={copiedField} fieldId="cli-verify" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Requires per-agent MCP config. Install Skill separately via <code className="text-2xs bg-muted px-1 rounded">mindos mcp install</code>.
            </p>
            <div className="space-y-1.5">
              <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">{m?.serverUrl ?? 'MCP Server URL'}</span>
              <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-lg">
                <code className="flex-1 text-xs font-mono text-foreground select-all truncate">{serverUrl}</code>
                <CopyButton onCopy={() => handleCopy(serverUrl, 'mcp-url')} copied={copiedField === 'mcp-url'} size="sm" />
              </div>
            </div>
            <ol className="pl-3 border-l-2 border-border/50 space-y-1 text-xs text-muted-foreground list-decimal list-inside">
              <li>{m?.howToStep1 ?? "Open agent's MCP settings"}</li>
              <li>{m?.howToStep2 ?? 'Add MCP server with URL above'}</li>
              <li>{m?.howToStep3 ?? 'Set Auth Token as bearer token'}</li>
              <li>{m?.howToStep4 ?? 'Save and verify'}</li>
            </ol>
          </div>
        )}

        {/* Shared Auth Token */}
        <div className="pt-3 border-t border-border">
          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-2xs font-medium text-muted-foreground uppercase tracking-wider">
              <Shield size={11} />
              {m?.tokenLabel ?? 'Auth Token'}
            </label>
            {hasToken ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-muted/50 border border-border rounded-lg min-h-[38px]">
                  <code className="flex-1 text-xs font-mono text-foreground break-all select-all leading-relaxed">{displayToken}</code>
                </div>
                <button type="button" onClick={() => setRevealed(v => !v)}
                  className="shrink-0 p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:ring-2 focus-visible:ring-ring"
                  title={revealed ? (m?.tokenHide ?? 'Hide') : (m?.tokenShow ?? 'Show')}>
                  {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <CopyButton onCopy={() => handleCopy(status.authToken ?? '', 'token')} copied={copiedField === 'token'} title={m?.tokenCopy ?? 'Copy'} />
              </div>
            ) : (
              <div className="px-3 py-2.5 bg-[var(--amber-subtle)] border border-[var(--amber)]/20 rounded-lg">
                <p className="text-xs text-[var(--amber-text)]">{m?.tokenNone ?? 'No token set.'}</p>
                <p className="text-xs text-muted-foreground mt-1">{m?.tokenNoneAction ?? 'Generate one in Settings → General → Security.'}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reusable: Code Block with copy ── */

function CodeBlock({ label, code, onCopy, copiedField, fieldId, compact }: {
  label?: string;
  code: string;
  onCopy: (text: string, field: string) => void;
  copiedField: string | null;
  fieldId: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? '' : 'space-y-1'}>
      {label && <span className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>}
      <div className={`flex items-center gap-2 ${compact ? 'px-2.5 py-1.5' : 'px-3 py-2'} bg-muted/50 border border-border rounded-lg`}>
        <code className="flex-1 text-xs font-mono text-foreground select-all truncate">{code}</code>
        <CopyButton onCopy={() => onCopy(code, fieldId)} copied={copiedField === fieldId} size="sm" />
      </div>
    </div>
  );
}

/* ── Reusable: Copy Button ── */

function CopyButton({ onCopy, copied, title, size }: {
  onCopy: () => void;
  copied: boolean;
  title?: string;
  size?: 'sm' | 'md';
}) {
  const sz = size === 'sm' ? 11 : 14;
  const pad = size === 'sm' ? 'p-1' : 'p-2';
  return (
    <button type="button" onClick={onCopy} title={title ?? 'Copy'}
      className={`shrink-0 ${pad} rounded-lg border transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
        copied ? 'border-success/50 bg-success/10 text-success' : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
      }`}>
      {copied ? <Check size={sz} /> : <Copy size={sz} />}
    </button>
  );
}

/* ── MCP Status Card ── */

function McpStatusCard({ status, restarting, onRestart, onRefresh, m }: {
  status: McpStatus | null;
  restarting: boolean;
  onRestart: () => void;
  onRefresh: () => void;
  m: Record<string, any> | undefined;
}) {
  if (!status) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between">
      <div className="flex items-center gap-2.5 text-sm">
        {restarting ? (
          <>
            <Loader2 size={12} className="animate-spin text-[var(--amber)]" />
            <span className="text-[var(--amber)]">{m?.restarting ?? 'Restarting...'}</span>
          </>
        ) : (
          <>
            <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${status.running ? 'bg-success' : 'bg-muted-foreground'}`} />
            <span className="text-foreground font-medium">
              {status.running ? (m?.running ?? 'Running') : (m?.stopped ?? 'Stopped')}
            </span>
            {status.running && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="font-mono text-muted-foreground">{status.endpoint}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{status.toolCount} {m?.tools ?? 'tools'}</span>
              </>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {!status.running && !restarting && (
          <button onClick={onRestart}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium text-[var(--amber-foreground)] bg-[var(--amber)] transition-colors">
            <RotateCcw size={14} /> {m?.restart ?? 'Restart'}
          </button>
        )}
        <button onClick={onRefresh}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>
    </div>
  );
}

/* ── Agent Config Viewer (dropdown + snippet) ── */

function AgentConfigViewer({ connectedAgents, detectedAgents, notFoundAgents, currentAgent, mcpStatus, selectedAgent, onSelectAgent, transport, onTransportChange, onCopy, m }: {
  connectedAgents: AgentInfo[];
  detectedAgents: AgentInfo[];
  notFoundAgents: AgentInfo[];
  currentAgent: AgentInfo | null;
  mcpStatus: McpStatus | null;
  selectedAgent: string;
  onSelectAgent: (key: string) => void;
  transport: 'stdio' | 'http';
  onTransportChange: (t: 'stdio' | 'http') => void;
  onCopy: (snippet: string) => void;
  m: Record<string, any> | undefined;
}) {
  const snippet = useMemo(
    () => currentAgent ? generateSnippet(currentAgent, mcpStatus, transport) : null,
    [currentAgent, mcpStatus, transport]
  );

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <CustomSelect
        value={selectedAgent}
        onChange={onSelectAgent}
        options={[
          ...(connectedAgents.length > 0 ? [{ label: m?.connectedGroup ?? 'Connected', options: connectedAgents.map(a => ({ value: a.key, label: `${a.name} — ${a.transport ?? 'stdio'} · ${a.scope ?? 'global'}` })) }] : []),
          ...(detectedAgents.length > 0 ? [{ label: m?.detectedGroup ?? 'Detected (not configured)', options: detectedAgents.map(a => ({ value: a.key, label: `${a.name} — ${m?.notConfigured ?? 'not configured'}` })) }] : []),
          ...(notFoundAgents.length > 0 ? [{ label: m?.notFoundGroup ?? 'Not Installed', options: notFoundAgents.map(a => ({ value: a.key, label: a.name })) }] : []),
        ] as SelectItem[]}
      />

      {currentAgent && (
        <>
          <div className="flex items-center gap-2">
            {currentAgent.present && currentAgent.installed ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-success/10 text-success">
                <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" /> {m?.tagConnected ?? 'Connected'}
              </span>
            ) : currentAgent.present && !currentAgent.installed ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-[var(--amber-subtle)] text-[var(--amber-text)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--amber)] inline-block" /> {m?.tagDetected ?? 'Detected'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-medium bg-muted text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground inline-block" /> {m?.tagNotInstalled ?? 'Not installed'}
              </span>
            )}
            {currentAgent.transport && <span className="px-1.5 py-0.5 rounded text-2xs bg-muted text-muted-foreground">{currentAgent.transport}</span>}
            {currentAgent.scope && <span className="px-1.5 py-0.5 rounded text-2xs bg-muted text-muted-foreground">{currentAgent.scope}</span>}
          </div>

          <div className="flex items-center rounded-lg border border-border overflow-hidden w-fit">
            <button onClick={() => onTransportChange('stdio')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${transport === 'stdio' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              <Monitor size={14} /> {m?.transportLocal ?? 'Local'}
            </button>
            <button onClick={() => onTransportChange('http')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${transport === 'http' ? 'bg-muted text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
              <Globe size={14} /> {m?.transportRemote ?? 'Remote'}
            </button>
          </div>

          {transport === 'http' && mcpStatus && !mcpStatus.authConfigured && (
            <p className="flex items-center gap-1.5 text-xs text-[var(--amber-text)]">
              <AlertCircle size={12} /> {m?.noAuthWarning ?? 'Auth not configured.'}
            </p>
          )}

          {snippet && (
            <>
              <pre className="text-[11px] font-mono bg-muted/50 border border-border rounded-lg p-3 overflow-x-auto whitespace-pre select-all max-h-[200px] overflow-y-auto">
                {snippet.displaySnippet}
              </pre>
              <div className="flex items-center gap-3 text-sm">
                <button onClick={() => onCopy(snippet.snippet)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
                  <Copy size={14} /> {m?.copyConfig ?? 'Copy'}
                </button>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono text-muted-foreground truncate text-2xs">{snippet.path}</span>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
