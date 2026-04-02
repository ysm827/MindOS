'use client';

import { useState, useEffect } from 'react';
import { Brain, Zap, SkipForward, CheckCircle2, ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { Field, Input, ApiKeyInput } from '@/components/settings/Primitives';
import type { SetupState, SetupMessages, PortStatus } from './types';
import StepPorts from './StepPorts';

export interface StepAIProps {
  state: SetupState;
  update: <K extends keyof SetupState>(key: K, val: SetupState[K]) => void;
  s: SetupMessages;
  onCopyToken: () => void;
  // Port props (embedded in Advanced section)
  webPortStatus: PortStatus;
  mcpPortStatus: PortStatus;
  setWebPortStatus: (s: PortStatus) => void;
  setMcpPortStatus: (s: PortStatus) => void;
  checkPort: (port: number, which: 'web' | 'mcp') => void;
  portConflict: boolean;
}

export default function StepAI({ state, update, s, onCopyToken, webPortStatus, mcpPortStatus, setWebPortStatus, setMcpPortStatus, checkPort, portConflict }: StepAIProps) {
  const [portsOpen, setPortsOpen] = useState(false);

  // Auto-expand Advanced section if port check finds a problem
  useEffect(() => {
    if (!portsOpen && (webPortStatus.available === false || mcpPortStatus.available === false || portConflict)) {
      setPortsOpen(true);
    }
  }, [webPortStatus.available, mcpPortStatus.available, portConflict, portsOpen]);

  const providers = [
    { id: 'anthropic' as const, icon: <Brain size={18} />, label: 'Anthropic', desc: 'Claude — claude-sonnet-4-6' },
    { id: 'openai' as const, icon: <Zap size={18} />, label: 'OpenAI', desc: 'GPT or any OpenAI-compatible API' },
    { id: 'skip' as const, icon: <SkipForward size={18} />, label: s.aiSkipTitle, desc: s.aiSkipDesc },
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3">
        {providers.map(p => (
          <button key={p.id} onClick={() => update('provider', p.id)}
            className="flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-150"
            style={{
              background: state.provider === p.id ? 'var(--amber-dim)' : 'var(--card)',
              borderColor: state.provider === p.id ? 'var(--amber)' : 'var(--border)',
            }}>
            <span className="mt-0.5" style={{ color: state.provider === p.id ? 'var(--amber)' : 'var(--muted-foreground)' }}>
              {p.icon}
            </span>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--foreground)' }}>{p.label}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{p.desc}</p>
            </div>
            {state.provider === p.id && (
              <CheckCircle2 size={16} className="ml-auto mt-0.5 shrink-0" style={{ color: 'var(--amber)' }} />
            )}
          </button>
        ))}
      </div>
      {state.provider !== 'skip' && (
        <div className="space-y-4 pt-2">
          <Field label={s.apiKey}>
            <ApiKeyInput
              value={state.provider === 'anthropic' ? state.anthropicKey : state.openaiKey}
              onChange={v => update(state.provider === 'anthropic' ? 'anthropicKey' : 'openaiKey', v)}
              placeholder={
                (state.provider === 'anthropic' ? state.anthropicKeyMask : state.openaiKeyMask)
                || (state.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...')
              }
            />
            {(state.provider === 'anthropic' ? state.anthropicKeyMask : state.openaiKeyMask) && !(state.provider === 'anthropic' ? state.anthropicKey : state.openaiKey) && (
              <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
                {s.apiKeyExisting ?? 'Existing key configured. Leave blank to keep it.'}
              </p>
            )}
          </Field>
          <Field label={s.model}>
            <Input
              value={state.provider === 'anthropic' ? state.anthropicModel : state.openaiModel}
              onChange={e => update(state.provider === 'anthropic' ? 'anthropicModel' : 'openaiModel', e.target.value)}
            />
          </Field>
          {state.provider === 'openai' && (
            <Field label={s.baseUrl} hint={s.baseUrlHint}>
              <Input value={state.openaiBaseUrl} onChange={e => update('openaiBaseUrl', e.target.value)}
                placeholder="https://api.openai.com/v1" />
            </Field>
          )}
        </div>
      )}

      {/* Advanced: Port Settings (collapsed) */}
      <div className="pt-3 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => setPortsOpen(!portsOpen)}
          className="flex items-center gap-1.5 text-xs font-medium"
          style={{ color: 'var(--muted-foreground)' }}>
          {portsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {s.advancedPorts}
        </button>
        {portsOpen && (
          <div className="mt-3 space-y-5">
            {/* MCP Auth Token (read-only) */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>
                🔑 {s.tokenSectionTitle}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate text-xs font-mono px-3 py-2 rounded-lg"
                  style={{ background: 'var(--muted)', color: 'var(--foreground)' }}>
                  {state.authToken}
                </code>
                <button type="button" onClick={onCopyToken}
                  className="flex items-center gap-1 px-2.5 py-2 text-xs rounded-lg border transition-colors hover:bg-muted shrink-0"
                  style={{ borderColor: 'var(--border)', color: 'var(--foreground)' }}>
                  <Copy size={12} /> {s.copyToken}
                </button>
              </div>
              <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
                {s.tokenSectionHint}
              </p>
            </div>

            {/* Port Settings */}
            <StepPorts
              state={state} update={update}
              webPortStatus={webPortStatus} mcpPortStatus={mcpPortStatus}
              setWebPortStatus={setWebPortStatus} setMcpPortStatus={setMcpPortStatus}
              checkPort={checkPort} portConflict={portConflict} s={s}
            />
          </div>
        )}
      </div>
    </div>
  );
}
