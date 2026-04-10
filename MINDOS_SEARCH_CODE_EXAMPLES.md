# MindOS Search - Code Examples & Issues

## Issue #1: CJK Tokenization Mismatch

### The Problem

**In search-index.ts** (line 12):
```typescript
const zhSegmenter = new Intl.Segmenter('zh', { granularity: 'word' });
```

This creates word-level tokens for indexing.

**In search.ts** (lines 208-212):
```typescript
for (const term of queryTerms) {
  if (lower.includes(term)) {  // ← SUBSTRING MATCH!
    termDf.set(term, (termDf.get(term) ?? 0) + 1);
  }
}
```

This counts document frequency using substring matching, NOT the index's word tokenization.

### Concrete Example

Suppose your KB has these documents:

```
doc1.md: "机器学习系统"
doc2.md: "知识管理"
doc3.md: "机制改革"
```

**Index Tokenization** (via Intl.Segmenter):
- doc1: ["机器", "学习", "系统", "机", "器", "学", "习", "系", "统"]
- doc2: ["知识", "管理", "知", "识", "管", "理"]
- doc3: ["机制", "改革", "机", "制", "改", "革"]

**Query**: "机器学习" (machine learning)

Tokens from query: ["机器", "学习", "机", "器", "学", "习"]

**Pre-scan document frequency** (substring match in BM25):
```typescript
// For term "机":
doc1.md.toLowerCase().includes("机") → YES (from "机器")
doc3.md.toLowerCase().includes("机") → YES (from "机制")
df("机") = 2

// But index says:
// "机" appears in 3 files (correct: doc1, doc2, doc3)
// ← MISMATCH!
```

**Result**: IDF("机") is underestimated, files with "机制" rank too high.

### The Fix

**Change search.ts line 209**:
```typescript
// OLD:
if (lower.includes(term)) {

// NEW: Use the same tokenization as the index
const tokens = tokenize(content.toLowerCase());
if (tokens.has(term)) {
```

This ensures df is calculated using the same tokenization as the index.

---

## Issue #2: CJK Bigram Explosion

### The Problem

In search-index.ts, CJK tokenization produces both words AND unigrams:

```typescript
for (const { segment, isWordLike } of zhSegmenter.segment(lower)) {
  if (!isWordLike) continue;
  tokens.add(segment.trim());        // ← Add word
  // Also add individual CJK characters as unigrams
  for (const ch of segment) {
    if (CJK_CHAR_REGEX.test(ch)) tokens.add(ch);  // ← Add chars
  }
}
```

### Concrete Example

Query: "机器学习" (machine learning, 4 characters)

```
Intl.Segmenter tokenizes as:
  words: ["机器", "学习"]

With unigrams added:
  all tokens: ["机器", "学习", "机", "器", "学", "习"]
              ↑ 6 tokens total
```

Then `getCandidatesUnion` logic (search-index.ts, lines 314-322):

```typescript
const tokenCount = tokens.size;  // 6
if (tokenCount >= 3) {
  const threshold = Math.max(1, Math.floor(tokenCount / 2));  // floor(6/2) = 3
  const filtered = [...hitCount.entries()]
    .filter(([, count]) => count >= threshold)  // Must match ≥3 tokens
    .map(([path]) => path);
  if (filtered.length > 0) return filtered;
}
```

**Problem**: In a 500-document KB where individual characters "机", "器", "学", "习" appear frequently:
- Many documents match 1-2 characters
- Only documents with both "机器" AND "学习" match all 6 tokens
- But after pruning (threshold=3), most docs still match ≥3 tokens
- Candidates set is still huge

**Example**:
```
- doc1: "机械部门" → matches ["机", "械", ...] ≥ 3 tokens → INCLUDED
- doc2: "学生手册" → matches ["学", "生", ...] ≥ 3 tokens → INCLUDED
- doc3: "学习系统" → matches ["学", "习", "系", "统"] = 4 tokens → INCLUDED
```

All get included even though only doc3 is relevant!

### The Fix

**Option 1: Only emit word-level tokens, not unigrams**
```typescript
// In search-index.ts, remove the unigram emission:
if (zhSegmenter) {
  for (const { segment, isWordLike } of zhSegmenter.segment(lower)) {
    if (!isWordLike) continue;
    tokens.add(segment.trim());
    // REMOVE THIS:
    // for (const ch of segment) {
    //   if (CJK_CHAR_REGEX.test(ch)) tokens.add(ch);
    // }
  }
} else {
  // Fallback: bigrams + unigrams (as-is)
}
```

**Option 2: Only emit unigrams for single-character queries**
```typescript
// In search-index.ts:
if (zhSegmenter) {
  for (const { segment, isWordLike } of zhSegmenter.segment(lower)) {
    if (!isWordLike) continue;
    tokens.add(segment.trim());
    // Only add unigrams if query is single character
    if (query.length === 1) {
      for (const ch of segment) {
        if (CJK_CHAR_REGEX.test(ch)) tokens.add(ch);
      }
    }
  }
}
```

---

## Issue #3: UNION vs INTERSECTION

### The Problem

`getCandidatesUnion` returns files matching ANY token:

```typescript
// search-index.ts, lines 302-310
for (const token of tokens) {
  const set = this.invertedIndex.get(token);
  if (set) {
    for (const filePath of set) {
      hitCount.set(filePath, (hitCount.get(filePath) ?? 0) + 1);
    }
  }
}
// Returns all files with ≥1 matching token
return [...hitCount.keys()];
```

**But `getCandidates` exists** (never called):

```typescript
// search-index.ts, lines 349-366
// This does INTERSECTION (AND semantics)
let result: Set<string> | null = null;
for (const token of tokens) {
  const set = this.invertedIndex.get(token);
  if (!set) return [];  // ← No files have this token
  if (result === null) {
    result = new Set(set);
  } else {
    // Intersect: keep only files in both sets
    for (const path of result) {
      if (!set.has(path)) result.delete(path);
    }
  }
}
return result ? Array.from(result) : [];
```

### Concrete Example

Query: "machine learning" → tokens: ["machine", "learning"]

**Using getCandidatesUnion (current)**:
```
Files with "machine": {A, B, C, D, E}
Files with "learning": {D, E, F, G, H}
Result (UNION): {A, B, C, D, E, F, G, H}  ← 8 files (low precision)
```

**Using getCandidates (better)**:
```
Files with "machine": {A, B, C, D, E}
Files with "learning": {D, E, F, G, H}
Result (INTERSECTION): {D, E}  ← 2 files (higher precision)
```

### The Fix

In search.ts, line 153:
```typescript
// OLD:
const candidates = searchIndex.getCandidatesUnion(query);

// NEW: Use intersection semantics
const candidates = searchIndex.getCandidates(query);
```

This changes from OR semantics to AND semantics, making multi-term queries more precise.

---

## Issue #4: CJK Exact-Match-Only in Fuse.js

### The Problem

In lib/fs.ts, lines 712-715:

```typescript
const hasCJK = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(query);
const searchQuery = hasCJK ? `'${query}` : query;
// "知识" → "'知识"
// "machine" → "machine"
```

The single quote prefix forces **exact match mode** in Fuse.js.

### Concrete Example

**English query "machne" (typo)**:
- Fuse treats as fuzzy pattern
- Matches: "machine", "machinery", "machete"
- Works!

**Chinese query "知識" (Traditional form, wrong in Simplified context)**:
- Fuse treats as exact pattern `'知識`
- Matches: files containing exactly "知識"
- Does NOT match: "知识" (Simplified form)
- Fails!

### The Issue with Field Weights

Line 689-693:
```typescript
keys: [
  { name: 'fileName', weight: 0.3 },    // 30% weight
  { name: 'path', weight: 0.2 },        // 20% weight
  { name: 'content', weight: 0.5 },     // 50% weight
],
```

**Problem**: These are arbitrary and can't be adjusted per search.

Example:
- Query: "config"
- File "config.md" ranks first because fileName matches (0.3 weight)
- But you wanted config-related content, not the file named "config"
- No way to say "search content only"

### The Fix

Remove the exact-match forcing:

```typescript
const searchQuery = query;  // ← Remove the `'` prefix, use consistent fuzzy matching
```

If you want to preserve exact match as an option:
```typescript
// NEW: Let users opt-in to exact match with quotes
let searchQuery = query;
if (query.startsWith('"') && query.endsWith('"')) {
  searchQuery = `'${query.slice(1, -1)}`;  // ← Only if user explicitly quoted
}
```

---

## Issue #5: No Semantic Search

### Example: Conceptual Query Failure

**Your notes contain**:
```
file1.md: "系统设计的关键是模块化"
file2.md: "架构决策记录"
file3.md: "我们的架构采用微服务"
```

**You search**: "我上次讨论的系统架构方案"

**Query tokenization** (via Intl.Segmenter):
```
"我上次讨论的系统架构方案"
→ ["我", "上次", "讨论", "的", "系统", "架构", "方案"]
  (or with unigrams: ["我", "上", "次", "讨", "论", ...])
```

**BM25 Pre-scan**:
```
df("系统") = 1 (file1)
df("架构") = 2 (file2, file3)
df("方案") = 0 (no files!)
...
```

**Result**: 
- `getCandidatesUnion` returns {file1, file2, file3}
- BM25 scores them based on TF-IDF
- file2 ranks high (has "架构" twice, maybe)
- But you wanted file1 (about "系统设计")

**What happens**:
- Query has "系统架构方案"
- file1 has "系统设计" — both have "系统" but NOT "架构" or "方案"
- file2 has "架构决策" — has "架构" but NOT "系统" or "方案"
- file3 has "架构采用微服务" — has "架构" but NOT "系统" or "方案"
- Query is never found!

### What Vector Search Would Do

```
Query embedding: embed("我上次讨论的系统架构方案") → [0.2, 0.5, 0.1, ...]
file1 embedding: embed("系统设计的关键是模块化") → [0.19, 0.51, 0.09, ...]  ← Very close!
file2 embedding: embed("架构决策记录") → [0.3, 0.2, 0.8, ...]
file3 embedding: embed("我们的架构采用微服务") → [0.25, 0.4, 0.7, ...]

Cosine similarity:
  query vs file1: 0.99 (similar concepts!) ← Would rank first
  query vs file2: 0.45
  query vs file3: 0.52
```

### Why Not Currently Supported

1. **Requires external API**: OpenAI embeddings costs $$$
2. **Requires external processing**: Can't be fully local
3. **Requires vector index**: Need to store & search embeddings
4. **Privacy concern**: Send all notes to OpenAI?

### Quick Fix: Synonym Dictionary

Instead of semantic search, add a hardcoded synonym dictionary:

```typescript
// lib/core/search.ts, add:
const SYNONYMS: Record<string, string[]> = {
  '架构': ['架构', '系统设计', '设计', '方案'],
  '系统设计': ['系统设计', '架构', '设计'],
  'architecture': ['architecture', 'design', 'system design'],
  // ... more mappings
};

function expandQuery(query: string): string[] {
  const terms = splitQueryTerms(query);
  const expanded = new Set<string>();
  for (const term of terms) {
    expanded.add(term);
    if (SYNONYMS[term]) {
      SYNONYMS[term].forEach(syn => expanded.add(syn));
    }
  }
  return Array.from(expanded);
}

// Usage in searchFiles:
- const queryTerms = splitQueryTerms(query);
+ const queryTerms = expandQuery(query);
```

**Now query "系统架构" would also search for "设计方案"!**

---

## Issue #6: Agent Tool Ignores Filter Options

### The Problem

In lib/agent/tools.ts, line 356:

```typescript
execute: safeExecute(async (_id, params: Static<typeof QueryParam>) => {
  const results = searchFiles(params.query);  // ← No options!
  if (results.length === 0) return textResult('No results found.');
  return textResult(results.map(r => `- **${r.path}**: ${r.snippet}`).join('\n'));
}),
```

The `searchFiles` function has these options available (search.ts, line 135):

```typescript
export function searchFiles(mindRoot: string, query: string, opts: SearchOptions = {}): SearchResult[] {
  const { limit = 20, scope, file_type = 'all', modified_after } = opts;
  // ... can filter by scope, file_type, modification date
}
```

But the agent tool **never passes them!**

### Concrete Example

**Agent wants to search only in "Projects" directory**:
```typescript
// What agent tool currently does:
searchFiles(mindRoot, "bug")  // ← Searches ALL files

// What it SHOULD do:
searchFiles(mindRoot, "bug", { scope: "Projects/" })  // ← Scope to Projects
```

### The Fix

```typescript
// lib/agent/tools.ts, update QueryParam:
const QueryParam = Type.Object({
  query: Type.String({ description: 'Search query (case-insensitive)' }),
  scope: Type.Optional(Type.String({ description: 'Optional scope (e.g. "Projects/")' })),
  file_type: Type.Optional(Type.String({ description: 'Optional file type (e.g. "md")' })),
  limit: Type.Optional(Type.Number({ description: 'Number of results (default 20)' })),
});

// And in the tool execute:
execute: safeExecute(async (_id, params: Static<typeof QueryParam>) => {
  const results = searchFiles(getMindRoot(), params.query, {
    scope: params.scope,
    file_type: params.file_type,
    limit: params.limit,
  });
  // ... rest of code
}),
```

---

## Summary of Quick Fixes

| Issue | Severity | Fix | LOC |
|-------|----------|-----|-----|
| CJK tokenization mismatch | Medium | Use Intl.Segmenter in pre-scan | 5 |
| CJK bigram explosion | Medium | Only emit unigrams for single-char queries | 10 |
| UNION vs INTERSECTION | Low | Use getCandidates instead | 1 |
| CJK exact-match-only in Fuse.js | Medium | Remove `'` prefix | 1 |
| Missing filters in agent tool | Low | Pass options through | 10 |
| No synonym support | High | Add synonym dictionary | 20-50 |

**Total effort for all quick fixes**: ~1-2 hours

---

## Files to Modify

1. **app/lib/core/search.ts**
   - Line 209: Fix tokenization mismatch
   - Line 153: Use getCandidates instead of getCandidatesUnion

2. **app/lib/core/search-index.ts**
   - Lines 47-50: Optimize CJK tokenization (remove unigrams for multi-char queries)

3. **app/lib/fs.ts**
   - Line 713: Remove exact-match forcing for CJK

4. **app/lib/agent/tools.ts**
   - QueryParam: Add scope, file_type, limit options
   - Line 356: Pass options to searchFiles

5. **NEW: Synonym mapping** (could go in search.ts or new file)
   - Add SYNONYMS dictionary
   - Update expandQuery logic
