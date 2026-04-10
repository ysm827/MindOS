# MindOS Search & Retrieval Workflow - Complete Analysis

## Executive Summary

MindOS uses a **multi-layered search architecture** combining:
1. **Proactive behavior** guided by the SKILL.md system prompt
2. **BM25-based full-text search** with inverted index acceleration
3. **Directory-based tree navigation** with tool-based queries
4. **Persistent search index** for performance optimization
5. **Multiple search strategies** (CLI, MCP tools, frontend fuzzy search)

---

## Part 1: System Prompt & Proactive Behavior

### Key Instruction in SKILL.md

The system prompt in `skills/mindos/SKILL.md` lines 21-26 instructs the AI:

```markdown
Proactive behavior — do not wait for the user to mention MindOS:
(1) When user's question implies stored context may exist (past decisions, 
    previous discussions, meeting records) → search MindOS first, 
    even if they don't explicitly mention it.
(2) After completing valuable work (bug fixed, decision made, lesson learned, 
    architecture chosen, meeting summarized) → offer to save it to MindOS 
    for future reference.
(3) After a long or multi-topic conversation → suggest persisting key 
    decisions and context.
```

### Trigger Keywords (English)

Lines 12-16 list explicit triggers:
- "save or record anything"
- "search for prior notes or context"
- "update or edit a file"
- "organize notes"
- "run a workflow or SOP"
- "capture decisions"
- "append rows to a table or CSV"
- "hand off context to another agent"
- "check if something was discussed before"
- "look up a past decision"
- "distill lessons learned"
- "prepare context for a meeting"

### Trigger Keywords (Chinese)

Lines 17-19 also support Chinese triggers:
- 帮我记下来 (help me record)
- 搜一下笔记 (search notes)
- 查一下之前的 (check what was before)
- 有没有相关笔记 (are there related notes?)

---

## Part 2: Tool-Based Search Architecture

### Available Search Tools (from `lib/agent/tools.ts`)

**Primary Search Tool:**
```typescript
{
  name: 'search',
  label: 'Search',
  description: 'Full-text search across all files in the knowledge base. 
                Returns matching files with context snippets.',
  parameters: { query: string },
  execute: searchFiles(params.query)
}
```

**Supporting Tools:**
- `list_files` — Browse directory structure as tree
- `read_file` — Read full file content
- `read_file_chunk` — Read specific lines from a file
- `get_recent` — Get recently modified files
- `get_backlinks` — Find files referencing a given file

### Is it Directory-Based or Tool-Based?

**Answer: BOTH**

1. **Directory-Based:**
   - `list_files` tool uses `getFileTree()` from `lib/core/tree.ts`
   - Returns hierarchical tree structure showing directory structure
   - Supports `depth` parameter to control expansion levels
   - Default depth = 3 levels

2. **Tool-Based (Primary):**
   - `search` tool is the main discovery mechanism
   - Uses full-text search, not directory browsing
   - More efficient for finding content without knowing structure

---

## Part 3: Search Implementation Details

### Search Algorithm (from `lib/core/search.ts`)

**Core Mechanism: BM25 Ranking**

```typescript
export function searchFiles(
  mindRoot: string, 
  query: string, 
  opts: SearchOptions = {}
): SearchResult[]
```

**Execution Steps:**

1. **Index Initialization (Lazy Loading)**
   ```
   if (!searchIndex.isBuiltFor(mindRoot)) {
     // Try loading persisted index from ~/.mindos/search-index.json
     if (!loaded) {
       // Rebuild from scratch — scans all files
       searchIndex.rebuild(mindRoot);
     }
   }
   ```

2. **Query Tokenization**
   ```typescript
   function splitQueryTerms(query: string): string[]
   // Splits on whitespace, deduplicates
   // Example: "authentication bug fix" → ["authentication", "bug", "fix"]
   ```

3. **Candidate File Selection (UNION semantics)**
   - Uses inverted index to find files matching ANY query term
   - Narrows full file list from potentially thousands to dozens
   - If query has 3+ tokens (especially CJK), prunes low-overlap files
   - UNION strategy ensures recall (doesn't miss relevant files)

4. **BM25 Scoring per Document**
   
   **Formula:**
   ```
   BM25_score = Σ(term) IDF(term) × (TF(term) × (K1 + 1)) / 
                (TF(term) + K1 × (1 - B + B × docLength/avgDocLength))
   
   where:
   - IDF = log((N - df + 0.5) / (df + 0.5) + 1)
   - K1 = 1.2 (term frequency saturation)
   - B = 0.75 (document length normalization)
   - N = total documents
   - df = documents containing term
   ```

   **Effect:**
   - Rare terms (low df) score much higher
   - Frequent terms contribute less
   - Shorter documents rank higher for equal term frequency
   - Multi-term queries: scores are summed per document

5. **Snippet Extraction**
   - Builds context around first match
   - Looks for paragraph boundaries (`\n\n`)
   - Falls back to 200-char window if no boundaries
   - Limits snippet size to ~200 chars on each side

6. **Sorting & Truncation**
   - Sort by BM25 score (descending)
   - Return top N results (default: 20)

### Search Index Structure (from `lib/core/search-index.ts`)

**Inverted Index:**
```typescript
class SearchIndex {
  private invertedIndex: Map<string, Set<string>>  // token → file paths
  private docLengths: Map<string, number>          // BM25 statistics
  private fileTokens: Map<string, Set<string>>     // reverse map
  private builtForRoot: string
  private fileCount: number
  private totalChars: number
}
```

**Tokenization Strategy:**

For **Latin/ASCII:**
- Split on non-alphanumeric characters
- Filter tokens < 2 chars
- Lowercase

For **CJK (Chinese):**
- Uses `Intl.Segmenter` with `granularity: 'word'`
- Proper word boundaries (不 bigrams like "知识" → "知" + "识")
- Fallback to bigrams+unigrams if Intl.Segmenter unavailable
- Also indexes individual CJK unigrams for single-char queries

For **Mixed text:**
- Applies both strategies
- Results merged into single token set

**Persistence:**
- Serialized to `~/.mindos/search-index.json`
- Includes version, builtForRoot, fileCount, timestamps
- Staleness checks before load:
  1. Version and root must match
  2. File count on disk must match indexed count
  3. Sampled files' mtime must be older than index timestamp

### Incremental Index Updates

After write operations (`invalidateCacheForFile`, `invalidateCacheForNewFile`):

```typescript
// On file update:
searchIndex.updateFile(mindRoot, filePath)  // O(tokens-in-file)

// On file create:
addSearchIndexFile(mindRoot, filePath)      // O(tokens-in-file)

// On file delete:
removeSearchIndexFile(filePath)             // O(tokens-in-file)
```

**NOT full rebuild** — highly optimized for incremental changes.

---

## Part 4: Directory-Based Navigation

### File Tree Implementation (from `lib/core/tree.ts`)

```typescript
export function getFileTree(
  mindRoot: string,
  dirPath?: string,
  opts: TreeOptions = {}
): FileNode[]
```

**Behavior:**
- Recursive directory traversal
- Filters by ignored directories (`.git`, `node_modules`, `.next`, `app`, `.DS_Store`, `mcp`)
- Only includes `.md`, `.csv` files
- Sorts: directories first, then alphabetical
- Returns tree structure with `children` arrays

**Max Depth Logic:**
- `list_files` tool supports `depth` parameter (default: 3)
- Shows "... (N items)" for directories beyond max depth

### File Collection (All Files Scan)

```typescript
export function collectAllFiles(
  mindRoot: string,
  dirPath?: string,
  opts: TreeOptions = {}
): string[]
```

- Returns flat list of all file paths
- Used by search as initial candidate list before index narrowing
- Respects ignored directories
- Filters system files at root (INSTRUCTION.md, README.md, CONFIG.json, CHANGELOG.md)

---

## Part 5: Search Options & Filtering

### Parameters Supported by `searchFiles()`

```typescript
interface SearchOptions {
  limit?: number;        // Results to return (default 20, max 50)
  scope?: string;        // Directory prefix filter (e.g., "Projects/")
  file_type?: string;    // Filter by extension (default 'all')
  modified_after?: string; // ISO timestamp filter
}
```

### Example Queries:

```typescript
// Basic search
searchFiles(mindRoot, "authentication bug")

// Scoped search
searchFiles(mindRoot, "bug", { scope: "Projects/Backend/" })

// Recent files only
searchFiles(mindRoot, "decision", { 
  modified_after: "2024-01-01T00:00:00Z" 
})

// Specific file type
searchFiles(mindRoot, "SOP", { file_type: "md" })

// Top 50 results
searchFiles(mindRoot, "lesson learned", { limit: 50 })
```

---

## Part 6: MCP Tools Integration

### Tool Registration (from `lib/agent/tools.ts`)

MindOS exposes tools via two channels:

1. **CLI-First (Preferred)**
   ```bash
   mindos search "query"
   mindos file list [path]
   mindos file read <path>
   ```

2. **MCP Tools (Secondary)**
   - MCP tools auto-injected by pi-mcp-adapter extension
   - Self-describing via TypeBox schemas
   - Tool names: `mindos_*` (not implemented here; handled by extension)

### Tool Execution Flow

```
User Question
    ↓
System Prompt (SKILL.md) triggers search decision
    ↓
AI calls search tool with query
    ↓
searchFiles() executes BM25 ranking
    ↓
Index lookup → candidate files → score each → sort → snippet
    ↓
Tool returns: "- **path**: snippet" (markdown formatted)
    ↓
AI reads full files with read_file if needed
    ↓
AI answers with citations
```

---

## Part 7: Decision Tree & Search Rules

### When to Search (from SKILL.md lines 103-132)

```
User request
  │
  ├─ Lookup / summarize / quote?
  │   └─ [Read-only]: search → read → answer with citations
  │
  ├─ Save / record / update?
  │   └─ [Write path]: create/edit files
  │
  └─ Ambiguous?
      └─ ASK user before executing
```

### Search Rules (from SKILL.md lines 78-87)

**Hard Rules:**
- **NEVER search with a single keyword** — Fire 2-4 parallel searches
  - Synonyms: "bug" + "defect" + "issue"
  - Abbreviations: "auth" + "authentication"
  - Chinese/English variants: "知识库" + "knowledge base"

- **NEVER skip reading the KB tree first** — Bootstrap before searching

- **Read before write** — Always read files before modifying them

---

## Part 8: Performance Characteristics

### Search Performance

| Operation | Complexity | Notes |
|-----------|-----------|-------|
| Full rebuild | O(N·T) | N files, T tokens/file; done lazily on first search |
| Index lookup | O(log T) | T unique tokens; one map lookup per query term |
| Candidate narrowing | O(C) | C candidate files from union of token sets |
| BM25 scoring | O(C·Q·M) | C candidates, Q query terms, M match count per term |
| **Total per search** | O(C·Q·M) | C typically << N due to inverted index |

### Memory Usage

- **Inverted index**: ~50-100 bytes per unique token (varies by token length)
- **Doc lengths**: 8 bytes per file (64-bit number)
- **File tokens map**: 2-3x inverted index size for reverse lookups
- Typical: **50-500MB** for 10k-100k files

### Optimization Techniques

1. **Lazy index rebuild** — Only built on first search, not on startup
2. **Persistent index** — Loaded from `~/.mindos/search-index.json` on cold start
3. **Staleness checks** — Invalidate if files changed externally
4. **Incremental updates** — O(tokens-in-file), not O(all-files)
5. **File system watcher** — Real-time cache invalidation (500ms debounce)

---

## Part 9: Frontend Search (Fuse.js)

### Separate Fuzzy Search Path

The app ALSO has a separate fuzzy search for the browser `⌘K` overlay:

```typescript
// From lib/fs.ts — NOT used by MCP/API
// Browser-only fuzzy match via Fuse.js with CJK support
```

**Two coexisting search implementations:**
- **Core search** (here): BM25 literal match + ranking, used by MCP/API/CLI
- **App search**: Fuse.js fuzzy match with CJK support, used by frontend

**Why two?**
- Core search is deterministic and optimized for information retrieval
- Fuse.js provides fuzzy matching for user typos in browser UI
- Decoupling allows independent optimization of each

---

## Part 10: Complete Search Workflow Example

### User: "I don't remember what we decided about authentication"

**Step 1: System Prompt Recognition**
```
SKILL.md: "When user's question implies stored context may exist 
(past decisions, previous discussions, meeting records) → search 
MindOS first, even if they don't explicitly mention it."
→ AI recognizes "what we decided" = search trigger
```

**Step 2: Decision Tree**
```
"don't remember" = Lookup/summarize
→ [Read-only path]: search → read → answer
```

**Step 3: Multi-Term Search Execution**
```
AI calls search with synonyms in parallel:
  search("authentication decision")
  search("auth decision")
  search("认证 决策")  [Chinese variant]
```

**Step 4: BM25 Ranking**
- For each search query:
  - Tokenize: ["authentication", "decision"]
  - Find candidates via inverted index union
  - Read each candidate file
  - Compute BM25: rare "authentication" + "decision" → high score
  - Sort by score
  - Return top 20

**Step 5: Result Presentation**
```
search_result = [
  {
    path: "Decisions/Architecture/authentication.md",
    snippet: "...We decided to use JWT tokens because stateless 
              scaling is better than session storage. OAuth2 for 
              third-party integration...",
    score: 45.2,
    occurrences: 3
  },
  // ... more results
]
```

**Step 6: Citation & Answer**
```
AI reads full authentication.md file
AI answers: "Based on Decisions/Architecture/authentication.md, 
you decided to use JWT tokens because..."
```

---

## Part 11: System Prompt Rules Summary

### From SKILL.md - Core Rules (lines 53-75)

1. **Bootstrap first** — list KB tree before searching
2. **Default read-only** — only write when explicitly asked
3. **Rule precedence**: user instruction > .mindos/user-preferences.md > INSTRUCTION.md > SKILL.md defaults
4. **Multi-file edits need a plan first**
5. **Sync READMEs after structural changes**
6. **Read before write**

### From SKILL.md - Search Rules (lines 78-87)

1. **NEVER search with single keyword** — use 2-4 synonyms
2. **NEVER assume directory names** — bootstrap tree first
3. **NEVER use full-file overwrite for small edits** — use edit-section
4. **NEVER modify INSTRUCTION.md/README.md without confirmation**
5. **NEVER create file without checking siblings** — learn local style
6. **NEVER leave orphan references** — update backlinks after moves

---

## Summary: How Search Works

| Aspect | Answer |
|--------|--------|
| **Trigger** | System prompt (SKILL.md) + explicit user request |
| **Search Type** | Tool-based full-text BM25, NOT directory browsing |
| **Mechanism** | Inverted index + BM25 scoring + snippet extraction |
| **Index** | Lazy-built on first search, persisted to `~/.mindos/search-index.json` |
| **Performance** | O(C·Q·M) where C << N due to index |
| **Updates** | Incremental O(tokens-in-file) not full rebuild |
| **Directory Navigation** | Via `list_files` tool, separate from search |
| **Multi-term** | Query split into terms, scored separately, summed |
| **CJK Support** | Intl.Segmenter for word boundaries, fallback to bigrams |
| **Proactive** | AI searches before answering questions implying stored context |

