# MindOS Search Implementation - Deep Analysis

## Executive Summary

MindOS has a **dual-layer search architecture** that appears intentional but reveals significant design tensions:

1. **Backend BM25 Search** (`lib/core/search.ts` + `lib/core/search-index.ts`) - Used by MCP/REST API
2. **Frontend Fuse.js Search** (`lib/fs.ts`) - Used by browser ⌘K overlay

Both are **keyword-based literal searches**. Neither implements semantic/vector search. Both will fail on conceptual queries like "我上次讨论的架构方案" (a previous architecture discussion) when the exact keywords don't appear.

---

## File 1: `lib/core/search.ts` - BM25 Backend Search

### Implementation Details

**Location**: `app/lib/core/search.ts` (274 lines)

**Core Algorithm**: BM25 (Best Matching 25) scoring function
- **TF (Term Frequency)**: How often a term appears in a document, with saturation at k1=1.2
- **IDF (Inverse Document Frequency)**: `log((N - df + 0.5) / (df + 0.5) + 1)`
  - Rare terms get higher weight
  - Common terms (appearing in >50% of docs) still contribute (the +1 prevents negative IDF)
- **Document Length Normalization**: Parameter b=0.75 favors shorter documents
- **Multi-term queries**: Each term scored independently, then summed

**Search Flow** (`searchFiles` function):
1. Ensure index is built for the mindRoot (lazy load from disk or rebuild)
2. Split query into individual terms: `"架构 方案" → ["架构", "方案"]`
3. Use inverted index to get **UNION** of candidate files (any file matching ANY term)
4. Pre-scan candidates to compute document frequency (df) for each term
5. Score each candidate with BM25
6. Sort by score descending, return top 20

**Critical Issues**:
1. **Inverted Index Uses UNION**: Files matching ANY term are candidates (low precision)
2. **Tokenization Mismatch**: Index uses Intl.Segmenter, pre-scan uses substring matching
3. **CJK Bigram Explosion**: Query "机器学习" → 7 tokens, most files match at least one
4. **No Semantic Understanding**: Can't match synonyms (e.g., "架构" ≠ "系统设计")

---

## File 2: `lib/core/search-index.ts` - Inverted Index

### Implementation Details

**Core Data Structure**: Map<token, Set<filePath>>

**Tokenization** (handles both Latin and CJK):
- Latin: Words ≥2 chars (excludes single letters as noise)
- CJK: Uses Intl.Segmenter for word boundaries + individual characters as unigrams
- Fallback to bigrams if Intl.Segmenter unavailable

**Index Methods**:
- `getCandidates(query)` — INTERSECTION (AND semantics) — not used
- `getCandidatesUnion(query)` — UNION (OR semantics) + pruning for CJK explosion
- Pruning: If 3+ tokens, filters files matching <50% of tokens (unless it eliminates everything)

**Persistence**:
- Stored at `~/.mindos/search-index.json`
- Staleness checks: file count mismatch, mtime sampling
- Small indices: check all files; large indices: sample 50 + always last 10

**Critical Issues**:
1. **CJK Tokenization Creates Explosion**: "机器学习" → 7 tokens (bigrams + unigrams)
2. **Two Different Semantics**: `getCandidates` (AND) never called, `getCandidatesUnion` (OR) used instead
3. **MAX_CONTENT_LENGTH Mismatch**: Truncates at 50KB during indexing, but BM25 scoring uses full document length
4. **No Per-Field Weighting**: Candidates don't distinguish filename vs content matches

---

## File 3: `lib/fs.ts` - Frontend Fuse.js Search

### Implementation Details

**Algorithm**: Fuse.js (fuzzy matching library)
- Fuzzy matching: pattern can match with character skips
- Threshold: 0.4 (allows 60% character mutations)
- Field weights: fileName 0.3, path 0.2, content 0.5

**CJK Special Handling**:
```typescript
const searchQuery = hasCJK ? `'${query}` : query;
// CJK: Forced to exact match mode
// English: Fuzzy matching allowed
```

**Critical Issues**:
1. **Asymmetric CJK Treatment**: CJK queries forced to exact match, English queries fuzzy (bad UX)
2. **Loose Fuzzy Threshold**: "test" might match "teaspoon"
3. **Field Weights Are Arbitrary**: No way to adjust per-search (e.g., "search content only")
4. **Multiple Newlines Collapsed**: `\n\n` → " ↵ " (non-standard visual indicator)

### Design Comparison

| Aspect | Backend (BM25) | Frontend (Fuse.js) |
|--------|----------------|-------------------|
| **Match Type** | Exact substring | Fuzzy distance-based |
| **CJK Handling** | Word boundaries via Intl.Segmenter | Forced exact match |
| **Scoring** | TF-IDF + doc length | Character distance + field weights |
| **Persistence** | Yes (~/.mindos/search-index.json) | No (RAM only) |
| **Filters** | scope, file_type, modified_after | None |
| **Incremental Updates** | Yes (O(tokens-in-file)) | No (rebuilds all) |

---

## File 4: `lib/agent/tools.ts` - Tool Definitions

**Search Tool**:
```typescript
{
  name: 'search',
  execute: async (params) => {
    const results = searchFiles(params.query);  // No options!
    return textResult(results.map(r => `- **${r.path}**: ${r.snippet}`).join('\n'));
  }
}
```

**Issue**: Calls `searchFiles(query)` with NO OPTIONS
- Hardcoded limit = 20
- No scope, file_type, modified_after filtering
- Full-KB search only

---

## File 5: `skills/mindos/SKILL.md` - Search Rules

**Key Guidance**:
```markdown
- **NEVER search with a single keyword.** Fire 2-4 parallel searches (synonyms, abbreviations, Chinese/English variants).
```

**Implication**: The skill author acknowledges that single-keyword search has low precision.

---

## Critical Design Issues

### Issue #1: CJK Tokenization Mismatch (Medium Severity)

**Problem**: Inverted index uses `Intl.Segmenter`, but BM25 pre-scan uses substring matching
- Index tokenizes "知识管理" → ["知识", "管理"] (word-level)
- Pre-scan counts any file with substring "知" (character-level)
- Result: IDF scores are incorrect for CJK

**Fix**: Use Intl.Segmenter in both places

### Issue #2: CJK Exact-Match-Only in Fuse.js (Medium Severity)

**Problem**: English queries fuzzy-match, CJK queries don't
- "machne" matches "machine" (English typo tolerated)
- "知識" does NOT match "知识" (CJK typo intolerated)
- Asymmetry creates poor UX for multilingual users

**Fix**: Remove exact-match mode for CJK

### Issue #3: No Semantic/Synonym Search (HIGH Severity)

**Problem**: Can't find "system design" when searching for "架构" (architecture)
- Both terms mean the same concept but are different words
- BM25 is literal-term based: only matches exact substrings
- Fuse.js is character-distance based: can't understand synonyms

**Fix**: Add synonym dictionary or vector embeddings

### Issue #4: UNION Semantics for Inverted Index (Low Severity)

**Problem**: Multi-term queries use UNION (OR) instead of INTERSECTION (AND)
- Query "machine learning" returns files with EITHER term
- Could be hundreds of files in a large KB
- Less intuitive than AND semantics

**Fix**: Use `getCandidates()` (INTERSECTION) instead of `getCandidatesUnion()`

### Issue #5: Dual-Layer Architecture Creates Inconsistency (Medium Severity)

**Problem**: Two search systems with different algorithms and scoring
- ⌘K search (Fuse.js) ≠ CLI search (BM25)
- Users get different results from different interfaces
- Maintenance burden

**Fix**: Consolidate to one search algorithm

### Issue #6: Agent Search Tool Doesn't Use Filters (Low Severity)

**Problem**: `search` tool in agent tools ignores scope, file_type, modified_after options
- Only hardcoded global search with limit=20
- Agents can't narrow searches by directory or date

**Fix**: Pass options through to searchFiles()

---

## What Works Well

1. **BM25 Scoring**: Mathematically sound ranking algorithm
2. **CJK Support**: Intl.Segmenter for proper word boundaries (where used)
3. **Index Persistence**: Caches to ~/.mindos/, detects staleness
4. **Incremental Updates**: Files are re-indexed efficiently (O(tokens-in-file))
5. **File Watcher Integration**: Immediate cache invalidation on external changes
6. **Fuzzy Matching** (Fuse.js): Typo tolerance for interactive search

---

## What Doesn't Work

1. **Semantic Search**: No understanding of synonyms or concepts
2. **Vector Search**: No embeddings, no LLM integration
3. **Synonym Support**: Must search each term separately
4. **Consistent Behavior**: Backend ≠ Frontend search results
5. **Conceptual Queries**: "我上次讨论的架构方案" fails if exact words don't match

---

## Semantic/Vector Search Analysis

### Current Status: NONE

**Evidence**:
- No OpenAI API calls
- No Hugging Face models
- No vector embeddings
- No mention in code or docs

### Why Not Implemented

1. **Cost**: Vector embeddings require external APIs
2. **Privacy**: Data would need external processing
3. **Complexity**: Managing vector indices is hard
4. **Performance**: Vector search slower than keyword search

### Impact on Conceptual Queries

Example: "我上次讨论的架构方案" (a previous architecture discussion)

**What Happens**:
1. BM25 splits into tokens: ["我上次讨论", "的架构方案"] or bigrams
2. Searches for files containing exact substrings
3. If you previously wrote "系统设计" (system design), NO MATCH
4. Both mean "architecture" but are different Chinese words

**What Would Work**:
1. Synonym dictionary: map "架构" → ["architecture", "system design", "系统设计"]
2. Semantic search: use embeddings to find similar concepts
3. Manual tags: tag all architecture docs with #architecture

---

## Summary: Is MindOS Search Well-Designed?

### The Answer: Competent But Limited

**Works well for**:
- Exact keyword searches
- Recent file recall
- Fuzzy typo correction (⌘K only)

**Fails for**:
- Conceptual retrieval
- Synonym understanding
- Cross-lingual concepts

### Design Quality Assessment

| Aspect | Rating | Notes |
|--------|--------|-------|
| **Code Quality** | 7/10 | Well-structured, clear logic, but some bugs (tokenization mismatch) |
| **Feature Completeness** | 5/10 | Missing semantic search, synonyms, consistent behavior |
| **Performance** | 8/10 | Efficient incremental updates, good caching |
| **UX Consistency** | 5/10 | Two search systems create confusion |
| **Maintainability** | 6/10 | Duplication, some technical debt |
| **Documentation** | 7/10 | SKILL.md advises 2-4 parallel searches (workaround) |

**Overall**: 6.3/10 — Functional search, but feels incomplete

### Recommendations (Priority Order)

**Quick Wins (1-2 hours)**:
1. Fix CJK tokenization mismatch (use Intl.Segmenter in pre-scan)
2. Remove CJK exact-match mode in Fuse.js
3. Use INTERSECTION instead of UNION in BM25

**Medium Effort (4-8 hours)**:
4. Add synonym dictionary (hardcoded common synonyms)
5. Consolidate MAX_CONTENT_LENGTH constant
6. Pass filter options to agent search tool

**Long-term (weeks)**:
7. Vector search integration (OpenAI/Hugging Face)
8. Merge Fuse.js and BM25 into single algorithm
9. Manual tagging system for categorization
10. Search analytics to improve ranking

The biggest miss is **semantic understanding**. Without it, a knowledge base becomes a document repository that requires you to remember the exact terminology. Users should be able to search conceptually: "show me all discussions about making design decisions" and find related concepts even if the exact words differ.

