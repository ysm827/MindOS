---
name: optimize-llm
description: >
  End-to-end audit and optimization of the MindOS LLM pipeline: system prompt, SKILL.md,
  tool definitions, SSE streaming, bootstrap context, and frontend AI interaction layer.
  Combines token measurement, prompt entropy reduction, tool-chain review, quality evaluation,
  and actionable optimization report. Use when: "optimize LLM", "prompt too slow",
  "AI response quality", "token efficiency", "reduce prompt size", "AI organize is slow",
  "improve AI agent", "audit system prompt", "LLM cost", or any task about making the
  MindOS AI features faster, cheaper, or higher quality.
---

# Optimize LLM

Multi-phase audit and optimization workflow for the MindOS LLM pipeline.
Finds waste, fixes prompts, measures quality, and ships improvements.

## Principles

1. **Measure first** — no optimization without a baseline number (tokens, latency, quality score).
2. **Cut before you add** — apply `reducing-entropy` mindset: the best prompt is the shortest one that works.
3. **Mode-specific prompts** — "organize imported files" and "general KB conversation" are different tasks; don't force one prompt to serve both.
4. **Adversarial verification** — every change must be tested against at least 3 real scenarios.
5. **Ship incrementally** — one improvement per commit, measurable delta.

---

## Phase 0: Scope & Baseline

Before anything, understand what the user wants to optimize. Ask:

1. **Which AI feature?** (general chat, AI organize, space init, or all)
2. **What's the pain?** (slow, expensive, low quality, hallucination, wrong tool choice)
3. **Any known bad cases?** (collect specific examples of bad AI behavior)

Then establish baseline metrics:

```
Action: Read and measure the full prompt payload
Files:
  - app/lib/agent/prompt.ts          → AGENT_SYSTEM_PROMPT size
  - app/data/skills/mindos/SKILL.md  → skill context size
  - app/data/skills/mindos-zh/SKILL.md
  - app/app/api/ask/route.ts         → bootstrap assembly logic
  - app/hooks/useAiOrganize.ts       → client-side truncation
  - app/lib/agent/tools.ts           → tool definitions

Output a table:
┌────────────────────────────────┬──────────┬─────────────┐
│ Component                      │ Chars    │ ~Tokens     │
├────────────────────────────────┼──────────┼─────────────┤
│ AGENT_SYSTEM_PROMPT            │ xxxx     │ ~xxxx       │
│ SKILL.md (en/zh)               │ xxxx     │ ~xxxx       │
│ Bootstrap: root INSTRUCTION    │ xxxx     │ ~xxxx       │
│ Bootstrap: root README         │ xxxx     │ ~xxxx       │
│ Bootstrap: root CONFIG.*       │ xxxx     │ ~xxxx       │
│ Bootstrap: target dir context  │ xxxx     │ ~xxxx       │
│ Time context                   │ xxxx     │ ~xxxx       │
│ Uploaded files (max)           │ xxxx     │ ~xxxx       │
│ Tool definitions (count × avg) │ xxxx     │ ~xxxx       │
├────────────────────────────────┼──────────┼─────────────┤
│ TOTAL (worst case)             │ xxxx     │ ~xxxx       │
└────────────────────────────────┴──────────┴─────────────┘
Rule of thumb: 1 token ≈ 4 chars (English), ≈ 2 chars (Chinese)
```

---

## Phase 1: Token Audit

### 1.1 Prompt Decomposition

For each component in the baseline table, answer:

- **Is this always needed?** — If it's only needed for some tasks, it's a candidate for conditional loading.
- **Is this duplicated?** — Check for overlap between `prompt.ts` and `SKILL.md` (common: "read before write", "cite sources").
- **Is this too verbose?** — Apply the `reducing-entropy` test: can the same instruction be said in fewer words?

### 1.2 Tool Description Audit

Read every tool in `tools.ts`. For each:

- Is the `description` concise? (>200 chars is a red flag)
- Are there redundant parameter descriptions that repeat the tool description?
- Are there tools the agent rarely uses that could be lazy-loaded?

### 1.3 Bootstrap Context Audit

Trace the `initContextBlocks` assembly in `route.ts`:

- Which bootstrap files are typically empty or missing? (wasted "failed" log lines)
- Could any be loaded on-demand (agent calls a tool) instead of pre-loaded?
- For organize mode specifically: does the agent actually use `CONFIG.json`? `target_dir` context?

### Output

```
┌──────┬──────┬─────────────────────────────────────────────────┐
│ ID   │ Save │ Finding                                         │
├──────┼──────┼─────────────────────────────────────────────────┤
│ T-1  │ ~500 │ SKILL.md "Tool selection" table duplicates       │
│      │ tok  │ individual tool descriptions                     │
│ T-2  │ ~200 │ prompt.ts rule 3 "Read Before Write" repeated    │
│      │ tok  │ in SKILL.md "NEVER do" section                   │
│ T-3  │ ~800 │ Bootstrap loads CONFIG.json/CONFIG.md even when  │
│      │ tok  │ they don't exist (99% of users)                  │
│ ...  │      │                                                  │
└──────┴──────┴─────────────────────────────────────────────────┘
Total potential savings: ~xxxx tokens
```

---

## Phase 2: Prompt Entropy Reduction

Apply `reducing-entropy` + `prompt-engineering-patterns` principles.

### 2.1 De-duplicate

- List every instruction that appears in both `prompt.ts` and `SKILL.md`.
- Decide ownership: `prompt.ts` owns identity/persona/output format; `SKILL.md` owns KB-specific execution.
- Remove the duplicate from the non-owner.

### 2.2 Conditional Loading

Design a "prompt profile" system:

```
Profile: "organize"
  - AGENT_SYSTEM_PROMPT (full)
  - SKILL.md → only "NEVER do" + "Tool selection" sections (skip thinking framework, SOP, etc.)
  - Bootstrap → skip CONFIG.*, skip target_dir context
  - Uploaded files → include

Profile: "chat"
  - AGENT_SYSTEM_PROMPT (full)
  - SKILL.md (full)
  - Bootstrap (full)
  - Uploaded files → if any

Profile: "space-init"
  - AGENT_SYSTEM_PROMPT (minimal)
  - SKILL.md → only file creation tools
  - Bootstrap → only root README
```

### 2.3 Compress Verbose Instructions

For each instruction block >100 tokens, ask:
- Can this be a one-liner?
- Can this be an example instead of a rule?
- Can this be removed entirely (does the model already know this)?

### 2.4 Implement Changes

- Edit `prompt.ts`, `SKILL.md`, and/or `route.ts` to apply reductions.
- Keep a before/after token count for each change.
- Commit each reduction separately: `refactor(prompt): remove duplicated read-before-write rule (-200 tokens)`

---

## Phase 3: Tool & API Review

Apply `code-review-quality` + `software-architecture` principles.

### 3.1 Tool Chain Efficiency

- Are there tools the agent calls but never needs to? (Check agent logs if available)
- Are there tools that could be combined? (e.g., `read_file` + `read_lines` → one tool with optional line range)
- Are tool error messages helpful enough for the agent to self-correct?

### 3.2 SSE Stream Efficiency

- Is `sanitizeToolArgs` stripping enough? (Large `content` fields going over the wire)
- Is the client doing unnecessary processing on events it doesn't display?
- Could tool_start/tool_end pairs be batched for `batch_create_files`?

### 3.3 Resource Loader Performance

- Is `resourceLoader.reload()` called on every request? Can it be cached?
- How many skill directories are scanned? What's the filesystem I/O cost?
- Can skill scanning be done once at startup and invalidated on settings change?

### 3.4 Client-Side Optimization

- `CLIENT_TRUNCATE_CHARS = 20_000` per file, max 8 files = 160k chars worst case. Is this reasonable?
- Could a total-budget approach work better? (e.g., 50k chars total, divided across files)
- Is the client sending content the server will re-truncate anyway? (Double truncation)

---

## Phase 4: Quality Evaluation

Apply `prompt-engineering-patterns` eval methodology.

### 4.1 Define Eval Scenarios

Create 5-8 test scenarios covering the main AI use cases:

| # | Scenario | Input | Expected Behavior |
|---|----------|-------|-------------------|
| 1 | Single file organize | 1 PDF resume | Creates 1-2 notes in correct space |
| 2 | Multi-file organize | 3 markdown files | Routes to different spaces correctly |
| 3 | Simple KB question | "What are my projects?" | Answers from KB, cites files |
| 4 | Edit existing note | "Add X to my TODO" | Uses minimal edit, not full rewrite |
| 5 | Ambiguous request | "Help me with this" | Asks clarification, doesn't hallucinate |
| 6 | Large file organize | 1 file >15k chars | Handles truncation gracefully |
| 7 | Empty KB | Any organize request | Creates sensible structure |
| 8 | Wrong tool choice | Lookup task | Does NOT write to KB |

### 4.2 Run Before/After

For each optimization applied in Phase 2-3:
- Run the eval scenarios (or a representative subset) against the old prompt and the new prompt.
- Compare: response quality, tool call count, total tokens used, latency.

### 4.3 Quality Scoring

Rate each response on:
- **Correctness** (0-10): Did it do the right thing?
- **Efficiency** (0-10): Minimal tool calls? No unnecessary reads?
- **Tone** (0-10): Matches user language? No preamble fluff?

```
┌──────────────┬────────┬────────┬────────┐
│ Scenario     │ Before │ After  │ Delta  │
├──────────────┼────────┼────────┼────────┤
│ 1. Single    │ 7/10   │ 9/10   │ +2     │
│ 2. Multi     │ 6/10   │ 8/10   │ +2     │
│ ...          │        │        │        │
├──────────────┼────────┼────────┼────────┤
│ Average      │ 6.5    │ 8.2    │ +1.7   │
└──────────────┴────────┴────────┴────────┘
```

---

## Phase 5: Report & Ship

### 5.1 Optimization Report

```
═══════════════════════════════════════════
  LLM Pipeline Optimization Report
  Date: <date>
═══════════════════════════════════════════

Token Budget:
  Before: ~xxxx tokens (worst case)
  After:  ~xxxx tokens
  Saved:  ~xxxx tokens (xx%)

Latency Impact:
  Estimated TTFT reduction: ~xx%
  (fewer input tokens → faster prefill)

Quality:
  Eval score: x.x/10 → y.y/10 (+z.z)

Changes Applied:
┌──────┬──────┬──────────────────────────────┐
│ ID   │ Save │ Change                       │
├──────┼──────┼──────────────────────────────┤
│ T-1  │ 500  │ De-duped tool selection table │
│ T-2  │ 200  │ Removed repeated rule         │
│ ...  │      │                               │
└──────┴──────┴──────────────────────────────┘

Remaining Opportunities:
  - [ ] Conditional prompt profiles (organize vs chat)
  - [ ] Resource loader caching
  - [ ] ...
```

### 5.2 Update Documentation

- `wiki/85-backlog.md` — mark completed items, add remaining opportunities
- `wiki/80-known-pitfalls.md` — record any new pitfalls discovered
- `wiki/90-changelog.md` — if releasing, add entry

### 5.3 Commit

Follow project conventions:
- `refactor(prompt):` for prompt changes
- `perf(api):` for API/streaming optimizations
- `fix(agent):` for quality fixes

---

## Skill Dependencies

```
optimize-llm
├── reducing-entropy           → Phase 2: prompt compression mindset
├── prompt-engineering-patterns → Phase 2: prompt design + Phase 4: eval methodology
├── cost-aware-llm-pipeline    → Phase 1: token costing + model routing
├── code-review-quality        → Phase 3: tool & API code review
├── software-architecture      → Phase 3: caching & structural decisions
├── refactoring-patterns       → Phase 2-3: safe code transformations
└── mindos-mcp-skill-sync      → Phase 5: ensure App/MCP/KB stay in sync
```

## Key Files

```
app/lib/agent/prompt.ts          # System prompt (identity, persona, rules)
app/data/skills/mindos/SKILL.md  # English skill (KB operation rules)
app/data/skills/mindos-zh/SKILL.md # Chinese skill
app/app/api/ask/route.ts         # Request handler: prompt assembly + SSE stream
app/lib/agent/tools.ts           # Tool definitions for the agent
app/hooks/useAiOrganize.ts       # Client: AI organize hook (truncation, SSE parsing)
app/components/OrganizeToast.tsx  # Client: organize progress UI
app/lib/i18n-en.ts               # Prompt templates (digestPrompt*)
app/lib/i18n-zh.ts               # Chinese prompt templates
```
