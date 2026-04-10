# MindOS Search Workflow - Quick Reference Card

## TL;DR: How Search Actually Works

```
User Question
    ↓
System Prompt (SKILL.md): "Does this imply stored context exists?"
    ↓ YES
AI calls: search("authentication decision")
    ↓
1. Check/build inverted index (~file tokens → file paths)
2. Tokenize query → ["authentication", "decision"]
3. Find candidate files (files matching ANY token via index)
4. Score each candidate with BM25 (rare terms = higher score)
5. Extract snippet around first match
6. Sort by score, return top 20
    ↓
Tool returns: "- **Decisions/auth.md**: ...JWT decision..."
    ↓
AI reads full file
    ↓
AI answers: "Based on Decisions/auth.md, you decided..."
```

---

## System Prompt Rules (SKILL.md)

### When to Search (Automatic Triggers)
- ✅ User asks about past decisions → search FIRST (don't wait for explicit mention)
- ✅ User mentions "remember," "check," "lookup," "decide" → implies context exists
- ✅ User says "save this" → record after completing work
- ❌ Don't wait for explicit "search MindOS" — be proactive

### How to Search (The NEVER Rules)
- ❌ NEVER search with single keyword → use 2-4 synonyms
  - Example: search("bug") + search("defect") + search("issue")
- ❌ NEVER skip bootstrapping → always `list_files` first
- ❌ NEVER assume directory names → infer from actual tree
- ✅ DO: Fire parallel multi-term searches

---

## Search Tools Available

| Tool | Purpose | Input |
|------|---------|-------|
| `search("query")` | Full-text BM25 | String query |
| `list_files(path?, depth?)` | Browse tree | Optional path & max depth |
| `read_file(path)` | Load full file | File path |
| `get_recent(limit?)` | Recently modified | Optional limit (default 10) |
| `get_backlinks(path)` | Files referencing this | File path |

---

## BM25 Scoring Formula

```
BM25(doc) = Σ IDF(term) × (TF(term) × 2.2) / (TF(term) + 1.2 × (0.25 + 0.75 × docLen/avgLen))
```

**In plain English:**
- Rare terms score HIGH (low doc frequency)
- Frequent terms score LOW (high doc frequency)  
- Shorter documents rank higher (length normalized)
- Multiple query terms: scores summed per document

---

## Search Index Details

**Where:** `~/.mindos/search-index.json` (persisted)

**What it contains:**
- Token → Set<filePath> (inverted index)
- DocLengths (for BM25)
- File counts & timestamps

**When rebuilt:**
- First search: lazy rebuild from scratch, O(N·T)
- After each file write: incremental update, O(tokens-in-file)
- Cold start: loads from disk (fast)
- Staleness check: file count & mtime sampling

**CJK Support:**
- Chinese: `Intl.Segmenter` for proper word boundaries
- Fallback: bigrams + unigrams if unavailable
- Both strategies applied to mixed text

---

## Index Performance

| Operation | Speed | Why |
|-----------|-------|-----|
| Full rebuild | Lazy (once) | O(N·T), paid on first search |
| Index lookup | O(log T) | Hash map per token |
| Candidate narrow | Fast | Inverted index shrinks search space |
| BM25 scoring | O(C·Q·M) | C = candidates ≪ N (files) |
| **Total per search** | **Fast** | Index makes C << N |

---

## File Tree Navigation

**list_files** structure:
- Directories first, then files (alphabetical)
- Ignored: `.git`, `node_modules`, `.next`, `app`, `.DS_Store`, `mcp`
- Extensions: `.md`, `.csv` only
- Depth: shows "... (N items)" beyond max depth (default 3)

**collectAllFiles** (internal):
- Flat list of all file paths
- Used by search as candidate base before index narrows

---

## Decision Tree (Read vs Write)

```
User asks about something
    ↓
Is it lookup/summarize/quote?
    ├─ YES → [READ-ONLY]
    │       • search → read → answer
    │       • cite file path
    │       • no writes
    │
    ├─ NO: Is it save/record/update?
    │      ├─ YES → [WRITE]
    │      │       • create/edit files
    │      │       • sync backlinks
    │      │       • sync READMEs
    │      │
    │      └─ NO → [AMBIGUOUS]
    │             • ASK user
    │             • propose 2-3 options
    │
    └─ END
```

---

## Proactive Behavior (3 Rules)

**Rule 1: Search before answering**
- Question implies stored context (past decisions, previous discussions)?
- → Search MindOS FIRST, even if user didn't explicitly ask

**Rule 2: Offer to save after valuable work**
- Bug fixed, decision made, lesson learned?
- → Offer to save to MindOS

**Rule 3: Suggest persistence for long conversations**
- Multi-topic conversation running long?
- → Suggest persisting key decisions and context

---

## Example: "What did we decide about authentication?"

```
STEP 1: Recognize trigger
└─ "decide" + "about" = context query → search first

STEP 2: Fire multi-term searches (parallel):
├─ search("authentication decision")
├─ search("auth decision")
└─ search("认证 决策")  [Chinese variant]

STEP 3: For each search:
├─ Tokenize → ["authentication", "decision"]
├─ Inverted index lookup → candidate files
├─ BM25 score each
├─ Sort by score
└─ Extract snippets

STEP 4: Results look like:
└─ "- **Decisions/Architecture/auth.md**: ...JWT token decision...
     ...OAuth2 for third-party..."

STEP 5: AI reads full file

STEP 6: Answer with citation:
└─ "Based on Decisions/Architecture/auth.md, you decided to 
      use JWT tokens for stateless scaling..."
```

---

## What NOT to Do

| ❌ Wrong | ✅ Right |
|---------|---------|
| `search("bug")` (alone) | `search("bug")` + `search("defect")` + `search("issue")` |
| Assume "Projects/Foo/" exists | Run `list_files` first, check actual structure |
| Full-file overwrite for edits | Use `update_section` or `insert_after_heading` |
| Modify INSTRUCTION.md without asking | Always confirm governance file changes |
| Create file without checking siblings | Read 1-2 files to learn local style first |
| Leave orphan references after rename | Check backlinks and update all references |

---

## Key Files (Source Code)

| File | Purpose |
|------|---------|
| `skills/mindos/SKILL.md` | System prompt & rules |
| `lib/core/search.ts` | BM25 algorithm & ranking |
| `lib/core/search-index.ts` | Inverted index & persistence |
| `lib/core/tree.ts` | File tree building |
| `lib/agent/tools.ts` | Tool definitions (search, list_files, etc.) |
| `lib/fs.ts` | Cache & file watcher |

---

## Index Persistence Location

```
~/.mindos/search-index.json

JSON structure:
{
  "version": 1,
  "builtForRoot": "/path/to/mindroot",
  "fileCount": 50,
  "totalChars": 500000,
  "timestamp": 1234567890,
  "docLengths": { "path1": 1000, "path2": 2000, ... },
  "invertedIndex": {
    "authentication": ["auth.md", "oauth.md"],
    "jwt": ["auth.md"],
    ...
  }
}
```

---

## Staleness Validation

Before using persisted index, check:
1. ✓ Version = 1
2. ✓ builtForRoot matches current mindRoot
3. ✓ File count on disk = indexed file count (detects adds/deletes)
4. ✓ Sampled files' mtime ≤ index timestamp (detects modifications)

If ANY check fails → rebuild from scratch

---

## Incremental Index Updates (Fast)

After file operations:

| Operation | Function | Complexity |
|-----------|----------|-----------|
| Write | `updateSearchIndexFile(path)` | O(tokens-in-file) |
| Create | `addSearchIndexFile(path)` | O(tokens-in-file) |
| Delete | `removeSearchIndexFile(path)` | O(tokens-in-file) |
| Rename | `removeFile` + `addFile` | O(tokens-in-file) |

All **NOT full rebuild** (O(all-files)) — very fast!

Debounced write: 5 seconds after last modification

---

## Search Filters (Advanced)

```typescript
searchFiles(mindRoot, query, {
  limit: 50,                          // Top N results (default 20)
  scope: "Projects/Backend/",         // Directory prefix filter
  file_type: "md",                    // Extension filter
  modified_after: "2024-01-01T00:00:00Z"  // Date filter
})
```

---

## Common Patterns

**Bootstrap first, then search:**
```
list_files()                    // Understand structure
→ search("topic")              // Find relevant files
→ read_file(best_result_path)  // Load content
→ Answer with citations
```

**Multi-term search (synonyms):**
```
search("authentication")
+ search("auth")
+ search("login")
= Better coverage
```

**Scoped search:**
```
search("bug", { scope: "Projects/Frontend/" })
```

