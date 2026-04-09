# MindOS Onboarding Flow Diagram

## Entry Point Decision Tree

```
User launches app
  ↓
Is KB empty?
  ├─→ NO  → Show normal app
  └─→ YES → Show OnboardingView

OnboardingView (Template Selection)
  ├─→ Choose "English"   → /api/init → SetupWizard
  ├─→ Choose "中文"       → /api/init → SetupWizard
  └─→ Choose "Empty"     → /api/init → SetupWizard
```

---

## SetupWizard: 4-Step Flow

```
┌─────────────────────────────────────────────────────────────┐
│              STEP 0: KNOWLEDGE BASE                         │
├─────────────────────────────────────────────────────────────┤
│  Input:    KB Path ─→ /api/setup/ls (autocomplete)         │
│            ↓                                                 │
│            /api/setup/check-path (exists? empty?)           │
│            ↓                                                 │
│  Select:   Template (3 options)                             │
│  Enter:    Web Password (required ⚠️)                       │
│                                                              │
│  canNext: mindRoot.length > 0 && webPassword.length > 0     │
└─────────────────────────────────────────────────────────────┘
                          ↓ [Next]
┌─────────────────────────────────────────────────────────────┐
│            STEP 1: AI CONFIGURATION                         │
├─────────────────────────────────────────────────────────────┤
│  Select:   AI Provider (dropdown)                           │
│  Optional: API Key, Model, Base URL                         │
│                                                              │
│  ADVANCED SECTION:                                          │
│    Web Port   ─→ /api/setup/check-port → auto-resolve      │
│    MCP Port   ─→ /api/setup/check-port → auto-resolve      │
│    Conflict?  → Show error (must be different)              │
│                                                              │
│  Auth Token:                                                │
│    Auto-generated on mount                                  │
│    Can customize with seed                                  │
│    Copy button for user                                     │
│                                                              │
│  canNext: !portConflict && !checking && portAvailable       │
└─────────────────────────────────────────────────────────────┘
                          ↓ [Next]
┌─────────────────────────────────────────────────────────────┐
│         STEP 2: AGENT CONNECTION                            │
├─────────────────────────────────────────────────────────────┤
│  Select Connection Mode:                                    │
│    ☑ CLI mode (recommended)                                 │
│    ☑ MCP mode (optional)                                    │
│    ↑ At least one required                                  │
│                                                              │
│  Load Agents: /api/mcp/agents (filtered, no builtin)        │
│                                                              │
│  For each agent:                                            │
│    - Checkbox (to select)                                   │
│    - Badge (Installed / Detected / Not found)               │
│    - Transport selector (auto/stdio/http)                   │
│    - Scope selector (global/project)                        │
│    - Status display (pending/installing/ok/error)           │
│                                                              │
│  canNext: connectionMode.cli || connectionMode.mcp          │
└─────────────────────────────────────────────────────────────┘
                          ↓ [Next]
┌─────────────────────────────────────────────────────────────┐
│              STEP 3: REVIEW & COMPLETE                      │
├─────────────────────────────────────────────────────────────┤
│                     [Click: Complete]                       │
│                          ↓                                   │
│          ┌─────────────────────────────────┐                │
│          │ PHASE 1: SAVING CONFIG          │                │
│          │ POST /api/setup                 │                │
│          │ Returns: needsRestart boolean   │                │
│          └─────────────────────────────────┘                │
│                          ↓                                   │
│          ┌─────────────────────────────────┐                │
│          │ PHASE 2: INSTALL AGENTS (if MCP)│                │
│          │ POST /api/mcp/install           │                │
│          │ Per-agent status tracking       │                │
│          └─────────────────────────────────┘                │
│                          ↓                                   │
│          ┌─────────────────────────────────┐                │
│          │ PHASE 3: INSTALL SKILLS         │                │
│          │ POST /api/mcp/install-skill     │                │
│          │ Single skill to all agents      │                │
│          └─────────────────────────────────┘                │
│                          ↓                                   │
│          ┌─────────────────────────────────┐                │
│          │ PHASE 4: SHOW HEALTH CHECK      │                │
│          │ - KB status                     │                │
│          │ - AI provider status            │                │
│          │ - Agent count                   │                │
│          │ - Skills status                 │                │
│          └─────────────────────────────────┘                │
│                          ↓                                   │
│          If needsRestart:                                   │
│            [Button: Restart now]                            │
│          Else:                                              │
│            [Link: Go to MindOS] /?welcome=1                 │
└─────────────────────────────────────────────────────────────┘
```

---

## State Flow Diagram

```
SetupWizard
├── step: 0 | 1 | 2 | 3
│
├── SetupState
│   ├── mindRoot: string
│   ├── template: 'en' | 'zh' | 'empty' | ''
│   ├── activeProvider: string
│   ├── providers: SetupProvider[]
│   ├── webPort: number
│   ├── mcpPort: number
│   ├── authToken: string (auto-generated)
│   └── webPassword: string (required)
│
├── Submission State
│   ├── submitting: boolean
│   ├── completed: boolean
│   ├── error: string
│   ├── needsRestart: boolean
│   └── setupPhase: 'review' | 'saving' | 'agents' | 'skills' | 'done'
│
├── Port Validation
│   ├── webPortStatus: PortStatus
│   └── mcpPortStatus: PortStatus
│       ├── checking: boolean
│       ├── available: boolean | null
│       ├── isSelf: boolean
│       └── suggestion: number | null
│
├── Agent Management
│   ├── agents: AgentEntry[]
│   ├── agentsLoading: boolean
│   ├── agentsLoaded: boolean
│   ├── selectedAgents: Set<string>
│   ├── agentTransport: 'auto' | 'stdio' | 'http'
│   ├── agentScope: 'global' | 'project'
│   ├── agentStatuses: Record<string, AgentInstallStatus>
│   ├── connectionMode: { cli: boolean, mcp: boolean }
│   └── skillInstallStatus: 'pending' | 'installing' | 'ok' | 'error' | 'skipped'
│
└── Environment
    └── homeDir: string
```

---

## Component Hierarchy

```
SetupPage (/app/setup/page.tsx)
  ├─ check settings.setupPending
  └─ render: SetupWizard

SetupWizard
  ├── Header (sticky)
  │   ├── Logo + Title
  │   └── StepDots
  │       └── 4 numbered dots (1-4)
  │           ├── Completed steps show ✓
  │           ├── Click to navigate backward
  │           └── Disabled forward navigation
  │
  ├── Content (scrollable)
  │   ├── Step 0: StepKB
  │   │   ├── KB Path Input (with autocomplete)
  │   │   ├── Template Cards (3 options)
  │   │   └── Password Input (required)
  │   │
  │   ├── Step 1: StepAI
  │   │   ├── Provider Select (dropdown)
  │   │   ├── Provider Config (API Key, Model, BaseURL)
  │   │   ├── StepPorts (collapsible)
  │   │   │   ├── Web Port Field + Status
  │   │   │   └── MCP Port Field + Status
  │   │   └── Auth Token Section
  │   │       ├── Display (masked)
  │   │       ├── Copy Button
  │   │       ├── Generate Button
  │   │       └── Seed Input (optional)
  │   │
  │   ├── Step 2: StepAgents
  │   │   ├── Connection Mode Checkboxes
  │   │   │   ├── CLI checkbox + hint
  │   │   │   └── MCP checkbox + hint
  │   │   ├── Agent List
  │   │   │   ├── Checkbox (per agent)
  │   │   │   ├── Badge (status)
  │   │   │   ├── Transport selector
  │   │   │   └── Scope selector
  │   │   └── Advanced Options
  │   │       ├── Transport selector
  │   │       └── Scope selector
  │   │
  │   └── Step 3: StepReview
  │       ├── Config Summary
  │       ├── Phase Indicator (saving/agents/skills/done)
  │       ├── Error Banner (if any)
  │       ├── Agent Status Table (if installing)
  │       ├── Health Check (when done)
  │       └── Restart / Go buttons
  │
  └── Footer (buttons)
      ├── Back Button (disabled on step 0)
      ├── Next Button (if step < 3)
      └── Complete / Restart / Go buttons (step 3)
```

---

## Conditional Rendering Logic

```javascript
// Step determination
const showKB = (step === 0);
const showAI = (step === 1);
const showAgents = (step === 2);
const showReview = (step === 3);

// Template selection visibility in Step 0
if (pathInfo?.exists && !pathInfo.empty && !showTemplatePickerAnyway) {
  // Show merge warning instead of cards
} else {
  // Show 3 template cards
}

// Next button availability
const canNext = () => {
  if (step === 0) return mindRoot.length > 0 && webPassword.length > 0;
  if (step === 1) return !portConflict && !webPortStatus.checking && !mcpPortStatus.checking && portAvailable;
  if (step === 2) return connectionMode.cli || connectionMode.mcp;
  return true;
};

// Final buttons in Step 3
if (step === 3) {
  if (!completed) {
    // Show: [Complete Setup]
  } else if (needsRestart) {
    // Show: [Restart now]
  } else {
    // Show: [Go to MindOS] link
  }
}
```

---

## Data Flow: HandleComplete

```
handleComplete()
  ├─ Phase 1: saveConfig()
  │   ├─ POST /api/setup
  │   │   └─ Body: mindRoot, template, ports, authToken, webPassword, providers, connectionMode
  │   ├─ Returns: { needsRestart: boolean }
  │   └─ If error: setError() → return early
  │
  ├─ Phase 2: installAgents() [only if MCP mode]
  │   ├─ POST /api/mcp/install
  │   │   └─ Body: agents[], transport, url, token
  │   ├─ Returns: { results: AgentInstallStatus[] }
  │   └─ Parse results into agentStatuses map
  │
  ├─ Phase 3: installSkills() [if agents selected]
  │   ├─ POST /api/mcp/install-skill
  │   │   └─ Body: skill: 'mindos' | 'mindos-zh', agents: string[]
  │   └─ Returns: { ok: boolean }
  │
  └─ Phase 4: Final State
      ├─ setCompleted(true)
      ├─ setSetupPhase('done')
      └─ Show health check summary
```

---

## Error Handling Strategy

```
OnboardingView
└─ Try: POST /api/init
   ├─ Success → router.refresh()
   └─ Fail → Show error banner + Dismiss button

SetupWizard (Phase 1: Config)
└─ Try: POST /api/setup
   ├─ Success → Proceed to Phase 2
   └─ Fail → setError() + stay on Step 3 + Reset submitting

SetupWizard (Phase 2: Agents)
└─ Try: POST /api/mcp/install (per agent)
   ├─ Success → Show "ok" status
   ├─ Fail → Show "error" status + Retry button
   └─ Non-blocking (can proceed to next phase)

SetupWizard (Phase 3: Skills)
└─ Try: POST /api/mcp/install-skill
   ├─ Success → setSkillInstallStatus('ok')
   ├─ Fail → setSkillInstallStatus('error')
   └─ Non-blocking (can proceed to done)

User Actions:
├─ Retry agent → retryAgent(key) → POST /api/mcp/install (single)
└─ Close error → setError('')
```

---

## API Call Sequence

```
// On mount
1. GET /api/setup → Load existing config
2. POST /api/setup/generate-token → Generate token (if missing)

// On STEP_AI entry
3. POST /api/setup/check-port (web)
4. POST /api/setup/check-port (mcp) [auto-resolve conflicts]

// On STEP_AGENTS entry
5. GET /api/mcp/agents → Load available agents

// User types path on STEP_KB
6. POST /api/setup/ls → Autocomplete suggestions
7. POST /api/setup/check-path → Verify path exists/empty

// User clicks Complete on STEP_REVIEW
8. POST /api/setup → Save config
9. POST /api/mcp/install → Install MCP config to agents
10. POST /api/mcp/install-skill → Install skill to agents

// User clicks Retry on agent failure
11. POST /api/mcp/install → Retry single agent
```

---

## i18n Key Mapping

```
OnboardingView
├─ t.onboarding.subtitle
├─ t.onboarding.templates[id].title
├─ t.onboarding.templates[id].desc
├─ t.onboarding.importHint
├─ t.onboarding.syncHint
└─ t.fileImport.onboardingHint

StepKB
├─ t.setup.kbPath
├─ t.setup.kbPathHint
├─ t.setup.template
├─ t.onboarding.templates[id].*
├─ t.setup.webPassword
└─ t.setup.webPasswordHint

StepAI
├─ t.setup.aiProvider
├─ t.setup.apiKey
├─ t.setup.model
├─ t.setup.baseUrl
├─ t.setup.webPort
├─ t.setup.mcpPort
├─ t.setup.authToken
└─ t.setup.authTokenHint

StepAgents
├─ t.setup.agentToolsTitle
├─ t.setup.connectionModeTitle
├─ t.setup.connectionModeCliHint
├─ t.setup.connectionModeMcpHint
├─ t.setup.agentTransport
└─ t.setup.agentScope

StepReview
├─ t.setup.reviewHint
├─ t.setup.phaseSaving
├─ t.setup.phaseAgents
├─ t.setup.phaseSkill
├─ t.setup.phaseDone
└─ t.setup.healthKb / healthAi / healthAgents

StepDots
├─ t.setup.stepTitles (array of 4 strings)
└─ t.hints.cannotJumpForward
```
