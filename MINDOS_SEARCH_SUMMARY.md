# MindOS Search Workflow - Complete Analysis Summary

## Executive Summary

I've thoroughly analyzed the MindOS search and retrieval system and created a comprehensive documentation package. Here's what I found:

### Key Discovery: **BOTH Directory-Based AND Tool-Based Search**

MindOS uses a **hybrid approach**:
1. **Tool-based search** (primary): `search()` tool with BM25 ranking via inverted index
2. **Directory-based navigation** (secondary): `list_files()` tool for tree browsing

The system prompt (SKILL.md) instructs the AI to be **proactive** — search MindOS FIRST when a question implies stored context exists, even without explicit mention.

---

## The Three Documents Created

### 1. **MINDOS_SEARCH_ANALYSIS.md** (11 Parts, ~5,000 words)
**Comprehensive technical deep-dive**

Contains:
- Part 1: System Prompt & Proactive Behavior rules
- Part 2: Tool-based search architecture
- Part 3: BM25 search algorithm implementation
- Part 4: Directory-based navigation
- Part 5: Search options & filtering
- Part 6: MCP tools integration
- Part 7: Decision tree & rules
- Part 8: Performance characteristics
- Part 9: Frontend Fuse.js fuzzy search
- Part 10: Complete workflow example
- Part 11: System prompt rules summary

**Best for:** Understanding HOW and WHY the system works

### 2. **MINDOS_SEARCH_DIAGRAM.txt** (ASCII Architecture Diagram)
**Visual flowchart of the entire system**

Shows:
- System prompt layer (proactive behavior triggers)
- Decision tree (read vs write)
- AI tool invocation layer
- Search tool pipeline (6 execution steps)
- Search index architecture
- Incremental updates
- File tree navigation
- Performance summary

**Best for:** Quick visual understanding of data flow

### 3. **MINDOS_SEARCH_QUICK_REFERENCE.md** (Cheat Sheet)
**Practical quick reference**

Contains:
- TL;DR workflow
- System prompt rules
- Search tools table
- BM25 formula explained
- Index details
- Performance table
- Decision tree
- Proactive behavior rules
- Common patterns
- What NOT to do

**Best for:** Quick lookup during implementation

---

## 15 Key Findings

### 1. **System Prompt is the Heart of Search**
- File: `skills/mindos/SKILL.md`
- Lines 21-26: Proactive behavior instruction
- The AI is told to search FIRST when questions imply stored context
- NOT directory-based browsing — it's AI-driven tool usage

### 2. **Triggering is Implicit, Not Explicit**
- English triggers: "decide," "remember," "check," "discuss," "lookup"
- Chinese triggers: 帮我记下来, 搜一下笔记, 查一下之前的
- **But most importantly**: AI recognizes IMPLIED triggers ("What did we decide?")

### 3. **BM25 Ranking Algorithm**
- Source: `lib/core/search.ts`, lines 84-101
- Formula: `BM25 = Σ IDF(term) × (TF×(K1+1))/(TF+K1×(1-B+B×L/avgL))`
- K1=1.2 (saturation), B=0.75 (normalization)
- Rare terms score HIGH, frequent terms score LOW
- Multi-term: scores summed per document

### 4. **Inverted Index for Speed**
- Source: `lib/core/search-index.ts`
- Token → Set<filePath> mapping
- Dramatically narrows candidate set: C candidates ≪ N total files
- Persisted to `~/.mindos/search-index.json`

### 5. **Lazy Index Building**
- NOT built on startup
- Built on first search (one-time O(N·T) cost)
- Loaded from disk on cold start (fast path)
- Staleness validated via file count & mtime sampling

### 6. **Incremental Updates (Not Full Rebuilds)**
- File write: `updateSearchIndexFile()` = O(tokens-in-file)
- File create: `addSearchIndexFile()` = O(tokens-in-file)
- File delete: `removeSearchIndexFile()` = O(tokens-in-file)
- NOT O(all-files) — huge optimization

### 7. **CJK Support via Intl.Segmenter**
- Source: `lib/core/search-index.ts`, lines 10-66
- Uses `Intl.Segmenter('zh', {granularity: 'word'})`
- Proper word boundaries for Chinese text
- Fallback: bigrams + unigrams if unavailable
- Also indexes individual CJK unigrams for single-char queries

### 8. **Directory Navigation is Separate**
- Source: `lib/core/tree.ts`
- `getFileTree()` — recursive traversal → tree structure
- `collectAllFiles()` — flat list of all file paths
- Filters: `.git`, `node_modules`, `.next`, `app`, `.DS_Store`, `mcp`
- Includes: `.md`, `.csv` only
- Sorts: directories first, then alphabetical

### 9. **Two Coexisting Search Implementations**
- **Core search**: BM25 (deterministic, used by API/MCP)
- **App search**: Fuse.js fuzzy matching (used by browser ⌘K)
- Different use cases, intentionally decoupled

### 10. **The "NEVER" Rules**
- NEVER search with single keyword → use 2-4 synonyms
- NEVER skip bootstrapping → always `list_files` first
- NEVER assume directory names → infer from actual tree
- NEVER use full-file overwrite for small edits → use `update_section`
- NEVER modify INSTRUCTION.md without confirmation
- NEVER create file without checking siblings

### 11. **Decision Tree Routing**
- Lookup/summarize/quote? → READ-ONLY (search → read → cite)
- Save/record/update? → WRITE (create/edit → sync backlinks)
- Ambiguous? → ASK (propose 2-3 options)

### 12. **Multi-Term Query Strategy**
- Query tokenized: "authentication bug fix" → ["authentication", "bug", "fix"]
- Latin: split non-alpha, filter <2 chars, lowercase
- CJK: proper segmentation or fallback bigrams
- UNION semantics: files matching ANY term are candidates
- Then: per-term BM25 scores summed

### 13. **Performance Characteristics**
- Index rebuild: O(N·T), lazy (once)
- Index lookup: O(log T), hash map
- Candidate narrow: O(C), C ≪ N
- BM25 scoring: O(C·Q·M), very fast
- Total: O(C·Q·M) with C typically 50-100 files

### 14. **Cache Invalidation Strategy**
- File system watcher with 500ms debounce
- Tree cache TTL: 5 seconds
- Search index: incremental updates
- On write: mark for 5-second debounced persist

### 15. **MCP Tool Integration**
- Tools exposed via `lib/agent/tools.ts`
- Primary: `search()` tool
- Supporting: `list_files()`, `read_file()`, `get_recent()`, `get_backlinks()`
- MCP tools auto-injected by pi-mcp-adapter extension

---

## How Search ACTUALLY Works (Step-by-Step)

```
User: "What did we decide about authentication?"
    ↓
AI (per SKILL.md): "This implies stored context → SEARCH FIRST"
    ↓
AI calls: search("authentication decision")
    ↓
1. Check if index exists for this mindRoot
2. If not in memory, try load from ~/.mindos/search-index.json
3. If load fails or stale, rebuild (scan all files, tokenize)
    ↓
4. Tokenize query: "authentication decision" → ["authentication", "decision"]
    ↓
5. Inverted index lookup: find all files containing ANY token
   - Result: C candidates (maybe 50-100 files instead of 10,000)
    ↓
6. For each candidate file:
   - Read content
   - Count occurrences of each term (TF)
   - Compute IDF for each term
   - Compute BM25 score = Σ(IDF × normalized TF)
    ↓
7. Sort by BM25 score (descending)
    ↓
8. Extract snippet around first match
    ↓
9. Return top 20: [{path, snippet, score}, ...]
    ↓
Tool returns:
"- **Decisions/Architecture/authentication.md**: ...We decided 
 to use JWT tokens because stateless scaling is better than 
 session storage. OAuth2 for third-party integration..."
    ↓
AI reads full file with read_file()
    ↓
AI answers with citation:
"Based on Decisions/Architecture/authentication.md, you decided 
 to use JWT tokens for stateless scaling..."
```

---

## Most Important Code Files

| File | Lines | Purpose |
|------|-------|---------|
| `skills/mindos/SKILL.md` | 1-225 | System prompt, proactive behavior, rules |
| `lib/core/search.ts` | 1-274 | BM25 ranking algorithm |
| `lib/core/search-index.ts` | 1-469 | Inverted index, persistence, incremental updates |
| `lib/core/tree.ts` | 1-100+ | File tree building, directory navigation |
| `lib/agent/tools.ts` | 268-716 | Tool definitions (search, list_files, read_file, etc.) |
| `lib/fs.ts` | 1-200+ | Cache management, file watcher, invalidation |

---

## Critical Insights

### Insight 1: "Proactive Search" Requires AI Understanding
The system doesn't have hard-coded keywords to trigger search. Instead, the AI reads SKILL.md and uses judgment:
- "What did we decide?" → implies context exists → search first
- "I don't remember..." → implies past knowledge → search first
- This is WHY it's so effective — AI can understand nuance

### Insight 2: The 2-4 Synonym Rule
SKILL.md explicitly states: "NEVER search with a single keyword"
The recommended practice is to fire multiple searches:
- `search("bug")` + `search("defect")` + `search("issue")`
- `search("auth")` + `search("authentication")`
- This maximizes recall without hurting precision (BM25 ranks well)

### Insight 3: Index is Lazy but Validated
- Built on first search (fast on subsequent searches)
- Persisted to disk (fast cold start)
- Validated for staleness (file count & mtime sampling)
- If ANY check fails → rebuild (safe fallback)

### Insight 4: Incremental Updates Enable Real-Time
- After file write: O(tokens-in-file) update, not O(all-files) rebuild
- 5-second debounced persist to disk
- File watcher invalidates cache immediately (500ms debounce)
- Result: search reflects recent changes very quickly

### Insight 5: BM25 is Deterministic
- Same query always produces same ranking (no ML randomness)
- Rare terms dominate (specialization helps)
- Document length normalized (prevents bias to long docs)
- Perfect for consistent AI behavior

---

## What I Did NOT Find

❌ **No:** Database backend (everything is file-based)
❌ **No:** ML or neural ranking (BM25 is pure IR theory)
❌ **No:** Distributed index (single process in-memory)
❌ **No:** Real-time streaming updates (debounced 5-second writes)
❌ **No:** Backup/recovery beyond 30-day trash

---

## How to Use This Documentation

**If you need to...**

| Goal | Document | Section |
|------|----------|---------|
| Understand the big picture | Analysis | Executive Summary |
| See data flow visually | Diagram | Full diagram |
| Quick lookup while coding | Quick Reference | Any section |
| Implement a similar system | Analysis | Parts 3-4 |
| Debug slow searches | Analysis | Part 8 |
| Add Chinese support | Analysis | Part 3 / Search-index.ts |
| Understand proactive behavior | Quick Reference | "When to Search" |
| Optimize performance | Analysis | Part 8 + Performance summary |

---

## Files Generated

```
/data/home/geminitwang/code/sop_note/
├── MINDOS_SEARCH_ANALYSIS.md           (~5,000 words, 11 parts)
├── MINDOS_SEARCH_DIAGRAM.txt           (ASCII architecture)
└── MINDOS_SEARCH_QUICK_REFERENCE.md    (Cheat sheet)
```

All three are complementary. Start with the Diagram, then Quick Reference, then Analysis for details.

