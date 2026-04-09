# MindOS Onboarding: Quick Reference Guide

## 🎯 TL;DR - Key Files

| File | Purpose | Size |
|------|---------|------|
| `app/components/SetupWizard.tsx` | Main 4-step wizard container + state | 523 lines |
| `app/components/setup/StepKB.tsx` | Step 0: KB path + template + password | 263 lines |
| `app/components/setup/StepAI.tsx` | Step 1: AI provider + ports + token | ~150 lines |
| `app/components/setup/StepAgents.tsx` | Step 2: Agent selection | ~200 lines |
| `app/components/setup/StepReview.tsx` | Step 3: Review + multi-phase install | ~150 lines |
| `app/components/setup/types.ts` | TypeScript types for all setup | ~62 lines |
| `app/components/setup/constants.tsx` | Step indices + TEMPLATES array | 15 lines |
| `app/components/setup/StepDots.tsx` | Progress indicator UI | 51 lines |
| `app/components/OnboardingView.tsx` | Template picker (entry point) | 165 lines |
| `app/app/setup/page.tsx` | Route: /setup | 12 lines |
| `app/lib/i18n/modules/onboarding.ts` | i18n strings (EN + ZH) | 449 lines |

---

## 🔍 Finding the 3-Step Quick Start

### ❌ NOT HERE - Misconception
The component does **NOT** render a 3-step flow. It has **4 steps**:

1. **Knowledge Base** (path + template + password)
2. **AI Configuration** (provider + ports + token)
3. **Agent Connection** (mode selection + agent list)
4. **Review & Complete** (summary + install phases)

### ✅ ACTUAL STRUCTURE
```typescript
// app/components/setup/constants.tsx
export const TOTAL_STEPS = 4;
export const STEP_KB = 0;
export const STEP_AI = 1;
export const STEP_AGENTS = 2;
export const STEP_REVIEW = 3;

// Step rendering in SetupWizard.tsx
{step === 0 && <StepKB ... />}
{step === 1 && <StepAI ... />}
{step === 2 && <StepAgents ... />}
{step === 3 && <StepReview ... />}
```

---

## 📊 State Management

### SetupState (main data container)
```typescript
interface SetupState {
  mindRoot: string;              // KB path
  template: Template;            // 'en' | 'zh' | 'empty' | ''
  activeProvider: string;        // Provider ID or 'skip'
  providers: SetupProvider[];     // Unified provider config
  webPort: number;               // Web UI port (default 3456)
  mcpPort: number;               // MCP server port (default 8781)
  authToken: string;             // Bearer token (auto-generated)
  webPassword: string;           // Access password (required)
}
```

### All Hooks in SetupWizard
```typescript
const [step, setStep] = useState(0);
const [state, setState] = useState<SetupState>({...});
const [homeDir, setHomeDir] = useState('~');
const [submitting, setSubmitting] = useState(false);
const [completed, setCompleted] = useState(false);
const [error, setError] = useState('');
const [needsRestart, setNeedsRestart] = useState(false);
const [skillInstallStatus, setSkillInstallStatus] = useState('pending');
const [webPortStatus, setWebPortStatus] = useState<PortStatus>({...});
const [mcpPortStatus, setMcpPortStatus] = useState<PortStatus>({...});
const [agents, setAgents] = useState<AgentEntry[]>([]);
const [agentsLoading, setAgentsLoading] = useState(false);
const [agentsLoaded, setAgentsLoaded] = useState(false);
const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
const [agentTransport, setAgentTransport] = useState<'auto'|'stdio'|'http'>('auto');
const [agentScope, setAgentScope] = useState<'global'|'project'>('global');
const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentInstallStatus>>({});
const [connectionMode, setConnectionMode] = useState<ConnectionMode>({ cli: true, mcp: false });
const [setupPhase, setSetupPhase] = useState<'review'|'saving'|'agents'|'skills'|'done'>('review');
```

---

## 🎮 Navigation Logic

### canNext() Validation
```typescript
const canNext = () => {
  if (step === STEP_KB) {
    return state.mindRoot.trim().length > 0 && state.webPassword.trim().length > 0;
  }
  if (step === STEP_AI) {
    if (portConflict) return false;
    if (webPortStatus.checking || mcpPortStatus.checking) return false;
    if (webPortStatus.available === false || mcpPortStatus.available === false) return false;
    return true;
  }
  if (step === STEP_AGENTS) {
    return connectionMode.cli || connectionMode.mcp;
  }
  return true;
};
```

### Button Rendering
```
Step 0-2: [Back] [Next]
Step 3:   [Back] [Complete] → Phase 1-4 → [Restart] or [Go to MindOS]
```

---

## 🔌 API Endpoints Quick Map

```
GET  /api/setup                    → Load existing config + homeDir
POST /api/setup                    → Save all config (Phase 1)
POST /api/setup/generate-token     → Generate auth token
POST /api/setup/check-port         → Check port availability
POST /api/setup/check-path         → Verify KB path exists/empty
POST /api/setup/ls                 → Autocomplete path suggestions
GET  /api/mcp/agents               → List available agents
POST /api/mcp/install              → Install agent MCP config (Phase 2)
POST /api/mcp/install-skill        → Install skill to agents (Phase 3)
POST /api/init                     → Initialize KB from template
```

---

## 🎨 Component Imports

### Icons Used (lucide-react)
```typescript
Sparkles, Loader2, ChevronLeft, ChevronRight, AlertCircle, Globe, 
BookOpen, FileText, GitBranch, CheckCircle2, Copy, ExternalLink,
ChevronDown, ChevronRight, Brain, Terminal, Plug, Loader2, 
XCircle, CheckCircle2
```

### Internal Components
```typescript
import StepKB from './StepKB';
import StepAI from './StepAI';
import StepAgents from './StepAgents';
import StepReview from './StepReview';
import StepDots from './StepDots';
import StepPorts from './StepPorts';
import { Field, Input, PasswordInput, Select } from '@/components/settings/Primitives';
import ProviderSelect from '@/components/shared/ProviderSelect';
import ModelInput from '@/components/shared/ModelInput';
```

---

## 🌐 i18n Keys - Main Structure

### English Base Path: `t.setup.stepTitles`
```
['Knowledge Base', 'AI Configuration', 'Agent Connection', 'Confirm']
```

### Chinese Base Path: `t.setup.stepTitles`
```
['知识库', 'AI 配置', 'Agent 连接', '确认']
```

### Common Keys Across All Steps
```
back, next, complete, completing
phaseSaving, phaseAgents, phaseSkill, phaseDone
healthKb, healthAi, healthAgents, healthSkills
```

---

## ⚙️ Effect Hooks Timeline

```
Mount
  ├─ useEffect: Load config from /api/setup
  └─ useEffect: Generate token if missing

Enter STEP_AI
  └─ useEffect: Auto-check ports + auto-resolve

Enter STEP_AGENTS
  └─ useEffect: Load agents from /api/mcp/agents
```

---

## 🔄 Multi-Phase Completion Flow

```
User clicks [Complete Setup]
  ↓
Phase 1: saveConfig()
  ├─ POST /api/setup
  ├─ Returns: { needsRestart: boolean }
  └─ If error → setError() + return
  ↓
Phase 2: installAgents() [only if MCP mode]
  ├─ POST /api/mcp/install
  ├─ Returns: { results: AgentInstallStatus[] }
  └─ Non-blocking on failure
  ↓
Phase 3: installSkills() [if agents selected]
  ├─ POST /api/mcp/install-skill
  ├─ Returns: { ok: boolean }
  └─ Non-blocking on failure
  ↓
Phase 4: Show health check summary
  ├─ Display config status
  ├─ Show agent results
  ├─ Show skill status
  └─ Offer restart or go to MindOS
```

---

## 🎯 Rendering Decision Tree

### In SetupWizard.tsx
```typescript
{step === STEP_KB && <StepKB state={state} update={update} t={t} homeDir={homeDir} />}
{step === STEP_AI && <StepAI state={state} update={update} ... />}
{step === STEP_AGENTS && <StepAgents agents={agents} selectedAgents={selectedAgents} ... />}
{step === STEP_REVIEW && <StepReview state={state} setupPhase={setupPhase} ... />}

{step < TOTAL_STEPS - 1 ? (
  <button onClick={() => setStep(step + 1)} disabled={!canNext()}>Next</button>
) : completed ? (
  needsRestart ? <RestartButton /> : <a href="/?welcome=1">Go to MindOS</a>
) : (
  <button onClick={handleComplete} disabled={submitting}>Complete Setup</button>
)}
```

---

## 📋 Types You Need to Know

```typescript
type Template = 'en' | 'zh' | 'empty' | '';

type AgentInstallState = 'pending' | 'installing' | 'ok' | 'error';

interface PortStatus {
  checking: boolean;
  available: boolean | null;
  isSelf: boolean;
  suggestion: number | null;
}

interface ConnectionMode {
  cli: boolean;
  mcp: boolean;
}

interface AgentEntry {
  key: string;
  name: string;
  present: boolean;
  installed: boolean;
  scope?: string;
  hasProjectScope: boolean;
  hasGlobalScope: boolean;
  preferredTransport: 'stdio' | 'http';
}
```

---

## 🚀 Common Modifications

### Add a new field to SetupState
1. Add to `SetupState` interface in `types.ts`
2. Initialize in `useState` in `SetupWizard.tsx`
3. Update in corresponding Step component
4. Include in `saveConfig()` POST body

### Add a new step
1. Create new file: `app/components/setup/StepX.tsx`
2. Increment `TOTAL_STEPS` in `constants.tsx`
3. Add new `STEP_X = N` constant
4. Add conditional render in `SetupWizard.tsx`
5. Add entry in `s.stepTitles` (i18n)
6. Update `canNext()` logic

### Change port validation behavior
1. Modify `checkPort()` in `SetupWizard.tsx`
2. Update `canNext()` step AI validation
3. Adjust `autoResolve` parameter behavior

---

## 🐛 Debugging Tips

### Check which step user is on
```typescript
console.log('Current step:', step, 'STEP_KB:', STEP_KB, 'STEP_AI:', STEP_AI, ...);
```

### Inspect SetupState
```typescript
console.log('Setup state:', state);
```

### Check port status
```typescript
console.log('Web port:', webPortStatus, 'MCP port:', mcpPortStatus);
```

### Check phase progress
```typescript
console.log('Setup phase:', setupPhase);
```

### Check agent installation
```typescript
console.log('Agent statuses:', agentStatuses);
```

---

## 💾 File Locations at a Glance

```
app/
├── components/
│   ├── SetupWizard.tsx           ← MAIN WIZARD (state + routing)
│   ├── OnboardingView.tsx        ← TEMPLATE PICKER
│   └── setup/
│       ├── index.tsx             ← Re-export
│       ├── types.ts              ← ALL TYPES
│       ├── constants.tsx         ← STEP INDICES
│       ├── StepDots.tsx          ← PROGRESS UI
│       ├── StepKB.tsx            ← STEP 0
│       ├── StepAI.tsx            ← STEP 1
│       ├── StepAgents.tsx        ← STEP 2
│       ├── StepReview.tsx        ← STEP 3
│       └── StepPorts.tsx         ← Port UI sub-component
├── app/
│   ├── setup/
│   │   └── page.tsx              ← ROUTE /setup
│   └── view/[...path]/page.tsx   ← Check setupPending
└── lib/
    └── i18n/
        └── modules/
            └── onboarding.ts     ← i18n STRINGS

Desktop/Resources also has:
resources/mindos-runtime/app/components/SetupWizard.tsx (copy)
```

---

## ✨ Pro Tips

1. **State lifting**: All state is in `SetupWizard` parent. Child components are pure (get props, call update callback).

2. **Unified providers**: Uses single `Provider[]` array format (not legacy provider types).

3. **Auto-generation**: Auth token is auto-generated on mount. Ports are auto-resolved on STEP_AI entry.

4. **Debounced**: Path autocomplete and checks use 300-600ms debounce to avoid hammering API.

5. **Non-blocking**: Agent installation failures don't block skill installation or completion.

6. **Accessibility**: Full ARIA labels, semantic HTML, keyboard navigation supported.

7. **i18n complete**: Full English + Chinese support. Add new keys to both `onboardingEn` and `onboardingZh`.

8. **Error recovery**: Per-agent retry buttons. Global error banner at top. Never lose user input.

