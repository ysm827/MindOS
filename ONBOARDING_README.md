# MindOS Onboarding / Quick Start Component Analysis

## 📚 Documentation Files Created

I've created **3 comprehensive documents** analyzing the MindOS onboarding system:

### 1. **ONBOARDING_COMPONENTS_REPORT.md** (14 KB)
Complete technical breakdown of the entire onboarding system
- Overview of 2 main flows (OnboardingView + SetupWizard)
- Detailed breakdown of all 4 steps
- Full state management documentation
- All API endpoints used
- Component hierarchy
- i18n structure
- Key features and patterns

**👉 Start here for comprehensive understanding**

### 2. **ONBOARDING_FLOW_DIAGRAM.md** (17 KB)
Visual diagrams and flow charts
- Entry point decision tree
- 4-step flow diagrams with inputs/outputs
- State flow diagram
- Component hierarchy tree
- Conditional rendering logic
- Data flow (handleComplete)
- Error handling strategy
- API call sequence
- i18n key mapping

**👉 Use this for visual understanding and architecture decisions**

### 3. **ONBOARDING_QUICK_REFERENCE.md** (12 KB)
TL;DR quick reference for developers
- File structure at a glance
- Key state types
- Navigation logic
- API endpoints quick map
- Component imports
- i18n keys
- Effect hooks timeline
- Common modifications guide
- Debugging tips

**👉 Quick lookup while coding**

---

## 🎯 Quick Facts

### Two Entry Points
1. **OnboardingView** - Template selection when KB is empty (simple, 1 page)
2. **SetupWizard** - Full 4-step setup wizard (comprehensive, guided)

### The 4-Step Flow (NOT 3-step!)
```
Step 0: Knowledge Base Configuration
  ├─ KB path input with autocomplete
  ├─ Template selection (English/中文/Empty)
  └─ Required password

Step 1: AI Configuration  
  ├─ AI provider selection
  ├─ Advanced settings (ports, auth token)
  └─ Port validation and auto-resolution

Step 2: Agent Connection
  ├─ Connection mode (CLI / MCP)
  ├─ Agent selection and configuration
  └─ Transport and scope settings

Step 3: Review & Complete
  ├─ Configuration summary
  ├─ Multi-phase installation
  ├─ Health check display
  └─ Restart or continue to app
```

### Key Files (11 total)

| Priority | File | Lines | Purpose |
|----------|------|-------|---------|
| 🔴 HIGH | `app/components/SetupWizard.tsx` | 523 | Main container + state |
| 🔴 HIGH | `app/components/setup/types.ts` | 62 | All TypeScript types |
| 🟡 MED | `app/components/setup/StepKB.tsx` | 263 | Step 0 component |
| 🟡 MED | `app/components/setup/constants.tsx` | 15 | Step indices |
| 🟡 MED | `app/lib/i18n/modules/onboarding.ts` | 449 | i18n strings |
| 🟢 LOW | `app/components/setup/StepAI.tsx` | ~150 | Step 1 component |
| 🟢 LOW | `app/components/setup/StepAgents.tsx` | ~200 | Step 2 component |
| 🟢 LOW | `app/components/setup/StepReview.tsx` | ~150 | Step 3 component |
| 🟢 LOW | `app/components/OnboardingView.tsx` | 165 | Template picker |
| 🟢 LOW | `app/components/setup/StepDots.tsx` | 51 | Progress indicator |
| 🟢 LOW | `app/app/setup/page.tsx` | 12 | Route wrapper |

### State Management
- **Central container**: `SetupWizard` holds all state
- **SetupState interface**: 8 fields (path, template, provider, ports, token, password)
- **18 state hooks** total (navigation, submission, validation, agents, etc.)
- **Unified provider format**: Single `Provider[]` array (not legacy types)

### API Endpoints (11 total)
```
GET  /api/setup                    POST /api/setup
POST /api/setup/generate-token     POST /api/setup/check-port
POST /api/setup/check-path         POST /api/setup/ls
GET  /api/mcp/agents               POST /api/mcp/install
POST /api/mcp/install-skill        POST /api/init
```

### i18n Support
- ✅ Full English support
- ✅ Full Chinese (中文) support
- ✅ All strings in: `app/lib/i18n/modules/onboarding.ts`
- ✅ 2 locales: `onboardingEn` + `onboardingZh`

---

## 🔍 Key Insights

### Architecture Pattern
```
SetupPage (server component, route check)
  └─ SetupWizard (main state container, client component)
      ├─ Header: Logo + StepDots
      ├─ Content: Conditional step rendering
      │   ├─ {step === 0 && <StepKB />}
      │   ├─ {step === 1 && <StepAI />}
      │   ├─ {step === 2 && <StepAgents />}
      │   └─ {step === 3 && <StepReview />}
      └─ Footer: Navigation buttons
```

### State Lifting Pattern
- All state lives in `SetupWizard` parent
- Child components are **functional** (receive props, call callbacks)
- Single `update()` callback for state mutations
- Pure data flow: parent → child → parent

### Multi-Phase Completion
When user clicks "Complete Setup":
1. **Phase 1**: Save configuration (POST /api/setup)
2. **Phase 2**: Install MCP to agents (POST /api/mcp/install) [if MCP mode]
3. **Phase 3**: Install skills (POST /api/mcp/install-skill) [if agents selected]
4. **Phase 4**: Show health check summary

All phases **non-blocking** except Phase 1 (abort on error).

### Auto-Resolution Features
- ✅ Token auto-generated on mount
- ✅ Ports auto-resolved on entering Step AI
- ✅ Port conflicts auto-detected
- ✅ Path autocomplete with debounce
- ✅ Agents auto-populated and pre-selected

### Error Recovery
- Per-agent retry buttons (non-blocking)
- Global error banner with dismiss
- Never loses user input
- Can go backward to fix issues

---

## 🚀 For Developers

### To understand the structure:
1. Read: `ONBOARDING_COMPONENTS_REPORT.md` (sections 1-3)
2. Skim: `ONBOARDING_FLOW_DIAGRAM.md` (state flow + component hierarchy)
3. Reference: `ONBOARDING_QUICK_REFERENCE.md` while coding

### To modify or extend:
1. Check `app/components/setup/types.ts` for existing types
2. Check `app/components/setup/constants.tsx` for step indices
3. Modify corresponding Step component in `app/components/setup/`
4. Update i18n keys in `app/lib/i18n/modules/onboarding.ts`
5. Test in browser: navigate to `/setup` or `/setup?force=1`

### To debug:
Use the "Debugging Tips" section in `ONBOARDING_QUICK_REFERENCE.md`

---

## 📋 Common Questions Answered

**Q: Where are the 3 steps mentioned in the search?**
A: The quick start has **4 steps**, not 3. This is the complete setup wizard.
- Step 0: KB path + template + password
- Step 1: AI provider + ports + token  
- Step 2: Agent connection
- Step 3: Review + complete

**Q: What's the difference between OnboardingView and SetupWizard?**
A: 
- **OnboardingView**: Simple template picker (3 cards), shown when KB is empty
- **SetupWizard**: Full 4-step setup wizard, shown after template selection

**Q: How is state managed?**
A: Lifted into `SetupWizard` parent. Child components are pure (receive `state` + `update` callback).

**Q: What happens during "Complete Setup"?**
A: 4 sequential phases:
1. Save config
2. Install MCP to agents (if MCP mode)
3. Install skills (if agents selected)
4. Show health check

**Q: How does port validation work?**
A: On entering Step AI:
- Auto-checks web port → if occupied, suggests alternative
- Auto-checks MCP port → if occupied, suggests alternative
- Updates state silently
- User sees "Available" or "In Use" badge

**Q: Is translation complete?**
A: Yes! Full English + Chinese support for all UI strings.

---

## 📖 Where to Find Things

| Need | File | Section |
|------|------|---------|
| Component overview | Components report | Section 2 |
| State management details | Components report | Section 4 |
| API endpoints | Components report | Section 5 |
| Visual flow | Flow diagram | Sections 1-2 |
| Component tree | Flow diagram | Section 4 |
| Quick navigation logic | Quick reference | "Navigation Logic" |
| Debugging | Quick reference | "Debugging Tips" |
| File locations | Quick reference | "File Locations" |
| Type definitions | Quick reference | "Types You Need to Know" |
| Modification guide | Quick reference | "Common Modifications" |

---

## 🎓 Learning Path

**Beginner** (10 mins)
1. Read "Overview" in Components Report
2. Skim "Quick Facts" above
3. Look at Entry Point diagram in Flow Diagram

**Intermediate** (30 mins)
1. Read Sections 1-3 of Components Report
2. Review State Flow diagram
3. Check Types in Quick Reference

**Advanced** (1 hour+)
1. Read entire Components Report
2. Study Flow Diagram in detail
3. Review source files:
   - `SetupWizard.tsx` - main logic
   - `types.ts` - data structures
   - `constants.tsx` - configuration

---

## 📞 Quick Support

**File to check for...**
- State structure → `types.ts`
- Step indices → `constants.tsx`  
- Main logic → `SetupWizard.tsx`
- i18n strings → `onboarding.ts`
- Step implementations → `StepX.tsx` files
- Navigation UI → `StepDots.tsx`

**To make changes:**
1. **Add state field** → Update `SetupState` in types.ts + initialize in SetupWizard
2. **Add new step** → Create StepX.tsx + update constants + add rendering
3. **Change validation** → Modify `canNext()` in SetupWizard
4. **Change i18n** → Update both `onboardingEn` and `onboardingZh`

---

Generated: 2026-04-10
