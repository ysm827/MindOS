# MindOS Onboarding System - Documentation Index

## 📚 4 Documentation Files

### 📖 START HERE
**→ ONBOARDING_README.md** (Overview + Getting Started)
- 📋 What documentation exists
- 🎯 Quick facts and highlights
- 🔍 Key insights and architecture
- 🚀 For developers (how to modify)
- 📋 Common Q&A
- 🎓 Learning paths (beginner/intermediate/advanced)

---

### 📄 1. ONBOARDING_COMPONENTS_REPORT.md (Comprehensive)
**Use: Deep technical understanding**

Topics:
- ✅ Section 1-2: Overview & OnboardingView (template picker)
- ✅ Section 3-4: SetupWizard architecture & state management
- ✅ Section 5-6: API endpoints & navigation logic
- ✅ Section 7-8: UI components & i18n structure
- ✅ Section 9-11: File structure & rendering logic

**Read time:** 15-20 mins

---

### 📊 2. ONBOARDING_FLOW_DIAGRAM.md (Visual)
**Use: Understanding flows and architecture visually**

Topics:
- ✅ Entry point decision tree
- ✅ 4-step flow (ascii diagrams with details)
- ✅ State flow diagram (hierarchical)
- ✅ Component hierarchy tree
- ✅ Conditional rendering logic
- ✅ Multi-phase completion flow
- ✅ Error handling strategy
- ✅ API call sequence timeline
- ✅ i18n key mapping

**Read time:** 10-15 mins

---

### ⚡ 3. ONBOARDING_QUICK_REFERENCE.md (Developer Reference)
**Use: Quick lookup while coding**

Topics:
- ✅ TL;DR file table
- ✅ 3-vs-4 step clarification
- ✅ SetupState interface
- ✅ All hooks in SetupWizard
- ✅ canNext() validation logic
- ✅ Button rendering
- ✅ API endpoints quick map
- ✅ Component imports
- ✅ i18n keys structure
- ✅ Effect hooks timeline
- ✅ Multi-phase completion flow
- ✅ Rendering decision tree
- ✅ Common modifications guide
- ✅ Debugging tips
- ✅ File locations at a glance
- ✅ Pro tips

**Read time:** 5-10 mins (reference style)

---

## 🗺️ Navigation by Task

### "I want to understand what this component does"
1. Read: ONBOARDING_README.md (Quick Facts section)
2. Skim: ONBOARDING_COMPONENTS_REPORT.md (Section 1-2)
3. Look: ONBOARDING_FLOW_DIAGRAM.md (Entry point diagram)

### "I need to modify the setup wizard"
1. Check: ONBOARDING_QUICK_REFERENCE.md (File locations)
2. Reference: ONBOARDING_QUICK_REFERENCE.md (Common modifications)
3. Read: ONBOARDING_COMPONENTS_REPORT.md (Relevant section)
4. Code: The actual source file

### "Where's the code for feature X?"
→ Use ONBOARDING_QUICK_REFERENCE.md "File Locations at a Glance"

### "I'm debugging something"
→ Use ONBOARDING_QUICK_REFERENCE.md "Debugging Tips"

### "I want deep understanding"
1. Read: ONBOARDING_README.md (full)
2. Read: ONBOARDING_COMPONENTS_REPORT.md (full)
3. Study: ONBOARDING_FLOW_DIAGRAM.md (full)
4. Reference: ONBOARDING_QUICK_REFERENCE.md while reading code

---

## 🎯 By Experience Level

### Beginner (First time looking at this)
1. ONBOARDING_README.md - Overview section
2. ONBOARDING_COMPONENTS_REPORT.md - Section 1-2
3. ONBOARDING_FLOW_DIAGRAM.md - Entry point + 4-step flow diagrams
4. **That's it!** You now understand the basics.

**Time: 15 mins**

---

### Intermediate (Need to modify something)
1. ONBOARDING_README.md - For developers section
2. ONBOARDING_QUICK_REFERENCE.md - Full document
3. ONBOARDING_COMPONENTS_REPORT.md - Sections relevant to your task
4. Source files as needed

**Time: 30 mins**

---

### Advanced (Full deep dive)
1. Read all 4 files completely
2. Study ONBOARDING_FLOW_DIAGRAM.md carefully
3. Review source files in this order:
   - `app/components/setup/types.ts` - Type definitions
   - `app/components/setup/constants.tsx` - Configuration
   - `app/components/SetupWizard.tsx` - Main logic
   - Individual Step files as needed

**Time: 1-2 hours**

---

## 📋 Key Questions & Answers

### Q: How many steps are there?
A: **4 steps** (not 3)
- Step 0: KB configuration
- Step 1: AI configuration  
- Step 2: Agent connection
- Step 3: Review & complete

See: ONBOARDING_QUICK_REFERENCE.md "Finding the 3-Step Quick Start"

---

### Q: What are the main components?
A: Two main flows:
1. **OnboardingView** - Template picker (3 cards)
2. **SetupWizard** - Full 4-step wizard

See: ONBOARDING_COMPONENTS_REPORT.md Sections 1-2

---

### Q: How is state managed?
A: **State lifting pattern**
- SetupWizard holds all state
- Child components are functional
- Single `update()` callback

See: ONBOARDING_COMPONENTS_REPORT.md Section 4

---

### Q: What happens when user clicks Complete Setup?
A: **4 sequential phases**
1. Save config (POST /api/setup)
2. Install agents (POST /api/mcp/install) [if MCP]
3. Install skills (POST /api/mcp/install-skill) [if agents]
4. Show health check

See: ONBOARDING_FLOW_DIAGRAM.md "Multi-Phase Completion Flow"

---

### Q: How do I add a new field to the setup?
A: **3 steps**
1. Add to `SetupState` in `types.ts`
2. Initialize in `SetupWizard.tsx` useState
3. Use in corresponding Step component

See: ONBOARDING_QUICK_REFERENCE.md "Common Modifications"

---

### Q: What's the file structure?
A: 
```
app/components/
├── SetupWizard.tsx (main)
├── OnboardingView.tsx (template picker)
└── setup/
    ├── types.ts (types)
    ├── constants.tsx (config)
    ├── StepKB.tsx (step 0)
    ├── StepAI.tsx (step 1)
    ├── StepAgents.tsx (step 2)
    ├── StepReview.tsx (step 3)
    ├── StepDots.tsx (progress)
    └── index.tsx (re-export)
```

See: ONBOARDING_QUICK_REFERENCE.md "File Locations at a Glance"

---

## 📞 Where to Find Specific Information

| Need | File | Section |
|------|------|---------|
| Overview | README | Quick Facts |
| State structure | Components | Section 2 |
| Step 0 details | Components | Section 3 |
| Step 1 details | Components | Section 3 |
| Step 2 details | Components | Section 3 |
| Step 3 details | Components | Section 3 |
| All state hooks | Quick Ref | State Management |
| Navigation logic | Quick Ref | Navigation Logic |
| API endpoints | Components | Section 5 |
| API timeline | Flow Diagram | API Call Sequence |
| Visual flow | Flow Diagram | 4-Step Flow |
| Error handling | Flow Diagram | Error Handling |
| i18n keys | Quick Ref | i18n Keys |
| Component imports | Quick Ref | Component Imports |
| File locations | Quick Ref | File Locations |
| Debugging tips | Quick Ref | Debugging Tips |
| Modification guide | Quick Ref | Common Modifications |

---

## 🔗 Related Files in Codebase

These source files are referenced in the documentation:

```
app/components/SetupWizard.tsx              ← START HERE
app/components/OnboardingView.tsx
app/components/setup/types.ts               ← IMPORTANT
app/components/setup/constants.tsx          ← IMPORTANT
app/components/setup/StepKB.tsx
app/components/setup/StepAI.tsx
app/components/setup/StepAgents.tsx
app/components/setup/StepReview.tsx
app/components/setup/StepDots.tsx
app/components/setup/StepPorts.tsx
app/app/setup/page.tsx
app/lib/i18n/modules/onboarding.ts          ← i18n
```

---

## ✨ Quick Highlights

- 📁 **11 source files** analyzed
- 🎯 **4-step wizard** (not 3)
- 🔧 **18 state hooks** managed
- 🌐 **Full i18n** (EN + 中文)
- 🔌 **11 API endpoints** used
- 🎨 **Responsive design** (mobile-first)
- ♿ **Accessibility** (ARIA labels, keyboard nav)
- ⚡ **Auto-resolution** (token, ports, agents)

---

## 📝 Notes

- All documentation created on **2026-04-10**
- Based on MindOS `app/` directory analysis
- Covers: onboarding, setup, quick-start, getting-started flows
- Includes: components, state, APIs, i18n, architecture
- English + Chinese terminology provided

---

## 🚀 Next Steps

1. **Choose your learning path** above
2. **Start with appropriate document**
3. **Use quick reference while coding**
4. **Refer back as needed**

Good luck! 🎉

