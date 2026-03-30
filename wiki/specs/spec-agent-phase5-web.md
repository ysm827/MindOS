# SPEC: Agent Phase 5 — Web Search + Web Fetch

> 让 Agent 能联网搜索和抓取网页内容，结果可直接写入知识库。

## 动机

MindOS Agent 当前只能操作本地知识库，无法获取外部信息。用户问"帮我查一下 X 最新进展"或"把这个网页内容整理到笔记里"时，Agent 无能为力。

OpenClaw 将 `web_search` + `web_fetch` 列为 Layer 1 核心工具（8 个之一），说明联网能力是 AI Agent 的**基线预期**。参考调研：`wiki/refs/openclaw-tools-inventory.md`。

### 用户场景

1. "帮我搜一下 MCP 协议最新的 spec 变化" → `web_search` → 摘要返回
2. "把这篇文章整理到我的笔记里" + URL → `web_fetch` → 提取正文 → `create_file`
3. "调研一下竞品 X 的定价" → `web_search` + `web_fetch` 组合使用
4. Agent 执行 Skill 时主动联网补充外部信息

## 设计决策

| 决策 | 选项 | 结论 |
|------|------|------|
| web_search 后端 | Brave API / Tavily / SearXNG 自建 / 多 provider | **Tavily 优先，Brave 备选**。Tavily 针对 AI Agent 优化（返回结构化摘要），有免费额度（1000 次/月）。后续可扩展多 provider |
| web_fetch 内容提取 | Readability + Turndown / Cheerio 手写 / Firecrawl API | **@mozilla/readability + turndown**。零 API 费用，与 OpenClaw 方案一致，成熟可靠 |
| web_fetch JS 渲染 | 纯 HTTP GET / headless browser | **纯 HTTP GET**。不启动浏览器，速度快资源省。JS 重度页面在 tool description 中说明局限性 |
| 搜索结果缓存 | 无缓存 / 内存缓存 / 文件缓存 | **内存缓存 15 分钟**。同一 query 短时间内不重复请求，用 Map + TTL |
| 安全限制 | 无限制 / 域名黑名单 / 域名白名单 | **黑名单**。屏蔽 private/internal hostname（防 SSRF：127.0.0.1、10.x、192.168.x 等）+ redirect 后二次检查 |
| 配置位置 | 环境变量 / settings.json / 两者 | **settings.json**（与 AI API key 同源）。`web.searchProvider` + `web.searchApiKey` + `web.fetchEnabled` |
| 工具归属 | 与 knowledgeBaseTools 合并 / 独立 webTools | **独立 `webTools` 对象**，在 route.ts 中 merge。职责清晰，可按配置开关 |
| 文件组织 | web.ts + web-tools.ts 分离 / 单文件 | **单文件 `web-tools.ts`**。总代码量 ~200 行，拆两文件过度；核心逻辑 + tool 定义放一起可读性更好 |
| 是否默认启用 | 默认开 / 默认关 | **web_fetch 默认开**（无需 API key），**web_search 默认关**（需配 API key 后启用） |
| System prompt 动态化 | 静态写入 / 按实际可用工具拼接 | **动态拼接**。route.ts 根据实际注入的 web tools 追加对应 prompt 段落，避免 Agent 调用不存在的工具 |

## 变更范围

### 5a. web_fetch 工具

**新增依赖**（`app/package.json`）：
```
@mozilla/readability   — Mozilla 正文提取（同 Firefox Reader View）
turndown               — HTML → Markdown 转换
linkedom               — 轻量 DOM 解析（Readability 需要 DOM 环境）
```

**新文件 `app/lib/agent/web-tools.ts`**（核心实现 + 工具定义合并为单文件）：

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { parseHTML } from 'linkedom';
import { logAgentOp } from './log';

// ─── Constants ──────────────────────────────────────────────────────

const USER_AGENT = 'Mozilla/5.0 (compatible; MindOS-Agent/1.0)';
const FETCH_TIMEOUT = 15_000;  // 15s
const MAX_HTML_BYTES = 5_000_000;  // 5MB
const MAX_OUTPUT_CHARS = 20_000;

// ─── SSRF protection ────────────────────────────────────────────────

const BLOCKED_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^\[::1\]$/,
  /\.local$/i,
  /\.internal$/i,
];

function isBlockedHost(hostname: string): boolean {
  return BLOCKED_PATTERNS.some(p => p.test(hostname));
}

/** Validate URL: protocol + hostname safety check */
function assertSafeUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Unsupported protocol: ${parsed.protocol}`);
  }
  if (isBlockedHost(parsed.hostname)) {
    throw new Error(`Blocked hostname: ${parsed.hostname}`);
  }
  return parsed;
}

// ─── webFetch core ──────────────────────────────────────────────────

async function webFetch(url: string, extractMode: 'markdown' | 'text' = 'markdown'): Promise<string> {
  assertSafeUrl(url);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    // redirect: 'manual' to inspect redirect target before following
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'manual',
    });

    // Handle redirects: check target URL safety before following
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      if (!location) throw new Error(`Redirect ${res.status} with no Location header`);
      const redirectUrl = new URL(location, url).href;
      assertSafeUrl(redirectUrl);  // ← second safety check on redirect target
      // Recurse with redirected URL (max depth handled by fetch timeout)
      return webFetch(redirectUrl, extractMode);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

    // Read body once, branch by content type
    const body = await res.text();
    const contentType = res.headers.get('content-type') ?? '';
    const isHtml = contentType.includes('text/html') || contentType.includes('application/xhtml');

    if (!isHtml) {
      return body.slice(0, MAX_OUTPUT_CHARS);
    }

    const html = body.slice(0, MAX_HTML_BYTES);
    const { document } = parseHTML(html);
    const reader = new Readability(document);
    const article = reader.parse();

    if (!article || !article.content) {
      return `[web_fetch] Could not extract readable content from ${url}. The page may require JavaScript.`;
    }

    if (extractMode === 'text') {
      return (article.textContent ?? '').slice(0, MAX_OUTPUT_CHARS);
    }

    const td = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' });
    let md = td.turndown(article.content);
    if (article.title) md = `# ${article.title}\n\n${md}`;
    return md.slice(0, MAX_OUTPUT_CHARS);
  } finally {
    clearTimeout(timer);
  }
}

// ─── web_fetch tool definition ──────────────────────────────────────

export const webFetchTool = tool({
  description:
    'Fetch a web page and extract its main content as Markdown. ' +
    'Use this to read articles, documentation, blog posts, etc. ' +
    'Does NOT execute JavaScript — for JS-heavy SPAs the content may be incomplete. ' +
    'Returns up to 20,000 characters of extracted content.',
  inputSchema: z.object({
    url: z.string().url().describe('Full URL to fetch (must be http/https)'),
    extract_mode: z.enum(['markdown', 'text']).default('markdown')
      .describe('"markdown" (default) for formatted content, "text" for plain text'),
  }),
  execute: async ({ url, extract_mode }) => {
    const ts = new Date().toISOString();
    try {
      const result = await webFetch(url, extract_mode);
      logAgentOp({ ts, tool: 'web_fetch', params: { url, extract_mode }, result: 'ok', message: `Fetched ${url} (${result.length} chars)` });
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logAgentOp({ ts, tool: 'web_fetch', params: { url, extract_mode }, result: 'error', message: msg });
      return `Error: ${msg}`;
    }
  },
});
```

### 5b. web_search 工具

**实现**（`app/lib/agent/web-tools.ts` 追加）：

```typescript
// ─── Search ─────────────────────────────────────────────────────────

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

// In-memory cache: query → { results, expiry }
// Always cache max results (10), slice on retrieval to support varying count
const searchCache = new Map<string, { results: WebSearchResult[]; expiry: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function getCached(query: string): WebSearchResult[] | null {
  const entry = searchCache.get(query);
  if (!entry) return null;
  if (Date.now() > entry.expiry) { searchCache.delete(query); return null; }
  return entry.results;
}

function setCache(query: string, results: WebSearchResult[]) {
  searchCache.set(query, { results, expiry: Date.now() + CACHE_TTL });
  if (searchCache.size > 100) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
}

async function webSearch(
  query: string,
  count: number,
  apiKey: string,
  provider: 'tavily' | 'brave' = 'tavily',
): Promise<WebSearchResult[]> {
  const cached = getCached(query);
  if (cached) return cached.slice(0, count);

  // Always fetch max 10 results to make cache reusable across different count values
  const fetchCount = 10;
  let results: WebSearchResult[];

  if (provider === 'tavily') {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: fetchCount,
        include_answer: false,
        search_depth: 'basic',
      }),
    });
    if (!res.ok) throw new Error(`Tavily API error: ${res.status} ${res.statusText}`);
    const data = await res.json();
    results = (data.results ?? []).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.content ?? '',
      score: r.score,
    }));
  } else {
    // Brave Search API
    const params = new URLSearchParams({ q: query, count: String(fetchCount) });
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      headers: { 'X-Subscription-Token': apiKey, 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`Brave API error: ${res.status} ${res.statusText}`);
    const data = await res.json();
    results = (data.web?.results ?? []).map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      snippet: r.description ?? '',
    }));
  }

  setCache(query, results);
  return results.slice(0, count);
}
```

**工具定义**（`app/lib/agent/web-tools.ts` 追加）：

```typescript
// web_search is created dynamically (needs apiKey from settings)
export function createWebSearchTool(apiKey: string, provider: 'tavily' | 'brave') {
  return tool({
    description:
      'Search the web for current information. Returns titles, URLs, and snippets. ' +
      'Use this when the user asks about recent events, external documentation, ' +
      'or anything not in the knowledge base. ' +
      'Combine with web_fetch to get full page content from result URLs.',
    inputSchema: z.object({
      query: z.string().describe('Search query'),
      count: z.number().min(1).max(10).default(5)
        .describe('Number of results to return (1-10, default 5)'),
    }),
    execute: async ({ query, count }) => {
      const ts = new Date().toISOString();
      try {
        const results = await webSearch(query, count, apiKey, provider);
        if (results.length === 0) {
          logAgentOp({ ts, tool: 'web_search', params: { query, count }, result: 'ok', message: 'No results' });
          return 'No results found.';
        }
        const formatted = results.map((r, i) =>
          `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.snippet}`
        ).join('\n\n');
        logAgentOp({ ts, tool: 'web_search', params: { query, count }, result: 'ok', message: `${results.length} results` });
        return formatted;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        logAgentOp({ ts, tool: 'web_search', params: { query, count }, result: 'error', message: msg });
        return `Error: ${msg}`;
      }
    },
  });
}
```

### 5c. 配置扩展

**`app/lib/settings.ts`** — `ServerSettings` 新增：

```typescript
export interface WebConfig {
  searchProvider?: 'tavily' | 'brave';  // default 'tavily'
  searchApiKey?: string;                 // API key for search provider
  fetchEnabled?: boolean;                // default true (no API key needed)
}

export interface ServerSettings {
  // ... existing fields ...
  web?: WebConfig;
}
```

**`app/components/settings/AiTab.tsx`** — 新增 "Web Tools" 配置区：

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `web.fetchEnabled` | boolean | `true` | 启用 web_fetch（无需 API key） |
| `web.searchProvider` | select | `tavily` | 搜索引擎：Tavily / Brave |
| `web.searchApiKey` | password | `''` | 搜索 API Key（为空时 web_search 不可用） |

### 5d. route.ts 集成

```typescript
// In POST handler, after knowledgeBaseTools:
const webSettings = serverSettings.web ?? {};
const allTools: Record<string, any> = { ...knowledgeBaseTools };

// web_fetch: enabled by default, no API key needed
if (webSettings.fetchEnabled !== false) {
  allTools.web_fetch = web_fetch;
}

// web_search: only enabled when API key is configured
if (webSettings.searchApiKey) {
  const provider = webSettings.searchProvider ?? 'tavily';
  allTools.web_search = createWebSearchTool(webSettings.searchApiKey, provider);
}

// Pass allTools to streamText
const result = streamText({
  // ...
  tools: allTools,
  // ...
});
```

### 5e. System Prompt 动态拼接（`route.ts` + `prompt.ts`）

在 `prompt.ts` 中新增 prompt 片段常量（不写入主 AGENT_SYSTEM_PROMPT）：

```typescript
export const WEB_FETCH_PROMPT = `
Web fetch tool:
- web_fetch: Fetch and extract main content from a URL as Markdown. Use when:
  • User provides a URL and asks to summarize or save it
  • You need full page content after finding it via web_search
  • User asks to "read this page" or "save this article"
- Does NOT execute JavaScript. For JS-heavy SPAs, content may be incomplete.
- Always cite the source URL when presenting fetched content.
`;

export const WEB_SEARCH_PROMPT = `
Web search tool:
- web_search: Search the internet for current information. Use when:
  • User asks about recent events, external projects, pricing, documentation
  • Knowledge base doesn't contain the needed information
  • User explicitly asks to "search" or "look up" something
- Combine web_search → web_fetch → create_file to research and save findings to the knowledge base.
- Do NOT use web tools when the answer is already in the knowledge base.
- Always cite the source URL when presenting web search results.
`;
```

在 `route.ts` 中，根据实际注入的工具动态拼接：

```typescript
// After building allTools:
if (allTools.web_fetch) promptParts.push(WEB_FETCH_PROMPT);
if (allTools.web_search) promptParts.push(WEB_SEARCH_PROMPT);
```

这样 Agent 永远不会看到不存在的工具的使用说明。

### 5f. ToolCallBlock 图标（`ToolCallBlock.tsx`）

新增两个工具的 emoji mapping：

```typescript
const TOOL_ICONS: Record<string, string> = {
  // ... existing 16 tools ...
  web_search: '🔍',
  web_fetch: '🌐',
};
```

### 5g. Context 管理适配（`context.ts`）

`truncateToolOutputs` 中新增 web 工具的截断策略：

| Tool | 截断阈值 | 理由 |
|------|----------|------|
| `web_search` | 500 chars | 搜索结果列表，历史轮只需知道搜了什么 |
| `web_fetch` | 2000 chars | 网页正文有上下文价值，但全文太长 |

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `app/package.json` | 修改 | 新增 `@mozilla/readability` + `turndown` + `linkedom` |
| `app/lib/agent/web-tools.ts` | **新建** | webFetch + webSearch 核心实现 + tool 定义 + createWebSearchTool() |
| `app/lib/agent/index.ts` | 修改 | barrel export web-tools |
| `app/lib/settings.ts` | 修改 | 新增 WebConfig interface + defaults |
| `app/app/api/ask/route.ts` | 修改 | 读取 web 配置，条件注入 web tools，动态拼接 web prompt |
| `app/lib/agent/prompt.ts` | 修改 | 新增 WEB_FETCH_PROMPT / WEB_SEARCH_PROMPT 常量（不改主 prompt） |
| `app/components/ask/ToolCallBlock.tsx` | 修改 | 新增 web_search / web_fetch 图标 |
| `app/lib/agent/context.ts` | 修改 | web 工具的 truncate 策略 |
| `app/components/settings/AiTab.tsx` | 修改 | 新增 Web Tools 配置表单 |

## 已知限制

1. **DNS rebinding 未防御**：SSRF 防护仅检查 hostname 字符串，恶意 DNS 解析（如 `evil.com → 127.0.0.1`）无法拦截。完整防御需在 Node.js 层 hook DNS resolver 或使用 `dns.lookup()` 预检，复杂度高，标记为后续增强。
2. **redirect 深度无限制**：递归跟随 redirect 理论上可被 DoS。实际受 `FETCH_TIMEOUT` 15s 限制兜底，但应考虑加 `maxRedirects` 计数器（建议 5 次）。

## 不做的事

- **多 provider 自动检测**：Phase 5 只支持 Tavily + Brave 二选一，不做 OpenClaw 那样的 6 provider fallback chain
- **浏览器自动化**：需要 headless Chrome，复杂度高，单独 Phase
- **搜索结果自动存入知识库**：Agent 可以通过 web_search → create_file 手动完成，不做隐式存储
- **付费搜索 quota 管理**：不做用量追踪 / 限额警告，用户自行管理 API 额度

## 依赖关系

- 依赖 Phase 1（工具定义模式 + logged wrapper + ToolCallBlock）✅ 已完成
- 依赖 Phase 3（truncateToolOutputs 机制）✅ 已完成
- 依赖 Phase 4（Settings UI AiTab）✅ 已完成
- 无阻塞依赖，可独立实施

## 验收标准

- [ ] `web_fetch` 可抓取公开网页，返回 Markdown 正文（标题 + 内容）
- [ ] `web_fetch` 对 private IP / localhost 返回 blocked 错误
- [ ] `web_fetch` 非 HTML 页面（PDF URL、JSON API）返回 raw text
- [ ] `web_search` 配置 Tavily API key 后返回结构化搜索结果
- [ ] `web_search` 未配置 API key 时不出现在工具列表中
- [ ] `web_fetch` 默认启用，Settings 中可关闭
- [ ] Settings → Web Tools 区可配置 provider / API key / fetch 开关
- [ ] Agent 可组合使用：`web_search` → 用 URL → `web_fetch` → `create_file` 存入知识库
- [ ] ToolCallBlock 中 web 工具显示对应图标
- [ ] 同一 query 15 分钟内命中缓存，不重复请求
- [ ] 历史轮中 web 工具输出被截断（search 500, fetch 2000 chars）
- [ ] `tsc --noEmit` 和 `next build` 通过
