# MindOS Search Implementation - Executive Summary

## Quick Assessment

**MindOS search is COMPETENT but LIMITED.**

- ✅ Works well for exact keyword searches
- ✅ Good performance with incremental indexing
- ✅ Decent CJK support (where implemented)
- ❌ Cannot find conceptual/synonym matches
- ❌ Two search systems create inconsistency
- ❌ Asymmetric multilingual support (English fuzzy, CJK exact-only)

**Design Grade: 6.3/10**

---

## Architecture Overview

### Two Search Systems (Intentional)

**Backend: BM25** (lib/core/search.ts + lib/core/search-index.ts)
- Used by: MCP/CLI/REST API
- Algorithm: TF-IDF ranking with document length normalization
- Persistence: ~/.mindos/search-index.json
- Filters: scope, file_type, modified_after (unused by agent tool)
- Candidate selection: UNION (OR semantics)

**Frontend: Fuse.js** (lib/fs.ts)
- Used by: Browser ⌘K overlay
- Algorithm: Fuzzy character distance matching
- Persistence: RAM only (rebuilt on cache invalidation)
- Filters: None
- CJK handling: Forced to exact match (bad UX)

### Why Two Systems?

- Backend: Needs to be precise, stateless, filterable
- Frontend: Needs to be fast (interactive), typo-tolerant
- Trade-off: Maintainability vs specialized behavior

---

## Critical Issues (Severity × Impact)

### 🔴 HIGH SEVERITY

**No Semantic/Synonym Search**
- Users must know exact terminology used in KB
- Workaround: Query 2-4 synonyms in parallel (per SKILL.md)
- Impact: Fails on conceptual queries like "我上次讨论的架构方案"
- Fix: Add synonym dictionary (1-2 hours) or vector embeddings (weeks)

### 🟠 MEDIUM SEVERITY

**CJK Tokenization Mismatch**
- Index uses Intl.Segmenter, pre-scan uses substring matching
- Result: IDF scores slightly incorrect for CJK queries
- Impact: Ranking accuracy degraded for CJK
- Fix: Use Intl.Segmenter in both places (5 LOC, 30 min)

**CJK Exact-Match-Only in Fuse.js**
- English queries fuzzy-match, CJK queries don't
- Result: CJK users must type exactly right, no typo tolerance
- Impact: Poor UX for multilingual users
- Fix: Remove exact-match forcing (1 LOC, 5 min)

**CJK Bigram Explosion**
- Query "机器学习" produces 7 tokens (words + unigrams)
- Result: Massive candidate sets, low precision
- Impact: Slower search, more false positives
- Fix: Only emit unigrams for single-char queries (10 LOC, 30 min)

**Dual-Layer Architecture Creates Inconsistency**
- ⌘K search (Fuse.js) ≠ CLI search (BM25)
- Result: Users get different results from different interfaces
- Impact: Confusing for power users, maintenance burden
- Fix: Consolidate to one algorithm (days of work)

### 🟡 LOW SEVERITY

**UNION vs INTERSECTION Semantics**
- Current: Query "machine learning" searches for machine OR learning (low precision)
- Better: Search for machine AND learning (higher precision)
- Impact: Larger candidate sets, but BM25 still ranks correctly
- Fix: One-line change (1 LOC, 5 min)

**Agent Search Tool Ignores Filters**
- Tool only supports `searchFiles(query)`, not scope/file_type/date filters
- Impact: Agents can't narrow searches by directory or recency
- Fix: Pass through options (10 LOC, 15 min)

---

## What Works Well

| Feature | Status | Notes |
|---------|--------|-------|
| Keyword matching (exact) | ✅ | Case-insensitive substring match |
| BM25 ranking | ✅ | Mathematically sound |
| CJK word boundaries | ✅ | Via Intl.Segmenter (where used) |
| Index persistence | ✅ | ~/.mindos/, staleness checks |
| Incremental updates | ✅ | O(tokens-in-file), not O(all-files) |
| File watching | ✅ | Immediate cache invalidation |
| Fuzzy matching | ✅ | Fuse.js for typo tolerance (⌘K only) |
| PDF support | ✅ | pdfjs-dist extraction |

---

## What Doesn't Work

| Feature | Status | Notes |
|---------|--------|-------|
| Semantic search | ❌ | No embeddings, no LLM integration |
| Vector search | ❌ | No option for similarity-based retrieval |
| Synonym support | ❌ | Must search each term separately |
| Conceptual queries | ❌ | "Architecture discussion" ≠ "System design discussion" |
| Consistent behavior | ❌ | Different algorithms in backend vs frontend |
| Multilingual parity | ❌ | English fuzzy, CJK exact-only |
| Typo tolerance (BM25) | ❌ | Backend search is typo-intolerant |
| Field-specific search | ❌ | Can't search "content only" or "title only" |

---

## Root Cause Analysis

### Why No Semantic Search?

1. **Cost**: Vector embeddings require external APIs (OpenAI, Hugging Face)
2. **Privacy**: Can't process data locally; would need to send to external services
3. **Complexity**: Requires managing vector indices, approximate nearest neighbor search
4. **Performance**: Vector search slower than keyword search
5. **Design priority**: Focused on offline-first, local-first architecture

**Conclusion**: Intentional design choice, not an oversight. Semantic search is hard & expensive.

### Why Two Search Systems?

1. **Different use cases**: MCP needs filters, ⌘K needs speed
2. **Different algorithms**: BM25 is precise, Fuse.js is typo-tolerant
3. **Different tech**: One uses Node.js inverted index, one uses Fuse.js in browser
4. **Incremental evolution**: Probably added frontend search later without consolidating

**Conclusion**: Partly intentional, partly accidental evolution. Creates maintenance burden.

### Why UNION Semantics?

**Probably because**: 
- Wanted to be forgiving with multi-term queries
- If query "A B" returns nothing, show partial matches (A OR B)
- BM25 scoring fixes ranking anyway

**Downside**: Larger candidate sets, slower pre-scan

---

## Quick Wins (Rank by ROI)

### 1. Add Synonym Dictionary (1-2 hours, HIGH impact)

**Code**:
```typescript
const SYNONYMS: Record<string, string[]> = {
  '架构': ['架构', '系统设计', '设计', '方案'],
  'architecture': ['architecture', 'design', 'system design'],
  // ... more
};

function expandQuery(query: string): string[] {
  const terms = splitQueryTerms(query);
  const expanded = new Set<string>();
  for (const term of terms) {
    expanded.add(term);
    if (SYNONYMS[term]) SYNONYMS[term].forEach(syn => expanded.add(syn));
  }
  return Array.from(expanded);
}
```

**Impact**: Users can now search "架构" and find "系统设计" documents

### 2. Fix CJK Tokenization Mismatch (30 min, MEDIUM impact)

**File**: lib/core/search.ts, line 209

**Change**:
```typescript
// OLD: Uses substring matching
if (lower.includes(term)) {

// NEW: Use index's tokenization
const tokens = tokenize(content.toLowerCase());
if (tokens.has(term)) {
```

**Impact**: IDF scores more accurate for CJK queries

### 3. Remove CJK Exact-Match Mode in Fuse.js (5 min, MEDIUM impact)

**File**: lib/fs.ts, line 713

**Change**:
```typescript
// OLD:
const searchQuery = hasCJK ? `'${query}` : query;

// NEW:
const searchQuery = query;  // Consistent fuzzy matching
```

**Impact**: CJK users get typo tolerance in ⌘K search

### 4. Use INTERSECTION Instead of UNION (5 min, LOW impact)

**File**: lib/core/search.ts, line 153

**Change**:
```typescript
// OLD:
const candidates = searchIndex.getCandidatesUnion(query);

// NEW:
const candidates = searchIndex.getCandidates(query);
```

**Impact**: Smaller candidate sets, marginally faster

### 5. Optimize CJK Unigrams (30 min, MEDIUM impact)

**File**: lib/core/search-index.ts, lines 47-50

**Change**: Only emit unigrams for single-character queries

**Impact**: Fewer token explosion, better precision

### 6. Pass Filters to Agent Tool (15 min, LOW impact)

**File**: lib/agent/tools.ts

**Change**: Add scope, file_type, limit to QueryParam and pass through

**Impact**: Agents can narrow searches by directory

---

## Time & Effort Estimate

| Task | Time | Effort | ROI |
|------|------|--------|-----|
| Synonym dictionary | 1-2h | Medium | High |
| CJK tokenization fix | 0.5h | Low | Medium |
| Remove CJK exact-match | 0.1h | Trivial | Medium |
| Use INTERSECTION | 0.1h | Trivial | Low |
| Optimize CJK unigrams | 0.5h | Low | Medium |
| Pass filters to tool | 0.25h | Trivial | Low |
| **Total quick wins** | **2.5h** | **Low** | **High** |

---

## Long-term Roadmap

### Phase 1: Quick Wins (1 sprint, 3 hours)
- Add synonym dictionary
- Fix CJK issues (tokenization, exact-match, unigrams)
- Pass filters through agent tool

### Phase 2: Consolidation (2 sprints, 2 weeks)
- Merge Fuse.js and BM25 into single algorithm
- Test consistency across interfaces
- Document search behavior

### Phase 3: Semantic Search (1-2 months, optional)
- Evaluate: Synonym dictionary enough? Or need embeddings?
- If embeddings: Integrate OpenAI or Hugging Face
- Or: Manual tagging system (#architecture, #bug-fix, etc.)

### Phase 4: Analytics (ongoing)
- Track what users search for
- Track what they click on
- Refine ranking based on behavior

---

## Recommendations

### For Users

1. **Expect keyword-based retrieval**: Synonyms won't automatically match
2. **Use 2-4 parallel searches**: Per SKILL.md guidance for better recall
3. **Use tags/categories**: Manually organize by topic for conceptual grouping
4. **Check both ⌘K and CLI**: Results may differ between interfaces

### For Maintainers

1. **DO**: Add synonym dictionary (quick, high impact)
2. **DO**: Fix CJK inconsistencies (quick, improves UX)
3. **CONSIDER**: Consolidate to single search algorithm (reduces technical debt)
4. **CONSIDER**: Add vector search later (weeks of work, enables semantic retrieval)
5. **DON'T**: Spend time on micro-optimizations (search is already fast)

---

## Files Reviewed

1. **app/lib/core/search.ts** (274 lines)
   - BM25 scoring, document frequency pre-scan, snippet generation
   - Issues: UNION semantics, tokenization mismatch

2. **app/lib/core/search-index.ts** (493 lines)
   - Inverted index, CJK tokenization, index persistence
   - Issues: Bigram explosion, two query methods

3. **app/lib/fs.ts** (932 lines, search section: 639-775)
   - Fuse.js fuzzy search, CJK exact-match handling
   - Issues: Asymmetric CJK treatment, no filters

4. **app/lib/agent/tools.ts** (732 lines, search tool: 351-360)
   - Agent search tool definition
   - Issues: Ignores available filter options

5. **skills/mindos/SKILL.md** (225 lines)
   - Search rules: users must run 2-4 parallel searches
   - Implication: acknowledges low single-keyword precision

---

## Conclusion

**MindOS search is well-implemented but limited by design.**

The biggest miss is semantic/synonym understanding. A knowledge base should surface related concepts even if exact words differ. The workaround (2-4 parallel searches) works but defeats the purpose of automated retrieval.

**Quick wins** (2.5 hours) would significantly improve user experience:
- Synonym dictionary enables conceptual discovery
- CJK fixes improve multilingual UX consistency
- Filter pass-through enables more powerful agent searches

**Long-term goal**: Add semantic search (embeddings or manual tags) to truly unlock knowledge retrieval.

---

## Next Steps

1. **Review** this analysis with the team
2. **Prioritize** quick wins based on user pain points
3. **Allocate** 1 sprint (3 hours) to implement quick wins
4. **Measure** improvement in search satisfaction
5. **Plan** semantic search integration (weeks, optional)

