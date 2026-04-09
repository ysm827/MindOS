# MindOS Quick Start / Onboarding Component Report

## Overview
The MindOS onboarding system consists of **two main flows**:

1. **OnboardingView** - Initial template selection when KB is empty (single page)
2. **SetupWizard** - Full 4-step setup flow with state management (comprehensive)

---

## 1. TEMPLATE SELECTION (Lightweight Entry Point)

### File: `app/components/OnboardingView.tsx`
**Purpose**: Shown when user has an empty knowledge base. Displays 3 template options.

**Key Features**:
- ✅ Template cards: English, Chinese (中文), Empty
- ✅ Directory preview for each template
- ✅ Calls `/api/init` endpoint to initialize
- ✅ Error handling & retry UI
- ✅ Cross-device sync hint (mindos sync init)
- ✅ Import files shortcut

**State Management**:
```typescript
const [loading, setLoading] = useState<Template | null>(null);
const [error, setError] = useState<string | null>(null);
```

**Component Logic**:
- Maps 3 templates from TEMPLATES array
- Each template has icon, id, and sample dirs
- On selection → POST to `/api/init` with template
- Shows loading spinner on selected template
- Error banner with dismiss button

**i18n Keys**:
- `t.onboarding.subtitle`
- `t.onboarding.templates[en|zh|empty]`
- `t.onboarding.importHint`
- `t.onboarding.syncHint`

---

## 2. FULL SETUP WIZARD (Main 4-Step Flow)

### File: `app/components/SetupWizard.tsx`
**Purpose**: Comprehensive setup wizard with 4 sequential steps

### Architecture

**State Container**: `SetupState` (types.ts)
```typescript
interface SetupState {
  mindRoot: string;                // KB path
  template: Template;              // 'en' | 'zh' | 'empty' | ''
  activeProvider: string;          // Provider ID or 'skip'
  providers: SetupProvider[];       // Unified provider config
  webPort: number;                 // Web UI port
  mcpPort: number;                 // MCP server port
  authToken: string;               // Bearer token (auto-generated)
  webPassword: string;             // Access password (required)
}
```

**Step Constants** (`app/components/setup/constants.tsx`):
```
TOTAL_STEPS = 4
STEP_KB = 0      (Knowledge Base path + template + password)
STEP_AI = 1      (AI provider + ports + auth token)
STEP_AGENTS = 2  (Agent connection mode selection)
STEP_REVIEW = 3  (Confirm + health check)
```

---

## 3. STEP-BY-STEP BREAKDOWN

### Step 0: Knowledge Base Configuration
**File**: `app/components/setup/StepKB.tsx`

**Renders**:
1. **KB Path Input** with autocomplete
   - Debounced path suggestions
   - Arrow key navigation through suggestions
   - "Use default" quick button
   
2. **Template Selection** (3 cards)
   - English, Chinese, Empty templates
   - Conditional display based on path state
   - Shows merge option if directory has files
   
3. **Web Password** (required ⚠️)
   - Protected input field
   - Validation state on blur
   - Error display if empty

**Logic Flow**:
- Autocomplete fetches from `/api/setup/ls`
- Path check from `/api/setup/check-path`
- Auto-detects non-empty directories → suggests skip template
- `canNext()` requires: mindRoot + webPassword filled

---

### Step 1: AI Configuration
**File**: `app/components/setup/StepAI.tsx`

**Renders**:
1. **AI Provider Selection** (dropdown)
   - Unified provider list (not legacy provider types)
   - "Skip" option available
   
2. **Provider Config Fields**:
   - API Key (masked if existing)
   - Model selector with "Browse" option
   - Base URL (optional, for proxies)
   
3. **Advanced Settings Section**:
   - Web UI Port (collapsible)
   - MCP Server Port (collapsible)
   - Port conflict detection
   - Port availability check
   
4. **Auth Token Section**:
   - Auto-generated bearer token
   - Custom seed option
   - Generate & Copy buttons
   
**Port Validation**:
- Checks port availability via `/api/setup/check-port`
- Auto-suggests alternatives
- Shows "in use" / "available" / "current port" status
- Prevents duplicate ports (web ≠ mcp)

**canNext() checks**:
- No port conflict
- Ports not being checked
- Ports are available (or not yet checked)

---

### Step 2: Agent Connection
**File**: `app/components/setup/StepAgents.tsx`

**Renders**:
1. **Connection Mode Toggle** (2 options):
   - ☑️ CLI mode (recommended, lower token usage)
   - ☑️ MCP mode (optional, higher token usage)
   - At least one must be selected
   
2. **Agent List** (if agents available):
   - Filterable checkbox list
   - Badges: Installed / Detected / Not found
   - Transport selector (auto/stdio/http)
   - Scope selector (global/project)
   - Status display during install
   
3. **Detected Agent Types**:
   - claude-code, cursor, windsurf, cline, trae, gemini-cli, augment
   - Auto-populates from `/api/mcp/agents`
   - Excludes 'builtin' scope agents

**Install Status Display**:
- "installing" state with spinner
- "ok" / "error" result badges
- Retry button on failure

**canNext() checks**:
- At least one connection mode selected: `connectionMode.cli || connectionMode.mcp`

---

### Step 3: Review & Complete
**File**: `app/components/setup/StepReview.tsx`

**Renders**:
1. **Configuration Summary**:
   - KB path, template, ports
   - AI provider (if set)
   - Selected agents count
   
2. **Setup Phases** (sequential):
   - `'review'` → user submits
   - `'saving'` → config POST to `/api/setup`
   - `'agents'` → agent MCP config POST to `/api/mcp/install`
   - `'skills'` → skill install POST to `/api/mcp/install-skill`
   - `'done'` → health check display
   
3. **Health Check** (when done):
   - Knowledge Base status
   - AI Provider status
   - Agent connection status
   - Skills installation status
   - Auth Token display
   
4. **Completion Actions**:
   - Show "Restart now" if `needsRestart`
   - Show "Go to MindOS" link if no restart needed

**Error Handling**:
- Top-level error banner
- Per-agent error display
- Non-blocking agent failures
- Retry button for individual agents

---

## 4. STATE MANAGEMENT & HOOKS

### Main Hooks in SetupWizard:
```typescript
// Navigation
const [step, setStep] = useState(0);

// Setup data
const [state, setState] = useState<SetupState>({...});

// Environment
const [homeDir, setHomeDir] = useState('~');

// Submission state
const [submitting, setSubmitting] = useState(false);
const [completed, setCompleted] = useState(false);
const [error, setError] = useState('');
const [needsRestart, setNeedsRestart] = useState(false);

// Port validation
const [webPortStatus, setWebPortStatus] = useState<PortStatus>({...});
const [mcpPortStatus, setMcpPortStatus] = useState<PortStatus>({...});

// Agent state
const [agents, setAgents] = useState<AgentEntry[]>([]);
const [agentsLoading, setAgentsLoading] = useState(false);
const [agentsLoaded, setAgentsLoaded] = useState(false);
const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
const [agentTransport, setAgentTransport] = useState<'auto'|'stdio'|'http'>('auto');
const [agentScope, setAgentScope] = useState<'global'|'project'>('global');
const [agentStatuses, setAgentStatuses] = useState<Record<string, AgentInstallStatus>>({});

// Connection mode
const [connectionMode, setConnectionMode] = useState<ConnectionMode>({ cli: true, mcp: false });

// Phase tracking
const [setupPhase, setSetupPhase] = useState<'review'|'saving'|'agents'|'skills'|'done'>('review');
```

### Key Callbacks:
```typescript
const update = useCallback(<K extends keyof SetupState>(key: K, val: SetupState[K]) => {
  setState(prev => ({ ...prev, [key]: val }));
}, []);

const checkPort = useCallback(async (port: number, which: 'web'|'mcp', autoResolve = false) => {...}, []);

const handleComplete = async () => {
  // Phase 1: saveConfig()
  // Phase 2: installAgents() if MCP mode
  // Phase 3: installSkills()
};

const retryAgent = useCallback(async (key: string) => {...}, [agents, agentScope, agentTransport, ...]);
```

### Effect Hooks:
1. **Load existing config on mount**
   - Fetches `/api/setup` → populates state
   - Generates auth token if missing
   
2. **Auto-check ports when entering STEP_AI**
   - Calls `checkPort()` for web & mcp
   - Auto-resolves conflicts
   
3. **Load agents when entering STEP_AGENTS**
   - Fetches `/api/mcp/agents`
   - Filters out 'builtin' scope
   - Auto-selects installed agents

---

## 5. API ENDPOINTS USED

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/init` | POST | Initialize KB with template |
| `/api/setup` | GET | Load existing config |
| `/api/setup` | POST | Save setup config (Phase 1) |
| `/api/setup/generate-token` | POST | Generate auth token |
| `/api/setup/check-port` | POST | Check port availability |
| `/api/setup/check-path` | POST | Verify KB path exists/empty |
| `/api/setup/ls` | POST | List directory contents (autocomplete) |
| `/api/mcp/agents` | GET | List available agents |
| `/api/mcp/install` | POST | Install agent MCP config (Phase 2) |
| `/api/mcp/install-skill` | POST | Install skills to agents (Phase 3) |

---

## 6. NAVIGATION & FLOW CONTROL

### StepDots Component
**File**: `app/components/setup/StepDots.tsx`

- Visual progress indicator (numbered dots 1-4)
- Completed steps show checkmarks ✓
- Navigation between steps
- Prevents jumping forward
- Disabled during submission/completion

### Button Logic:
```
Step 0-2: [Back] [Next]
Step 3:   [Back] [Complete] OR [Restart] OR [Go to MindOS]
```

### Disabling:
- All buttons disabled during `submitting || completed`
- "Next" button disabled if `!canNext()`
- Forward navigation blocked (can't skip ahead)

---

## 7. UI COMPONENTS & STYLING

### Shared UI Primitives Used:
- `Field` - labeled input wrapper
- `Input` - text input
- `PasswordInput` - masked password field
- `Select` - dropdown selector
- Lucide React icons (Sparkles, ChevronLeft, Loader2, etc.)

### CSS Variables:
```css
--amber, --amber-foreground, --amber-dim
--foreground, --background
--border, --muted, --muted-foreground
--error, --ring
--input, --card
```

### Responsive Layout:
- Fixed full-screen modal on desktop
- Sticky header (logo + step dots)
- Scrollable content area
- Grid layouts (1/3 cols on mobile/desktop)

---

## 8. I18N STRUCTURE

**File**: `app/lib/i18n/modules/onboarding.ts`

### English Keys (sample):
```
onboarding.subtitle, templates[en|zh|empty], importHint, syncHint
setup.stepTitles: ['Knowledge Base', 'AI Configuration', 'Agent Connection', 'Confirm']
setup.kbPath, kbPathHint, template, webPassword, webPasswordHint
setup.aiProvider, apiKey, model, baseUrl, webPort, mcpPort
setup.authToken, authTokenHint, authTokenUsage
setup.agentToolsTitle, agentNoneSelected, agentInstalling, agentStatusOk
setup.back, next, complete, completing
setup.phaseSaving, phaseAgents, phaseSkill, phaseDone
```

### Chinese Keys (sample):
```
onboarding.subtitle: '知识库为空，选择一个模板快速开始。'
setup.stepTitles: ['知识库', 'AI 配置', 'Agent 连接', '确认']
setup.kbPath: '知识库路径'
setup.webPassword: '访问密码'
setup.agentToolsTitle: 'Agent 连接'
```

---

## 9. FILE STRUCTURE SUMMARY

```
app/
├── components/
│   ├── SetupWizard.tsx              ← Main wizard container (4 steps)
│   ├── OnboardingView.tsx           ← Template picker (entry point)
│   └── setup/
│       ├── index.tsx                ← Re-export wrapper
│       ├── types.ts                 ← All TypeScript interfaces
│       ├── constants.tsx            ← Step indices & TEMPLATES array
│       ├── StepDots.tsx             ← Progress indicator
│       ├── StepKB.tsx               ← Step 0: KB path + template + password
│       ├── StepAI.tsx               ← Step 1: AI provider + ports + token
│       ├── StepAgents.tsx           ← Step 2: Agent selection
│       ├── StepReview.tsx           ← Step 3: Review + install
│       └── StepPorts.tsx            ← Port configuration sub-component
├── app/
│   └── setup/
│       └── page.tsx                 ← Route: /setup (server component)
└── lib/
    └── i18n/
        └── modules/
            └── onboarding.ts        ← i18n strings (EN + ZH)
```

---

## 10. RENDERING LOGIC (In SetupWizard)

```typescript
{step === STEP_KB && <StepKB state={state} update={update} t={t} homeDir={homeDir} />}
{step === STEP_AI && <StepAI {...props} />}
{step === STEP_AGENTS && <StepAgents {...props} />}
{step === STEP_REVIEW && <StepReview {...props} />}

// Navigation rendered for all steps
if (step < TOTAL_STEPS - 1) {
  <button onClick={() => setStep(step + 1)}>Next</button>
} else if (completed) {
  needsRestart ? <RestartButton /> : <a href="/?welcome=1">Go to MindOS</a>
} else {
  <button onClick={handleComplete}>Complete Setup</button>
}
```

---

## 11. KEY FEATURES & PATTERNS

✅ **State Lifting**: All state in SetupWizard parent
✅ **Unified Provider Format**: Single Provider[] array (not legacy types)
✅ **Auto-generation**: Token generated on mount, ports auto-resolved
✅ **Debounced Autocomplete**: Path suggestions with 300ms delay
✅ **Phase Sequencing**: save config → install agents → install skills
✅ **Error Recovery**: Per-agent retry, global error banner
✅ **Port Conflict Prevention**: Real-time validation + suggestions
✅ **Responsive Design**: Mobile-first, 3-col grid on desktop
✅ **Accessibility**: ARIA labels, semantic HTML, keyboard navigation
✅ **i18n Complete**: Full EN/ZH support for all strings

